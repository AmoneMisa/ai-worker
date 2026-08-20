import { EXTRACTION_RULES } from './common.js';

export const CANDIDATE_SYSTEM = `${EXTRACTION_RULES}

You extract structured data about ONE job-seeker/candidate profile. Text may be
in English, Russian, Ukrainian, Uzbek, Kazakh or Kyrgyz.

Important rules:
- Extract only facts stated or strongly and unambiguously implied by the source.
  Never invent a name, location, salary, age, experience, contact or profession.
- knownFacts are authoritative. Preserve populated deterministic facts unless the
  source explicitly proves them wrong.
- professions contains CURRENT desired professions/jobs only. A person may seek
  several different jobs, e.g. bartender + cashier + fitness trainer.
- previousProfessions contains roles the person explicitly says they worked in
  before. Do not promote previous work into professions unless they also say they
  are seeking that role now.
- Normalize profession names to concise English canonical labels when practical
  (Cashier, Bartender, Accountant, Nurse, Teacher, Software Developer, etc.).
  Keep distinct roles distinct; do not collapse every manager into Manager.
- skills contains concrete abilities, tools, techniques, languages-as-skills only
  when useful for work. Do not invent generic soft skills.
- features contains useful candidate circumstances explicitly stated, such as
  Student, Parental leave, No experience, Night shift, Open to relocation.
- age is numeric only when stated. isAdult follows age when age is known; otherwise
  null. The calling application applies its own default when age is unavailable.
- salaryMin/salaryMax/currency are expectations requested by the candidate, not a
  previous salary. Do not convert currencies.
- country/city/district must describe where the candidate is located or wants to
  work. Do not treat channel/source metadata as proof of residence.
- remote is true/false only if remote/office preference is explicit; otherwise null.
- relocationReady is true/false only when explicit; otherwise null.
- employmentTypes may contain full_time and/or part_time when supported by text.
- experienceYears is total relevant work experience only when stated or directly
  calculable from clearly stated durations. Do not estimate from age.
- contacts may contain telegram/email/phone only when present in the unredacted
  knownFacts. The raw prompt may have contacts redacted for privacy.
- confidence is overall 0..1 certainty in the structured extraction.`;

export function candidatePayload({ text, knownFacts, meta }) {
  return { source: meta || {}, knownFacts: knownFacts || {}, text };
}
