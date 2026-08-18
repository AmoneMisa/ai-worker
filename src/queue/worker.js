import { Worker } from 'bullmq';
import { makeConnection } from '../redis.js';
import { config } from '../config.js';
import { QUEUE_NAME } from './queue.js';
import { extract } from '../services/extract.js';
import { setResult } from '../cache/cache.js';
import { metrics, recordJobTiming, recordQueueWait, recordText } from '../util/metrics.js';
import { log } from '../util/logger.js';

// Single worker, concurrency = AI_CONCURRENCY (1 on CPU). This is the choke point
// that guarantees only one inference runs at a time (spec §3/§32).
export function startWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      metrics.processing += 1;
      const startedAtMs = Date.now();
      const queuedAtMs = job.timestamp || startedAtMs;
      const queueWaitMs = Math.max(0, startedAtMs - queuedAtMs);
      const kind = job.data?.kind || job.name || 'unknown';
      recordQueueWait(queueWaitMs, kind);
      try {
        if (job.name === 'photo') {
          // Phase 4 (vision) — not implemented in this scaffold.
          throw Object.assign(new Error('IMAGE_NOT_IMPLEMENTED'), { code: 'IMAGE_NOT_IMPLEMENTED' });
        }
        const { key, input } = job.data;
        const result = await extract(kind, input);
        const finishedAtMs = Date.now();
        const processMs = Math.max(0, finishedAtMs - startedAtMs);
        const totalMs = Math.max(0, finishedAtMs - queuedAtMs);
        const ollamaDurationMs = result.timings?.ollamaDurationMs ?? result.timings?.totalMs ?? 0;
        recordText(result.timings?.totalMs || 0);
        recordJobTiming(kind, { ollamaMs: ollamaDurationMs, totalMs });
        const timings = {
          ...(result.timings || {}),
          queueWaitMs,
          processMs,
          totalWithQueueMs: totalMs,
          queuedAt: new Date(queuedAtMs).toISOString(),
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
        };
        const stored = await setResult(key, { status: 'completed', kind, ...result, timings });
        metrics.succeeded += 1;
        // Keep the complete payload in BullMQ as a second durable result path.
        // If the short-lived cache key is missing during a poll (restart, manual
        // cache cleanup, or TTL race), callers can still receive the translation
        // instead of seeing `completed` with no data forever.
        return stored;
      } finally {
        metrics.processing -= 1;
      }
    },
    { connection: makeConnection(), concurrency: config.concurrency },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    if (err?.code === 'SCHEMA_VALIDATION_FAILED') metrics.schemaFailures += 1;
    const attempts = (job.opts.attempts ?? 1);
    if (job.attemptsMade < attempts) {
      metrics.retries += 1;
      log.warn('ai job retrying', { id: job.id, attempt: job.attemptsMade, code: err?.code, msg: err?.message });
      return;
    }
    // Final failure: persist a failed record so the app stops polling and keeps
    // its deterministic result (spec §13 — never crash the worker).
    metrics.failed += 1;
    log.error('ai job failed', { id: job.id, code: err?.code, msg: err?.message });
    try {
      await setResult(job.data.key, { status: 'failed', kind: job.data.kind, errorCode: err?.code || 'ERROR', error: err?.message });
    } catch (e) {
      log.error('failed to persist failure', { error: e.message });
    }
  });

  worker.on('error', (err) => log.error('worker error', { error: err.message }));
  log.info('ai worker started', { concurrency: config.concurrency, model: config.model });
  return worker;
}
