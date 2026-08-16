// Extraction pipeline (spec §13): LLM -> JSON -> zod validate -> business
// sanitize -> return. Never returns raw model output; a bad field degrades to
// null rather than failing the record.
import { structured } from '../ollama/client.js';
import { config } from '../config.js';
import { apartmentJsonSchema, ApartmentSchema, sanitizeApartment } from '../schemas/apartment.js';
import { vacancyJsonSchema, VacancySchema, sanitizeVacancy } from '../schemas/vacancy.js';
import { translationJsonSchema, TranslationSchema, sanitizeTranslation } from '../schemas/translation.js';
import { APARTMENT_SYSTEM, apartmentPayload } from '../prompts/apartment.js';
import { VACANCY_SYSTEM, vacancyPayload } from '../prompts/vacancy.js';
import { TRANSLATION_SYSTEM, translationPayload } from '../prompts/translation.js';

const KINDS = {
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
  translation: {
    jsonSchema: translationJsonSchema,
    zod: TranslationSchema,
    sanitize: sanitizeTranslation,
    system: TRANSLATION_SYSTEM,
    payload: translationPayload,
  },
};

export async function extract(kind, input) {
  const k = KINDS[kind];
  if (!k) throw Object.assign(new Error(`unknown kind ${kind}`), { code: 'BAD_KIND' });

  const { data: raw, timings } = await structured({
    schema: k.jsonSchema,
    systemPrompt: k.system,
    payload: k.payload(input),
    contextSize: config.textContext,
    timeoutMs: config.textTimeoutMs,
  });

  const parsed = k.zod.safeParse(raw);
  if (!parsed.success) {
    throw Object.assign(new Error('SCHEMA_VALIDATION_FAILED'), { code: 'SCHEMA_VALIDATION_FAILED', issues: parsed.error.issues });
  }
  const data = k.sanitize(parsed.data);
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
  return {
    data,
    confidence,
    lowConfidence: confidence < config.minConfidence,
    timings,
  };
}
