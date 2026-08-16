// Result cache. A completed (or failed) extraction is stored under its content
// hash so an identical input never re-runs inference (spec §28). The record also
// carries model/prompt/schema versions for provenance (spec §29).
import { cacheRedis } from '../redis.js';
import { config } from '../config.js';

const PREFIX = 'ai:result:';

export async function getResult(key) {
  const raw = await cacheRedis.get(PREFIX + key);
  return raw ? JSON.parse(raw) : null;
}

export async function setResult(key, record) {
  const value = {
    ...record,
    model: config.model,
    promptVersion: config.promptVersion,
    schemaVersion: config.schemaVersion,
    parsedAt: new Date().toISOString(),
  };
  await cacheRedis.set(PREFIX + key, JSON.stringify(value), 'PX', config.cacheTtlMs);
  return value;
}
