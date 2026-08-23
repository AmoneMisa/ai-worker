import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/config.js';
import { memoryClear, memoryGet, memorySet, memoryStats } from '../src/cache/memory.js';

test('memory cache is bounded and refreshes recently used entries', () => {
  memoryClear();
  const ttl = 60_000;

  for (let i = 0; i < config.cacheMaxEntries; i += 1) {
    memorySet(`key-${i}`, { i }, ttl);
  }

  assert.deepEqual(memoryGet('key-0'), { i: 0 });
  memorySet('overflow', { ok: true }, ttl);

  const stats = memoryStats();
  assert.equal(stats.entries, config.cacheMaxEntries);
  assert.deepEqual(memoryGet('key-0'), { i: 0 });
  assert.equal(memoryGet('key-1'), null);
  assert.deepEqual(memoryGet('overflow'), { ok: true });
  memoryClear();
});

test('expired cache entries are removed', async () => {
  memoryClear();
  memorySet('short-lived', { ok: true }, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(memoryGet('short-lived'), null);
  assert.equal(memoryStats().entries, 0);
  memoryClear();
});
