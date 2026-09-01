export const TRANSLATION_SYSTEM = `You translate ONE real-estate, vacancy, or candidate/resume description.
Translate the complete text into the target language supplied by the user payload.
Preserve line breaks, names, addresses, monetary amounts, measurements, URLs,
usernames and phone numbers exactly. Understand Uzbek written in Latin or
Cyrillic, including informal spelling and common real-estate shorthand.
Do not summarize, omit, explain, advertise, or add information.
Return only data matching the supplied JSON schema.`;

export function translationPayload({ text, knownFacts }) {
  return {
    targetLanguage: knownFacts?.targetLanguage || 'Russian',
    text,
  };
}
