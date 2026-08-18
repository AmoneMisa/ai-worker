import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { log } from './util/logger.js';
import { extractionKey, normalizeText } from './util/hash.js';
import { redactContacts } from './util/privacy.js';
import { getResult, setResult } from './cache/cache.js';
import { enqueue, aiQueue } from './queue/queue.js';
import { startWorker } from './queue/worker.js';
import { ollamaHealthy } from './ollama/client.js';
import { requestTranslation, translatorHealthy } from './services/translator.js';
import { analyzePhotos } from './services/vision.js';
import { metrics, snapshot, recordJobTiming } from './util/metrics.js';
import { cacheRedis } from './redis.js';

const app = express();
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

app.get('/health', asyncRoute(async (_req, res) => {
  const [ai, translator] = await Promise.all([
    config.enabled ? ollamaHealthy() : false,
    translatorHealthy(),
  ]);
  res.json({
    ok: true,
    enabled: config.enabled,
    ai,
    translator,
    vision: config.visionEnabled,
    visionProviders: config.visionProviders,
    redis: cacheRedis.status === 'ready',
    model: config.model,
    translationModel: 'facebook/m2m100_418M',
  });
}));

app.get('/ready', (_req, res) => {
  const ready = !config.enabled || cacheRedis.status === 'ready';
  res.status(ready ? 200 : 503).json({ ok: ready, redis: cacheRedis.status });
});

app.get('/metrics', (_req, res) => res.json(snapshot()));

// Remote photo enrichment. Images may be public URLs or data:image/... URLs.
// The provider chain is synchronous and intentionally outside BullMQ/Ollama, so
// photo analysis cannot block Qwen text parsing. Results are cached by photo set.
app.post('/ai/vision', asyncRoute(async (req, res) => {
  if (!config.enabled || !config.visionEnabled) return res.json({ status: 'disabled' });
  const { images } = req.body || {};
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'images must be a non-empty array' });
  if (images.length > config.maxPhotosPerListing) {
    return res.status(400).json({ error: `maximum ${config.maxPhotosPerListing} images per listing` });
  }
  try {
    const result = await analyzePhotos(images);
    metrics.imageCount += 1;
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

  const facts = knownFacts || {};
  const key = extractionKey(kind, rawText, facts);
  const cached = await getResult(key);
  if (cached) {
    metrics.cacheHits += 1;
    return res.json({ key, cached: true, ...cached });
  }

  const normalizedText = normalizeText(rawText);
  if (kind === 'translation') {
    const targetLanguage = facts.targetLanguage;
    try {
      const translated = await requestTranslation(normalizedText, targetLanguage);
      const totalMs = translated.timings?.roundTripMs || translated.timings?.totalMs || 0;
      recordJobTiming('translation', { ollamaMs: 0, totalMs });
      metrics.succeeded += 1;
      const now = new Date().toISOString();
      const stored = await setResult(key, {
        status: 'completed',
        kind,
        data: translated.data,
        confidence: translated.data.confidence,
        lowConfidence: false,
        engine: translated.engine,
        model: 'facebook/m2m100_418M',
        timings: {
          ...translated.timings,
          queueWaitMs: 0,
          queuedAt: now,
          startedAt: now,
          finishedAt: new Date().toISOString(),
          totalWithQueueMs: totalMs,
        },
      });
      return res.json({ key, cached: false, ...stored });
    } catch (error) {
      log.warn('dedicated translation unavailable', { code: error?.code, msg: error?.message });
      if (!config.translationFallbackToQwen) {
        return res.status(503).json({ status: 'failed', key, error: 'translation service unavailable' });
      }
      await enqueue(kind, key, { text: normalizedText, knownFacts: facts, meta: meta || {} });
      return res.json({ status: 'pending', key, fallback: 'qwen' });
    }
  }

  const promptText = redactContacts(normalizedText);
  await enqueue(kind, key, { text: promptText, knownFacts: facts, meta: meta || {} });
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
    if (state === 'completed') {
      const retained = job.returnvalue;
      if (retained?.status === 'completed' && retained?.data) return res.json({ key: req.params.key, ...retained });
      const { kind, key, input } = job.data || {};
      if (kind && key && input) {
        await job.remove();
        await enqueue(kind, key, input);
        return res.json({ key: req.params.key, status: 'pending' });
      }
      return res.json({ key: req.params.key, status: 'failed', error: 'completed result is unavailable' });
    }
    if (state === 'failed') return res.json({ key: req.params.key, status: 'failed', error: job.failedReason || 'AI job failed' });
    return res.json({ key: req.params.key, status: 'pending' });
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
  await Promise.allSettled([worker?.close(), aiQueue.close(), cacheRedis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
