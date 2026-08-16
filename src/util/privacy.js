// Contacts are extracted deterministically by the caller and passed separately
// in knownFacts. They are not needed for semantic enrichment, so keep them out
// of the model prompt while preserving punctuation that matters to vacancies
// and listings (C#, C++, .NET, prices, floor notation, etc.).
export function redactContacts(text) {
  return String(text ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[EMAIL]')
    .replace(/(?:https?:\/\/|www\.)\S+/giu, '[URL]')
    .replace(/(?<![\p{L}\p{N}_])@[A-Za-z][A-Za-z0-9_]{3,31}\b/gu, '[TELEGRAM]')
    .replace(/(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g, '[PHONE]');
}
