import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VISION_FIELDS,
  VisionSchema,
  emptyVisionResult,
  sanitizeVision,
  visionJsonSchema,
} from '../src/schemas/vision.js';

test('vision schema requires every supported image-observable field', () => {
  assert.deepEqual([...visionJsonSchema.required].sort(), [...VISION_FIELDS].sort());
  assert.deepEqual(Object.keys(visionJsonSchema.properties).sort(), [...VISION_FIELDS].sort());
  assert.equal(visionJsonSchema.additionalProperties, false);
  assert.doesNotThrow(() => VisionSchema.parse(emptyVisionResult()));

  for (const field of [
    'roomsVisible',
    'terrace',
    'privateYard',
    'dishwasherVisible',
    'microwaveVisible',
    'ovenVisible',
    'bidetVisible',
    'walkInClosetVisible',
    'bathtubVisible',
    'showerVisible',
    'gasVisible',
    'heatingVisible',
    'hotWaterVisible',
    'internetEquipmentVisible',
    'euroLayoutVisible',
    'newBuildingVisible',
  ]) {
    assert.ok(VISION_FIELDS.includes(field), `missing ${field}`);
  }
});

test('vision sanitizer aligns renovation values with Flat Finder contract', () => {
  const standard = emptyVisionResult();
  standard.renovationLevel = { value: 'standard', confidence: 0.9, evidence: ['photo_1'] };
  assert.equal(sanitizeVision(standard).renovationLevel.value, 'good');

  const unfinished = emptyVisionResult();
  unfinished.renovationLevel = { value: 'unfinished', confidence: 0.9, evidence: ['photo_1'] };
  assert.equal(sanitizeVision(unfinished).renovationLevel.value, 'needs_renovation');
});

test('weak negative visual claims degrade to unknown', () => {
  const result = emptyVisionResult();
  result.balcony = { value: false, confidence: 0.8, evidence: ['photo_1'] };
  const sanitized = sanitizeVision(result);
  assert.equal(sanitized.balcony.value, null);
  assert.equal(sanitized.balcony.confidence, 0);
});
