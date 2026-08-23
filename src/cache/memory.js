import { config } from '../config.js';

const entries = new Map();
let operations = 0;
let evictions = 0;
let expirations = 0;

function now() {
  return Date.now();
}

function sweepExpired(current = now()) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= current) {
      entries.delete(key);
      expirations += 1;
    }
  }
}

function maintain() {
  operations += 1;
  if (operations % 64 === 0) sweepExpired();
  while (entries.size > config.cacheMaxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey == null) break;
    entries.delete(oldestKey);
    evictions += 1;
  }
}

export function memoryGet(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    entries.delete(key);
    expirations += 1;
    return null;
  }

  // Refresh insertion order on read: Map becomes a small O(1) LRU store.
  entries.delete(key);
  entries.set(key, entry);
  return entry.value;
}

export function memorySet(key, value, ttlMs) {
  entries.delete(key);
  entries.set(key, {
    value,
    expiresAt: now() + Math.max(1, Number(ttlMs) || 1),
  });
  maintain();
  return value;
}

export function memoryDelete(key) {
  entries.delete(key);
}

export function memoryClear() {
  entries.clear();
}

export function memorySize() {
  sweepExpired();
  return entries.size;
}

export function memoryStats() {
  sweepExpired();
  return {
    entries: entries.size,
    maxEntries: config.cacheMaxEntries,
    evictions,
    expirations,
  };
}
