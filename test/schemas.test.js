import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apartmentJsonSchema,
  ApartmentSchema,
  sanitizeApartment,
} from '../src/schemas/apartment.js';
import {
  vacancyJsonSchema,
  VacancySchema,
  sanitizeVacancy,
} from '../src/schemas/vacancy.js';
import {
  translationJsonSchema,
  TranslationSchema,
  sanitizeTranslation,
} from '../src/schemas/translation.js';

test('structured-output schemas require every declared field', () => {
  assert.deepEqual([...apartmentJsonSchema.required].sort(), Object.keys(apartmentJsonSchema.properties).sort());
  assert.deepEqual([...vacancyJsonSchema.required].sort(), Object.keys(vacancyJsonSchema.properties).sort());
  assert.deepEqual([...translationJsonSchema.required].sort(), Object.keys(translationJsonSchema.properties).sort());
  assert.equal(apartmentJsonSchema.additionalProperties, false);
  assert.equal(vacancyJsonSchema.additionalProperties, false);
  assert.equal(translationJsonSchema.additionalProperties, false);
});

test('translation validation rejects an empty result through confidence', () => {
  const value = sanitizeTranslation(TranslationSchema.parse({ translatedText: '   ', sourceLanguage: 'uz', confidence: 0.9 }));
  assert.equal(value.translatedText, '');
  assert.equal(value.confidence, 0);
});
test('apartment validation degrades impossible values safely', () => {
  const parsed = ApartmentSchema.parse({ rooms: 99, areaM2: -5, floor: 12, floorsTotal: 9, confidence: 2 });
  const value = sanitizeApartment(parsed);
  assert.equal(value.rooms, null);
  assert.equal(value.areaM2, null);
  assert.equal(value.floorsTotal, null);
  assert.equal(value.confidence, 0);
});

test('vacancy validation normalizes inverted ranges', () => {
  const parsed = VacancySchema.parse({ salaryMin: 5000, salaryMax: 2500, confidence: 0.8 });
  const value = sanitizeVacancy(parsed);
  assert.equal(value.salaryMin, 2500);
  assert.equal(value.salaryMax, 5000);
});
