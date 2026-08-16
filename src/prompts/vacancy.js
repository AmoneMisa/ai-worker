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
- knownFacts are authoritative. Never change an exact known salary, currency,
  contact, work format, or other populated deterministic field.
- salaryGross: true only for gross/before-tax pay, false only for net/after-tax
  pay, otherwise null. salaryNegotiable is true only when explicitly negotiable,
  false only when explicitly fixed/non-negotiable, otherwise null.
- seniority is junior/middle/senior/lead only when the role text supports it.
  Treat an explicit internship/trainee role as junior unless a stronger level is stated.
- Keep schedule, contractType, education and deadline concise and grounded in the
  source. Do not calculate or invent dates.
- niceToHave contains preferred/bonus skills only. tools contains named software,
  platforms, frameworks or equipment, not generic soft skills.
- managementRole is true only for explicit people/team/department responsibility;
  otherwise null rather than false.
- applicationLanguage is the language explicitly requested for the CV/application.
- confidence: your overall 0..1 certainty.`;

export function vacancyPayload({ text, knownFacts, meta }) {
  return { source: meta || {}, knownFacts: knownFacts || {}, text };
}
