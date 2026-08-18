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
  byKind: {},
};

function kindMetrics(kind) {
  if (!metrics.byKind[kind]) {
    metrics.byKind[kind] = {
      count: 0,
      queueWaitMsTotal: 0,
      ollamaMsTotal: 0,
      totalMsTotal: 0,
    };
  }
  return metrics.byKind[kind];
}

export function recordText(ms) {
  metrics.textMsTotal += ms || 0;
  metrics.textCount += 1;
}
export function recordQueueWait(ms, kind = 'unknown') {
  const value = Math.max(0, ms || 0);
  metrics.queueWaitMsTotal += value;
  metrics.queueWaitCount += 1;
  kindMetrics(kind).queueWaitMsTotal += value;
}
export function recordJobTiming(kind, { ollamaMs = 0, totalMs = 0 } = {}) {
  const item = kindMetrics(kind);
  item.count += 1;
  item.ollamaMsTotal += Math.max(0, ollamaMs || 0);
  item.totalMsTotal += Math.max(0, totalMs || 0);
}
export function snapshot() {
  const byKind = Object.fromEntries(Object.entries(metrics.byKind).map(([kind, item]) => [kind, {
    ...item,
    avgQueueWaitMs: item.count ? Math.round(item.queueWaitMsTotal / item.count) : 0,
    avgOllamaMs: item.count ? Math.round(item.ollamaMsTotal / item.count) : 0,
    avgTotalMs: item.count ? Math.round(item.totalMsTotal / item.count) : 0,
  }]));
  return {
    ...metrics,
    byKind,
    avgTextMs: metrics.textCount ? Math.round(metrics.textMsTotal / metrics.textCount) : 0,
    avgImageMs: metrics.imageCount ? Math.round(metrics.imageMsTotal / metrics.imageCount) : 0,
    avgQueueWaitMs: metrics.queueWaitCount
      ? Math.round(metrics.queueWaitMsTotal / metrics.queueWaitCount)
      : 0,
  };
}
