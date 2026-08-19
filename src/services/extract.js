// Extraction pipeline: apartments/vacancies use structured JSON + zod validation.
// Interactive translation prefers the dedicated M2M100 service and falls back to
// the local Qwen model when the service is unavailable or returns a suspicious
// identity translation.
import { structured, translate } from '../ollama/client.js';
import { config } from '../config.js';
import { requestTranslation } from './translator.js';
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

function normalizedTranslationText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`ʻʼ]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function translationLooksUnchanged(source, translated) {
  const a = normalizedTranslationText(source);
  const b = normalizedTranslationText(translated);
  if (!a || !b) return true;
  if (a === b) return true;

  const sourceWords = a.split(' ');
  const translatedWords = b.split(' ');
  if (sourceWords.length < 5 || translatedWords.length < 5) return false;

  // Catch near-identity responses while allowing addresses, names and numbers to
  // remain unchanged. Comparing token positions is deliberately conservative:
  // a genuine translation should change substantially more than 10% of words.
  const compared = Math.min(sourceWords.length, translatedWords.length);
  let same = 0;
  for (let i = 0; i < compared; i += 1) {
    if (sourceWords[i] === translatedWords[i]) same += 1;
  }
  const positionalSimilarity = same / Math.max(sourceWords.length, translatedWords.length);
  const lengthSimilarity = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return positionalSimilarity >= 0.9 && lengthSimilarity >= 0.9;
}

async function translateWithFallback(input) {
  const text = String(input?.text || '').trim();
  const targetLanguage = String(input?.knownFacts?.targetLanguage || 'Russian').trim() || 'Russian';
  if (!text) {
    const err = new Error('INVALID_TRANSLATION: empty source text');
    err.code = 'INVALID_TRANSLATION';
    throw err;
  }

  let serviceError;
  try {
    const serviceResult = await requestTranslation(text, targetLanguage);
    const translatedText = serviceResult?.data?.translatedText || '';
    if (!translationLooksUnchanged(text, translatedText)) {
      return {
        data: {
          translatedText,
          sourceLanguage: serviceResult.data.sourceLanguage || null,
          confidence: serviceResult.data.confidence ?? 0.8,
        },
        confidence: serviceResult.data.confidence ?? 0.8,
        lowConfidence: false,
        timings: serviceResult.timings || {},
      };
    }
    serviceError = Object.assign(new Error('TRANSLATION_SERVICE_UNCHANGED'), { code: 'TRANSLATION_SERVICE_UNCHANGED' });
  } catch (error) {
    serviceError = error;
  }

  if (!config.translationFallbackToQwen) throw serviceError;

  const { data: translatedText, timings } = await translate({
    text,
    targetLanguage,
    contextSize: config.textContext,
    timeoutMs: config.translationTimeoutMs,
  });
  if (translationLooksUnchanged(text, translatedText)) {
    const err = new Error('INVALID_TRANSLATION: translation is unchanged');
    err.code = 'INVALID_TRANSLATION';
    throw err;
  }

  return {
    data: {
      translatedText,
      sourceLanguage: null,
      confidence: 0.9,
    },
    confidence: 0.9,
    lowConfidence: false,
    timings,
  };
}

export async function extract(kind, input) {
  if (kind === 'translation') return await translateWithFallback(input);

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
