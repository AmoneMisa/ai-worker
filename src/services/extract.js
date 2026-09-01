// Extraction pipeline: apartments/vacancies/candidates/translation all use
// structured JSON + zod validation via the external provider chain (text.js).
import { config } from '../config.js';
import { runText } from './text.js';
import { translationLooksUnchanged } from '../util/translationGuard.js';
import { apartmentJsonSchema, ApartmentSchema, sanitizeApartment } from '../schemas/apartment.js';
import { vacancyJsonSchema, VacancySchema, sanitizeVacancy } from '../schemas/vacancy.js';
import { candidateJsonSchema, CandidateSchema, sanitizeCandidate } from '../schemas/candidate.js';
import { translationJsonSchema, TranslationSchema, sanitizeTranslation } from '../schemas/translation.js';
import { APARTMENT_SYSTEM, apartmentPayload } from '../prompts/apartment.js';
import { VACANCY_SYSTEM, vacancyPayload } from '../prompts/vacancy.js';
import { CANDIDATE_SYSTEM, candidatePayload } from '../prompts/candidate.js';
import { TRANSLATION_SYSTEM, translationPayload } from '../prompts/translation.js';
import { tryFreeTranslation } from './free-translation.js';

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
  translation: {
    jsonSchema: translationJsonSchema,
    zod: TranslationSchema,
    sanitize: sanitizeTranslation,
    system: TRANSLATION_SYSTEM,
    payload: translationPayload,
  },
});

export const PUBLIC_EXTRACTION_KINDS = Object.freeze(Object.keys(EXTRACTION_KINDS));

export async function extract(kind, input) {
  const definition = EXTRACTION_KINDS[kind];
  if (!definition) throw Object.assign(new Error(`unknown kind ${kind}`), { code: 'BAD_KIND' });

  if (kind === 'translation' && !String(input?.text || '').trim()) {
    throw Object.assign(new Error('INVALID_TRANSLATION: empty source text'), { code: 'INVALID_TRANSLATION' });
  }

  if (kind === 'translation') {
    try {
      const freeResult = await tryFreeTranslation(String(input.text), input?.knownFacts?.targetLanguage);
      if (freeResult && !translationLooksUnchanged(input.text, freeResult.data.translatedText)) return freeResult;
    } catch {
      // The no-key translator is best-effort; free LLM providers remain the
      // reliable fallback for unsupported languages, long text and outages.
    }
  }

  const { data: raw, provider, timings } = await runText({
    schema: definition.jsonSchema,
    systemPrompt: definition.system,
    payload: definition.payload(input),
    providers: kind === 'translation' ? config.translationProviders : config.textProviders,
  });

  const parsed = definition.zod.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error('SCHEMA_VALIDATION_FAILED'), {
      code: 'SCHEMA_VALIDATION_FAILED',
      issues: parsed.error.issues,
    });
  }
  const data = definition.sanitize(parsed.data);

  if (kind === 'translation' && translationLooksUnchanged(input?.text, data.translatedText)) {
    throw Object.assign(new Error('INVALID_TRANSLATION: translation is unchanged'), { code: 'INVALID_TRANSLATION' });
  }

  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
  return {
    data,
    provider,
    confidence,
    lowConfidence: confidence < config.minConfidence,
    timings,
  };
}
