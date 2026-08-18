import { z } from 'zod';

const translationProperties = {
  translatedText: { type: 'string' },
  sourceLanguage: { type: ['string', 'null'] },
  confidence: { type: 'number' },
};

export const translationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: translationProperties,
  required: Object.keys(translationProperties),
};

export const TranslationSchema = z.object({
  translatedText: z.string().catch(''),
  sourceLanguage: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0),
});

export function sanitizeTranslation(value) {
  value.translatedText = value.translatedText.trim().slice(0, 32_000);
  if (!value.translatedText) value.confidence = 0;
  return value;
}
