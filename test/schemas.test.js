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
  candidateJsonSchema,
  CandidateSchema,
  sanitizeCandidate,
} from '../src/schemas/candidate.js';
import {
  translationJsonSchema,
  TranslationSchema,
  sanitizeTranslation,
} from '../src/schemas/translation.js';

test('structured-output schemas require every declared field', () => {
  assert.deepEqual([...apartmentJsonSchema.required].sort(), Object.keys(apartmentJsonSchema.properties).sort());
  assert.deepEqual([...vacancyJsonSchema.required].sort(), Object.keys(vacancyJsonSchema.properties).sort());
  assert.deepEqual([...candidateJsonSchema.required].sort(), Object.keys(candidateJsonSchema.properties).sort());
  assert.deepEqual([...translationJsonSchema.required].sort(), Object.keys(translationJsonSchema.properties).sort());
  assert.equal(apartmentJsonSchema.additionalProperties, false);
  assert.equal(vacancyJsonSchema.additionalProperties, false);
  assert.equal(candidateJsonSchema.additionalProperties, false);
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
  const parsed = VacancySchema.parse({
    salaryMin: 5000,
    salaryMax: 2500,
    experienceMinYears: 7,
    experienceMaxYears: 5,
    seniority: 'senior',
    salaryGross: true,
    salaryNegotiable: false,
    niceToHave: ['Docker', ' Docker '],
    tools: ['GitLab', 'GitLab'],
    confidence: 0.8,
  });
  const value = sanitizeVacancy(parsed);
  assert.equal(value.salaryMin, 2500);
  assert.equal(value.salaryMax, 5000);
  assert.equal(value.experienceMinYears, 5);
  assert.equal(value.experienceMaxYears, 7);
  assert.equal(value.seniority, 'senior');
  assert.equal(value.salaryGross, true);
  assert.deepEqual(value.niceToHave, ['Docker']);
  assert.deepEqual(value.tools, ['GitLab']);
});

test('candidate validation keeps multiple professions and derives adulthood from age', () => {
  const parsed = CandidateSchema.parse({
    professions: ['Bartender', ' Cashier ', 'Bartender'],
    previousProfessions: ['Salesperson', 'Salesperson'],
    skills: ['POS terminal', ' POS terminal '],
    age: 17,
    isAdult: true,
    salaryMin: 8_000_000,
    salaryMax: 5_000_000,
    currency: 'uzs',
    employmentTypes: ['full_time', 'part_time'],
    contacts: { telegram: '@candidate', email: null, phone: '+998 90 000 00 00' },
    confidence: 0.9,
  });
  const value = sanitizeCandidate(parsed);
  assert.deepEqual(value.professions, ['Bartender', 'Cashier']);
  assert.deepEqual(value.previousProfessions, ['Salesperson']);
  assert.deepEqual(value.skills, ['POS terminal']);
  assert.equal(value.isAdult, false);
  assert.equal(value.salaryMin, 5_000_000);
  assert.equal(value.salaryMax, 8_000_000);
  assert.equal(value.currency, 'UZS');
  assert.deepEqual(value.employmentTypes, ['full_time', 'part_time']);
});
