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
