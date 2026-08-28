import { extractionKey, normalizeText } from '../util/hash.js';
import { redactContacts } from '../util/privacy.js';
import { getResult, setResult } from '../cache/cache.js';
import { enqueue, getJobStatus } from '../queue/queue.js';
import { extract } from '../services/extract.js';
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
      // Keep translation synchronous for interactive UI calls (bypassing the
      // queue) instead of routing it through the async pipeline, preserving
      // today's low-latency interactive path.
      const extracted = await extract('translation', { text: normalizedText, knownFacts, meta });
      const totalMs = extracted.timings?.totalMs || 0;
      recordJobTiming('translation', { ollamaMs: 0, totalMs });
      metrics.succeeded += 1;
      const now = new Date().toISOString();
      const stored = await setResult(key, {
        status: 'completed',
        kind,
        data: extracted.data,
        confidence: extracted.confidence,
        lowConfidence: extracted.lowConfidence,
        provider: extracted.provider,
        timings: {
          ...extracted.timings,
          queueWaitMs: 0,
          queuedAt: now,
          startedAt: now,
          finishedAt: new Date().toISOString(),
          totalWithQueueMs: totalMs,
        },
      });
      return { key, cached: false, ...stored };
    } catch (error) {
      log.warn('translation providers unavailable', { code: error?.code, msg: error?.message });
      return { status: 'failed', key, error: 'translation providers unavailable', httpStatus: 503 };
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
