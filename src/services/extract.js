// Extraction pipeline: apartments/vacancies use structured JSON + zod validation.
// Interactive translation uses a lighter plain-text Ollama path to avoid the
// structured-schema prompt overhead on CPU-only inference.
import { structured, translate } from '../ollama/client.js';
import { config } from '../config.js';
import { apartmentJsonSchema, ApartmentSchema, sanitizeApartment } from '../schemas/apartment.js';
import { vacancyJsonSchema, VacancySchema, sanitizeVacancy } from '../schemas/vacancy.js';
import { APARTMENT_SYSTEM, apartmentPayload } from '../prompts/apartment.js';
import { VACANCY_SYSTEM, vacancyPayload } from '../prompts/vacancy.js';

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
};

export async function extract(kind, input) {
  if (kind === 'translation') {
    const { data: translatedText, timings } = await translate({
      text: input?.text || '',
      targetLanguage: input?.knownFacts?.targetLanguage || 'Russian',
      contextSize: config.textContext,
      timeoutMs: config.translationTimeoutMs,
    });
    return {
      data: {
        translatedText,
        sourceLanguage: null,
        confidence: 1,
      },
      confidence: 1,
      lowConfidence: false,
      timings,
    };
  }

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
