import { config } from '../config.js';
import { extractionKey, normalizeText } from '../util/hash.js';
import { redactContacts } from '../util/privacy.js';
import { getResult, setResult } from '../cache/cache.js';
import { enqueue, getJobStatus } from '../queue/queue.js';
import { requestTranslation } from '../services/translator.js';
import { metrics, recordJobTiming } from '../util/metrics.js';
import { log } from '../util/logger.js';

export async function submitExtraction({ kind, rawText, knownFacts = {}, meta = {} }) {
  const key = extractionKey(kind, rawText, knownFacts);
  const cached = await getResult(key);
  if (cached) {
    metrics.cacheHits += 1;
    return { key, cached: true, ...cached };
  }

  const normalizedText = normalizeText(rawText);
  if (kind === 'translation') {
    try {
      const translated = await requestTranslation(normalizedText, knownFacts.targetLanguage);
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
      return { key, cached: false, ...stored };
    } catch (error) {
      log.warn('dedicated translation unavailable', { code: error?.code, msg: error?.message });
      if (!config.translationFallbackToQwen) {
        return { status: 'failed', key, error: 'translation service unavailable', httpStatus: 503 };
      }
      await enqueue(kind, key, { text: normalizedText, knownFacts, meta });
      return { status: 'pending', key, fallback: 'qwen' };
    }
  }

  await enqueue(kind, key, {
    text: redactContacts(normalizedText),
    knownFacts,
    meta,
  });
  return { status: 'pending', key };
}

export async function readExtractionResult(key) {
  const cached = await getResult(key);
  if (cached) return { key, ...cached };

  const job = getJobStatus(key);
  if (!job) return { key, status: 'not_found' };
  if (job.state === 'completed' && job.result) return { key, ...job.result };
  if (job.state === 'failed') return { key, status: 'failed', error: job.error || 'AI job failed' };
  return { key, status: 'pending' };
}
