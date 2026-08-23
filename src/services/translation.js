import { config } from '../config.js';
import { translate } from '../ollama/client.js';
import { requestTranslation } from './translator.js';

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`ʻʼ]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function translationLooksUnchanged(source, translated) {
  const a = normalizedText(source);
  const b = normalizedText(translated);
  if (!a || !b || a === b) return true;

  const sourceWords = a.split(' ');
  const translatedWords = b.split(' ');
  if (sourceWords.length < 5 || translatedWords.length < 5) return false;

  const compared = Math.min(sourceWords.length, translatedWords.length);
  let same = 0;
  for (let i = 0; i < compared; i += 1) {
    if (sourceWords[i] === translatedWords[i]) same += 1;
  }
  const positionalSimilarity = same / Math.max(sourceWords.length, translatedWords.length);
  const lengthSimilarity = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return positionalSimilarity >= 0.9 && lengthSimilarity >= 0.9;
}

function normalizedResult(serviceResult) {
  return {
    data: {
      translatedText: serviceResult.data.translatedText,
      sourceLanguage: serviceResult.data.sourceLanguage || null,
      confidence: serviceResult.data.confidence ?? 0.8,
    },
    confidence: serviceResult.data.confidence ?? 0.8,
    lowConfidence: false,
    engine: serviceResult.engine,
    timings: serviceResult.timings || {},
  };
}

export async function translateText(input, { allowFallback = true, fallbackOnly = false } = {}) {
  const text = String(input?.text || '').trim();
  const targetLanguage = String(input?.knownFacts?.targetLanguage || 'Russian').trim() || 'Russian';
  if (!text) {
    const error = new Error('INVALID_TRANSLATION: empty source text');
    error.code = 'INVALID_TRANSLATION';
    throw error;
  }

  let serviceError;
  if (!fallbackOnly) {
    try {
      const serviceResult = await requestTranslation(text, targetLanguage);
      if (!translationLooksUnchanged(text, serviceResult?.data?.translatedText)) return normalizedResult(serviceResult);
      serviceError = Object.assign(new Error('TRANSLATION_SERVICE_UNCHANGED'), { code: 'TRANSLATION_SERVICE_UNCHANGED' });
    } catch (error) {
      serviceError = error;
    }
  }

  if (!allowFallback || !config.translationFallbackToQwen) {
    throw serviceError || Object.assign(new Error('TRANSLATION_FALLBACK_DISABLED'), { code: 'TRANSLATION_FALLBACK_DISABLED' });
  }

  const { data: translatedText, timings } = await translate({
    text,
    targetLanguage,
    contextSize: config.textContext,
    timeoutMs: config.translationTimeoutMs,
  });
  if (translationLooksUnchanged(text, translatedText)) {
    const error = new Error('INVALID_TRANSLATION: translation is unchanged');
    error.code = 'INVALID_TRANSLATION';
    throw error;
  }

  return {
    data: { translatedText, sourceLanguage: null, confidence: 0.9 },
    confidence: 0.9,
    lowConfidence: false,
    engine: 'qwen',
    timings,
  };
}
