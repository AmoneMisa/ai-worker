// In-memory counters (spec §30). Exposed at /metrics; reset on restart.
export const metrics = {
  queued: 0,
  processing: 0,
  succeeded: 0,
  failed: 0,
  retries: 0,
  cacheHits: 0,
  schemaFailures: 0,
  textMsTotal: 0,
  textCount: 0,
  imageMsTotal: 0,
  imageCount: 0,
  queueWaitMsTotal: 0,
  queueWaitCount: 0,
};

export function recordText(ms) {
  metrics.textMsTotal += ms || 0;
  metrics.textCount += 1;
}
export function recordQueueWait(ms) {
  metrics.queueWaitMsTotal += Math.max(0, ms || 0);
  metrics.queueWaitCount += 1;
}
export function snapshot() {
  return {
    ...metrics,
    avgTextMs: metrics.textCount ? Math.round(metrics.textMsTotal / metrics.textCount) : 0,
    avgImageMs: metrics.imageCount ? Math.round(metrics.imageMsTotal / metrics.imageCount) : 0,
    avgQueueWaitMs: metrics.queueWaitCount
      ? Math.round(metrics.queueWaitMsTotal / metrics.queueWaitCount)
      : 0,
  };
}
