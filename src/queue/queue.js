import { config } from '../config.js';
import { extract } from '../services/extract.js';
import { setResult } from '../cache/cache.js';
import { metrics, recordJobTiming, recordQueueWait, recordText } from '../util/metrics.js';
import { log } from '../util/logger.js';

export const PRIORITY = { translation: 1, vacancy: 2, apartment: 3, photo: 4 };

const jobs = new Map();
const waiting = [];
let active = 0;
let started = false;
let stopping = false;
let sequence = 0;
const idleWaiters = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const attempts = Math.max(1, config.maxRetries + 1);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (job.kind === 'photo') {
          throw Object.assign(new Error('IMAGE_NOT_IMPLEMENTED'), { code: 'IMAGE_NOT_IMPLEMENTED' });
        }
        const result = await extract(job.kind, job.input);
        const finishedAtMs = Date.now();
        const processMs = Math.max(0, finishedAtMs - startedAtMs);
        const totalMs = Math.max(0, finishedAtMs - job.timestamp);
        const ollamaDurationMs = result.timings?.ollamaDurationMs ?? result.timings?.totalMs ?? 0;
        recordText(result.timings?.totalMs || 0);
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
        if (attempt < attempts) {
          metrics.retries += 1;
          log.warn('ai job retrying', { id: job.key, attempt, code: error?.code, msg: error?.message });
          await sleep(3000);
          continue;
        }
      }
    }

    metrics.failed += 1;
    job.state = 'failed';
    job.error = lastError?.message || 'AI job failed';
    log.error('ai job failed', { id: job.key, code: lastError?.code, msg: lastError?.message });
    try {
      await setResult(job.key, {
        status: 'failed',
        kind: job.kind,
        errorCode: lastError?.code || 'ERROR',
        error: job.error,
      });
    } catch (error) {
      log.error('failed to persist failure', { error: error.message });
    }
  } finally {
    metrics.processing -= 1;
    active = Math.max(0, active - 1);
    pump();
    resolveIdle();
  }
}

function pump() {
  if (!started || stopping) return;
  while (active < Math.max(1, config.concurrency) && waiting.length) {
    const job = waiting.shift();
    if (!job || job.state !== 'waiting') continue;
    void run(job);
  }
}

export function startQueue() {
  started = true;
  stopping = false;
  pump();
  log.info('ai worker started', { concurrency: config.concurrency, model: config.model, queue: 'memory' });
}

export async function enqueue(kind, key, input) {
  const existing = jobs.get(key);
  if (existing && ['waiting', 'active'].includes(existing.state)) {
    return { job: existing, created: false };
  }
  if (existing) jobs.delete(key);

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
    input: job.input,
  };
}

export async function closeQueue() {
  stopping = true;
  for (const job of waiting.splice(0)) {
    if (job.state === 'waiting') {
      job.state = 'failed';
      job.error = 'worker shutting down';
    }
  }
  if (!active) return;
  await new Promise((resolve) => idleWaiters.push(resolve));
}
