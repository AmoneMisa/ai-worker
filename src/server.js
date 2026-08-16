import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { log } from './util/logger.js';
import { extractionKey, normalizeText } from './util/hash.js';
import { redactContacts } from './util/privacy.js';
import { getResult } from './cache/cache.js';
import { enqueue, aiQueue } from './queue/queue.js';
import { startWorker } from './queue/worker.js';
import { ollamaHealthy } from './ollama/client.js';
import { metrics, snapshot } from './util/metrics.js';
import { cacheRedis } from './redis.js';

const app = express();
app.use(express.json({ limit: '512kb' }));

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function authorized(value) {
  if (!config.apiKey) return true;
  const supplied = Buffer.from(String(value || ''));
  const expected = Buffer.from(config.apiKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// The port is loopback/private-network only, and an optional shared key adds a
// second boundary for deployments where multiple compose projects share ai-net.
app.use('/ai', (req, res, next) => {
  if (!authorized(req.get('x-ai-key'))) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// Health (spec §31): reports whether Ollama is reachable, but the service itself
// is "up" regardless so the apps can tell AI-available from AI-unavailable.
app.get('/health', asyncRoute(async (_req, res) => {
  res.json({
    ok: true,
    enabled: config.enabled,
    ai: config.enabled ? await ollamaHealthy() : false,
    redis: cacheRedis.status === 'ready',
    model: config.model,
  });
}));

app.get('/ready', (_req, res) => {
  const ready = !config.enabled || cacheRedis.status === 'ready';
  res.status(ready ? 200 : 503).json({ ok: ready, redis: cacheRedis.status });
});

app.get('/metrics', (_req, res) => res.json(snapshot()));

// Submit text for enrichment. Returns a cached result immediately if we've seen
// this exact input before, otherwise enqueues and returns { status: 'pending' }.
// The caller polls /ai/result/:key (or picks it up on its next refresh).
app.post('/ai/extract', asyncRoute(async (req, res) => {
  if (!config.enabled || !config.textEnabled) return res.json({ status: 'disabled' });
  const { kind, rawText, knownFacts, meta } = req.body || {};
  if (!['apartment', 'vacancy', 'translation'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be apartment|vacancy|translation' });
  }
  if (!rawText || typeof rawText !== 'string') return res.status(400).json({ error: 'missing rawText' });
  if (rawText.length > config.maxTextChars) {
    return res.status(413).json({ error: `rawText exceeds ${config.maxTextChars} characters` });
  }
  if (knownFacts != null && (typeof knownFacts !== 'object' || Array.isArray(knownFacts))) {
    return res.status(400).json({ error: 'knownFacts must be an object' });
  }
  if (meta != null && (typeof meta !== 'object' || Array.isArray(meta))) {
    return res.status(400).json({ error: 'meta must be an object' });
  }

  const key = extractionKey(kind, rawText, knownFacts || {});
  const cached = await getResult(key);
  if (cached) {
    metrics.cacheHits += 1;
    return res.json({ key, cached: true, ...cached });
  }
  // Translation must preserve the complete original description. Extraction
  // jobs still redact contact details because those fields are deterministic.
  const promptText = kind === 'translation'
    ? normalizeText(rawText)
    : redactContacts(normalizeText(rawText));
  await enqueue(kind, key, { text: promptText, knownFacts: knownFacts || {}, meta: meta || {} });
  res.json({ status: 'pending', key });
}));

app.get('/ai/result/:key', asyncRoute(async (req, res) => {
  if (!/^(apartment|vacancy|translation)-[a-f0-9]{32}$/.test(req.params.key)) {
    return res.status(400).json({ error: 'invalid key' });
  }
  const cached = await getResult(req.params.key);
  if (cached) return res.json({ key: req.params.key, ...cached });
  const job = await aiQueue.getJob(req.params.key);
  if (job) {
    const state = await job.getState();
    return res.json({ key: req.params.key, status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'pending' });
  }
  res.json({ key: req.params.key, status: 'not_found' });
}));

app.use((err, _req, res, _next) => {
  log.error('http error', { error: err.message });
  res.status(500).json({ error: 'internal' });
});

let worker;
const server = app.listen(config.port, () => {
  log.info('ai-worker listening', { port: config.port, enabled: config.enabled });
  if (config.enabled && config.textEnabled) worker = startWorker();
  else log.warn('AI disabled — worker not started (deterministic parsers only)');
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  server.close();
  await Promise.allSettled([
    worker?.close(),
    aiQueue.close(),
    cacheRedis.quit(),
  ]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
