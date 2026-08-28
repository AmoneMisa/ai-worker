import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { log } from './util/logger.js';
import { startQueue, closeQueue, queueStats } from './queue/queue.js';
import { memoryStats } from './cache/memory.js';
import { analyzePhotos } from './services/vision.js';
import { PUBLIC_EXTRACTION_KINDS } from './services/extract.js';
import { executeJob } from './application/job-handler.js';
import { submitExtraction, readExtractionResult } from './application/extraction.js';
import { evaluateHealth } from './application/health.js';
import { metrics, snapshot } from './util/metrics.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function authorized(value) {
  if (!config.apiKey) return true;
  const supplied = Buffer.from(String(value || ''));
  const expected = Buffer.from(config.apiKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

app.use('/ai', (req, res, next) => {
  if (!authorized(req.get('x-ai-key'))) return res.status(401).json({ error: 'unauthorized' });
  next();
});

const TEXT_PROVIDER_API_KEYS = {
  groq: 'groqApiKey',
  gemini: 'geminiApiKey',
  nvidia: 'nvidiaApiKey',
  huggingface: 'huggingfaceApiKey',
  llm7: 'llm7ApiKey',
  openrouter: 'openrouterApiKey',
  mistral: 'mistralApiKey',
};

app.get('/health', asyncRoute(async (_req, res) => {
  const textProvidersConfigured = config.textProviders.some((provider) => Boolean(config[TEXT_PROVIDER_API_KEYS[provider]]));
  const health = evaluateHealth({
    enabled: config.enabled,
    textEnabled: config.textEnabled,
    textProvidersConfigured,
  });
  res.json({
    ok: health.ok,
    enabled: config.enabled,
    text: config.textEnabled,
    textProviders: config.textProviders,
    vision: config.visionEnabled,
    visionProviders: config.visionProviders,
    executor: queueStats(),
    cache: memoryStats(),
  });
}));

app.get('/ready', (_req, res) => {
  const executor = queueStats();
  const ready = !config.enabled || !config.textEnabled || (executor.started && !executor.stopping);
  res.status(ready ? 200 : 503).json({
    ok: ready,
    accepting: executor.accepting,
    executor,
    cache: memoryStats(),
  });
});

app.get('/metrics', (_req, res) => {
  res.json(snapshot({ cache: memoryStats(), queue: queueStats() }));
});

app.post('/ai/vision', asyncRoute(async (req, res) => {
  if (!config.enabled || !config.visionEnabled) return res.json({ status: 'disabled' });
  const { images } = req.body || {};
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'images must be a non-empty array' });
  if (images.length > config.maxPhotosPerListing) {
    return res.status(400).json({ error: `maximum ${config.maxPhotosPerListing} images per listing` });
  }
  try {
    const result = await analyzePhotos(images);
    metrics.imageCount += images.length;
    metrics.succeeded += 1;
    return res.json({ status: 'completed', ...result });
  } catch (error) {
    metrics.failed += 1;
    log.warn('vision analysis failed', { error: error.message });
    return res.status(503).json({ status: 'failed', error: 'vision providers unavailable' });
  }
}));

app.post('/ai/extract', asyncRoute(async (req, res) => {
  if (!config.enabled || !config.textEnabled) return res.json({ status: 'disabled' });
  const { kind, rawText, knownFacts, meta } = req.body || {};
  if (!PUBLIC_EXTRACTION_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be ${PUBLIC_EXTRACTION_KINDS.join('|')}` });
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

  const result = await submitExtraction({
    kind,
    rawText,
    knownFacts: knownFacts || {},
    meta: meta || {},
  });
  const { httpStatus = 200, ...body } = result;
  return res.status(httpStatus).json(body);
}));

app.get('/ai/result/:key', asyncRoute(async (req, res) => {
  if (!/^(apartment|vacancy|candidate|translation|photo)-[a-f0-9]{32}$/.test(req.params.key)) {
    return res.status(400).json({ error: 'invalid key' });
  }
  res.json(await readExtractionResult(req.params.key));
}));

app.use((err, _req, res, _next) => {
  log.error('http error', { code: err.code, error: err.message });
  const status = Number(err.status) >= 400 && Number(err.status) <= 599 ? Number(err.status) : 500;
  res.status(status).json({ error: status === 500 ? 'internal' : err.code || 'unavailable' });
});

const server = app.listen(config.port, () => {
  log.info('ai-worker listening', { port: config.port, enabled: config.enabled });
  if (config.enabled && config.textEnabled) startQueue(executeJob);
  else log.warn('AI disabled — executor not started (deterministic parsers only)');
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info('shutting down', { signal });
  server.close();
  await closeQueue();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
