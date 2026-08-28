import { config } from '../config.js';
import { setResult } from '../cache/cache.js';
import { metrics, recordJobTiming, recordQueueWait, recordText } from '../util/metrics.js';
import { log } from '../util/logger.js';

export const PRIORITY = Object.freeze({ translation: 1, vacancy: 2, candidate: 2, apartment: 3, photo: 4 });

const NON_RETRYABLE_CODES = new Set([
  'BAD_KIND',
  'INVALID_TRANSLATION',
  'SCHEMA_VALIDATION_FAILED',
  'VISION_NO_VALID_IMAGES',
  'VISION_SCHEMA_INVALID',
]);

const jobs = new Map();
const waiting = [];
let active = 0;
let started = false;
let stopping = false;
let sequence = 0;
let executeJob = null;
const idleWaiters = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt) {
  return Math.min(8_000, 1_000 * (2 ** Math.max(0, attempt - 1))) + Math.floor(Math.random() * 250);
}

function shouldRetry(error) {
  return !NON_RETRYABLE_CODES.has(error?.code);
}

function sortWaiting() {
  waiting.sort((a, b) => {
    const priority = (PRIORITY[a.kind] || 5) - (PRIORITY[b.kind] || 5);
    return priority || a.sequence - b.sequence;
  });
}

function resolveIdle() {
  if (active || waiting.length) return;
  while (idleWaiters.length) idleWaiters.shift()?.();
}

async function run(job) {
  active += 1;
  job.state = 'active';
  const startedAtMs = Date.now();
  const queueWaitMs = Math.max(0, startedAtMs - job.timestamp);
  recordQueueWait(queueWaitMs, job.kind);
  metrics.processing += 1;

  try {
    let lastError;
    const attempts = config.maxRetries + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await executeJob(job.kind, job.input);
        const finishedAtMs = Date.now();
        const processMs = Math.max(0, finishedAtMs - startedAtMs);
        const totalMs = Math.max(0, finishedAtMs - job.timestamp);
        const ollamaDurationMs = result.timings?.ollamaDurationMs ?? result.timings?.totalMs ?? 0;
        if (job.kind !== 'photo') recordText(result.timings?.totalMs || 0);
        recordJobTiming(job.kind, { ollamaMs: ollamaDurationMs, totalMs });
        const timings = {
          ...(result.timings || {}),
          queueWaitMs,
          processMs,
          totalWithQueueMs: totalMs,
          queuedAt: new Date(job.timestamp).toISOString(),
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
        };
        const stored = await setResult(job.key, { status: 'completed', kind: job.kind, ...result, timings });
        job.state = 'completed';
        job.result = stored;
        metrics.succeeded += 1;
        return;
      } catch (error) {
        lastError = error;
        if (error?.code === 'SCHEMA_VALIDATION_FAILED') metrics.schemaFailures += 1;
        if (attempt < attempts && shouldRetry(error)) {
          metrics.retries += 1;
          log.warn('ai job retrying', { id: job.key, attempt, code: error?.code, msg: error?.message });
          await sleep(retryDelay(attempt));
          continue;
        }
        break;
      }
    }

    metrics.failed += 1;
    job.state = 'failed';
    job.error = lastError?.message || 'AI job failed';
    log.error('ai job failed', { id: job.key, code: lastError?.code, msg: lastError?.message });
    await setResult(job.key, {
      status: 'failed',
      kind: job.kind,
      errorCode: lastError?.code || 'ERROR',
      error: job.error,
    });
  } catch (error) {
    log.error('failed to persist job result', { id: job.key, error: error.message });
  } finally {
    metrics.processing -= 1;
    active = Math.max(0, active - 1);
    jobs.delete(job.key);
    pump();
    resolveIdle();
  }
}

function pump() {
  if (!started || stopping || !executeJob) return;
  while (active < config.concurrency && waiting.length) {
    const job = waiting.shift();
    if (!job || job.state !== 'waiting') continue;
    void run(job);
  }
}

export function startQueue(handler) {
  if (typeof handler !== 'function') throw new TypeError('queue handler must be a function');
  executeJob = handler;
  started = true;
  stopping = false;
  pump();
  log.info('ai executor started', {
    concurrency: config.concurrency,
    maxPending: config.queueMaxPending,
  });
}

export async function enqueue(kind, key, input) {
  const existing = jobs.get(key);
  if (existing && ['waiting', 'active'].includes(existing.state)) {
    return { job: existing, created: false };
  }

  if (!started || stopping || !executeJob) {
    throw Object.assign(new Error('AI executor is not accepting jobs'), { code: 'EXECUTOR_UNAVAILABLE', status: 503 });
  }
  if (waiting.length + active >= config.queueMaxPending) {
    metrics.rejected = (metrics.rejected || 0) + 1;
    throw Object.assign(new Error('AI executor queue is full'), { code: 'QUEUE_FULL', status: 503 });
  }

  const job = {
    kind,
    key,
    input,
    state: 'waiting',
    timestamp: Date.now(),
    sequence: sequence += 1,
    result: null,
    error: null,
  };
  jobs.set(key, job);
  waiting.push(job);
  sortWaiting();
  metrics.queued += 1;
  pump();
  return { job, created: true };
}

export function getJobStatus(key) {
  const job = jobs.get(key);
  if (!job) return null;
  return {
    state: job.state,
    result: job.result,
    error: job.error,
    kind: job.kind,
  };
}

export function queueStats() {
  return {
    started,
    stopping,
    active,
    pending: waiting.length,
    tracked: jobs.size,
    concurrency: config.concurrency,
    maxPending: config.queueMaxPending,
    accepting: started && !stopping && Boolean(executeJob) && waiting.length + active < config.queueMaxPending,
  };
}

export async function closeQueue() {
  stopping = true;
  for (const job of waiting.splice(0)) jobs.delete(job.key);
  if (active) await new Promise((resolve) => idleWaiters.push(resolve));
  executeJob = null;
}
