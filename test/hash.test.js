import test from 'node:test';
import assert from 'node:assert/strict';
import { extractionKey, normalizeText } from '../src/util/hash.js';

test('normalizes harmless whitespace but preserves technical punctuation', () => {
  assert.equal(normalizeText('  Vue  \r\n\r\n\r\n C# + C++ @user  '), 'Vue\n\n C# + C++ @user');
});
test('cache key is stable across knownFacts property order and valid for BullMQ', () => {
  const first = extractionKey('vacancy', 'Vue developer', { city: 'Tashkent', remote: true });
  const second = extractionKey('vacancy', 'Vue developer', { remote: true, city: 'Tashkent' });
  assert.equal(first, second);
  assert.match(first, /^vacancy-[a-f0-9]{32}$/);
  assert.equal(first.includes(':'), false);
});
