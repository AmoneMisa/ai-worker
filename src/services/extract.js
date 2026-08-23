// Extraction pipeline: apartments/vacancies/candidates use structured JSON + zod validation.
import { structured } from '../ollama/client.js';
import { config } from '../config.js';
import { translateText } from './translation.js';
import { apartmentJsonSchema, ApartmentSchema, sanitizeApartment } from '../schemas/apartment.js';
import { vacancyJsonSchema, VacancySchema, sanitizeVacancy } from '../schemas/vacancy.js';
import { candidateJsonSchema, CandidateSchema, sanitizeCandidate } from '../schemas/candidate.js';
import { APARTMENT_SYSTEM, apartmentPayload } from '../prompts/apartment.js';
import { VACANCY_SYSTEM, vacancyPayload } from '../prompts/vacancy.js';
import { CANDIDATE_SYSTEM, candidatePayload } from '../prompts/candidate.js';

export const EXTRACTION_KINDS = Object.freeze({
  apartment: {
    jsonSchema: apartmentJsonSchema,
    zod: ApartmentSchema,
    sanitize: sanitizeApartment,
    system: APARTMENT_SYSTEM,
    payload: apartmentPayload,
  },
  vacancy: {
    jsonSchema: vacancyJsonSchema,
    zod: VacancySchema,
    sanitize: sanitizeVacancy,
    system: VACANCY_SYSTEM,
    payload: vacancyPayload,
  },
  candidate: {
    jsonSchema: candidateJsonSchema,
    zod: CandidateSchema,
    sanitize: sanitizeCandidate,
    system: CANDIDATE_SYSTEM,
    payload: candidatePayload,
  },
});

export const PUBLIC_EXTRACTION_KINDS = Object.freeze([...Object.keys(EXTRACTION_KINDS), 'translation']);

export async function extract(kind, input) {
  if (kind === 'translation') {
    return await translateText(input, { fallbackOnly: Boolean(input?.translationFallbackOnly) });
  }

  const definition = EXTRACTION_KINDS[kind];
  if (!definition) throw Object.assign(new Error(`unknown kind ${kind}`), { code: 'BAD_KIND' });

  const { data: raw, timings } = await structured({
    schema: definition.jsonSchema,
    systemPrompt: definition.system,
    payload: definition.payload(input),
    contextSize: config.textContext,
    timeoutMs: config.textTimeoutMs,
  });

  const parsed = definition.zod.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error('SCHEMA_VALIDATION_FAILED'), {
      code: 'SCHEMA_VALIDATION_FAILED',
      issues: parsed.error.issues,
    });
  }
  const data = definition.sanitize(parsed.data);
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
  return {
    data,
    confidence,
    lowConfidence: confidence < config.minConfidence,
    timings,
  };
}
