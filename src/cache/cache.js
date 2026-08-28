// Process-local result cache. The durable job queue lives in Personal Site/Postgres;
// ai-worker only needs short-lived dedupe/result storage while a worker instance is
// alive. A restart may drop cached results, and callers will safely resubmit them.
import { config } from '../config.js';
import { memoryGet, memorySet } from './memory.js';

const PREFIX = 'ai:result:';

export async function getResult(key) {
  return memoryGet(PREFIX + key);
}

export async function setResult(key, record) {
  const value = {
    ...record,
    model: record.model || 'multi-provider',
    promptVersion: config.promptVersion,
    schemaVersion: config.schemaVersion,
    parsedAt: new Date().toISOString(),
  };
  const ttlMs = record.kind === 'translation'
    ? config.translationCacheTtlMs
    : config.cacheTtlMs;
  memorySet(PREFIX + key, value, ttlMs);
  return value;
}
