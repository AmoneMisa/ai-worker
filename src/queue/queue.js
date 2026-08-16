import { Queue } from 'bullmq';
import { makeConnection } from '../redis.js';
import { config } from '../config.js';
import { metrics } from '../util/metrics.js';

// One queue, job types distinguished by name. Physical inference concurrency is
// enforced by the single Worker (concurrency=1), so photos can't starve text —
// priority orders them (spec §4).
export const QUEUE_NAME = 'ai';
export const PRIORITY = { vacancy: 1, apartment: 2, photo: 3 };

export const aiQueue = new Queue(QUEUE_NAME, {
  connection: makeConnection(),
  defaultJobOptions: {
    attempts: config.maxRetries + 1, // 1 try + N retries (spec §14)
    backoff: { type: 'fixed', delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 200,
  },
});

// jobId = cache key → BullMQ dedupes concurrent identical requests for free.
export async function enqueue(kind, key, input) {
  const existing = await aiQueue.getJob(key);
  if (existing) {
    const state = await existing.getState();
    if (!['completed', 'failed'].includes(state)) return { job: existing, created: false };
    // The result cache is checked before enqueue. If it is gone but BullMQ still
    // retains an old terminal job, remove that tombstone so inference can run.
    await existing.remove();
  }
  const job = await aiQueue.add(kind, { kind, key, input }, { jobId: key, priority: PRIORITY[kind] || 5 });
  metrics.queued += 1;
  return { job, created: true };
}
