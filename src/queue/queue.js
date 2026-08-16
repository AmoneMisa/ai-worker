import { Queue } from 'bullmq';
import { makeConnection } from '../redis.js';
import { config } from '../config.js';
import { metrics } from '../util/metrics.js';

// One queue, job types distinguished by name. Physical inference concurrency is
// enforced by the single Worker (concurrency=1), so photos can't starve text —
// priority orders them (spec §4).
export const QUEUE_NAME = 'ai';
// User-triggered translations must jump ahead of background feed enrichment.
// With one CPU inference slot, putting translations behind vacancy/apartment
// batches made the modal appear stuck even though its job was merely queued.
export const PRIORITY = { translation: 1, vacancy: 2, apartment: 3, photo: 4 };

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
    if (!['completed', 'failed'].includes(state)) {
      // Active/retrying jobs are already in progress and cannot be moved between
      // priority sets. Reprioritize only old queued jobs created by a previous
      // deployment where translation used the lower background priority.
      if (state === 'waiting' || state === 'prioritized') {
        await existing.changePriority({ priority: PRIORITY[kind] || 5 });
      }
      return { job: existing, created: false };
    }
    // The result cache is checked before enqueue. If it is gone but BullMQ still
    // retains an old terminal job, remove that tombstone so inference can run.
    await existing.remove();
  }
  const job = await aiQueue.add(kind, { kind, key, input }, { jobId: key, priority: PRIORITY[kind] || 5 });
  metrics.queued += 1;
  return { job, created: true };
}
