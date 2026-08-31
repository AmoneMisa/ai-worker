import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImages } from '../src/services/vision.js';

test('normalizeImages accepts http and data image inputs and rejects unsupported values', () => {
  assert.deepEqual(normalizeImages([
    'https://example.com/flat.jpg',
    { id: 'kitchen', dataUrl: 'data:image/jpeg;base64,AAA=' },
    'file:///tmp/private.jpg',
  ]), [
    { id: 'photo_1', url: 'https://example.com/flat.jpg' },
    { id: 'kitchen', url: 'data:image/jpeg;base64,AAA=' },
  ]);
});

test('normalizeImages keeps at most ten listing photos by default', () => {
  const images = Array.from({ length: 12 }, (_, index) => `https://example.com/photo-${index + 1}.jpg`);
  const normalized = normalizeImages(images);
  assert.equal(normalized.length, 10);
  assert.equal(normalized[0].id, 'photo_1');
  assert.equal(normalized[9].id, 'photo_10');
});
