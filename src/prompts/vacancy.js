import { EXTRACTION_RULES } from './common.js';

export const VACANCY_SYSTEM = `${EXTRACTION_RULES}

You extract structured data about ONE job vacancy. Text may be in English,
Russian, Ukrainian, Uzbek, Kazakh, Kyrgyz, Romanian, Korean, Japanese or Chinese.

- Support international hiring generically: visaSponsorship, visaTypes (e.g. E-7,
  D-10, work permit, JLPT/TOPIK/HSK levels go into visaTypes or localLanguageLevel),
  relocationSupport, foreignersAccepted, localLanguageRequired.
- workFormat: office/remote/hybrid/field only when stated.
- Prefer the source text over the countryHint (a hint is not the job's country).
- Add skills only when clearly present; the deterministic dictionary already found
  the obvious ones (they are in knownFacts.skills) — extend, don't replace.
- confidence: your overall 0..1 certainty.`;

export function vacancyPayload({ text, knownFacts, meta }) {
  return { source: meta || {}, knownFacts: knownFacts || {}, text };
}
