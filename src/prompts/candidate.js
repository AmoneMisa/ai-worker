import { EXTRACTION_RULES } from './common.js';

export const CANDIDATE_SYSTEM = `${EXTRACTION_RULES}

You extract structured data about ONE job-seeker/candidate profile. Text may be
in English, Russian, Ukrainian, Uzbek, Kazakh or Kyrgyz. Understand the meaning
of the source language first; do not map labels word-for-word when their semantic
role is different.

Important rules:
- Extract only facts stated or strongly and unambiguously implied by the source.
  Never invent a name, location, salary, age, experience, contact or profession.
- Do not ignore facts just because they appear only in free-form resume text.
  Read both labelled fields and ordinary prose before returning the result.
- knownFacts contain ONLY hard facts the caller could prove deterministically
  (for example an explicitly labelled name/age or an unredacted contact). They
  are authoritative. Other parsed values are intentionally not supplied here
  because you are responsible for the semantic interpretation.
- professions contains CURRENT desired professions/jobs only. A person may seek
  several different jobs, e.g. bartender + cashier + fitness trainer.
- Determine the desired profession from intent/goal statements, not merely from
  a field label. Uzbek "Kasbi" may describe a status/current occupation. For
  example "Kasbi: Talaba" means Student and belongs in features, while
  "maqsadim backend dasturchi sifatida ish topish" means the desired profession
  is Backend Developer.
- "Texnologiya" / technologies / stack describes skills, not a profession by
  itself. "Pentesting" can support Penetration Tester when the candidate is
  explicitly seeking work in that field, but a technology list must not become
  a list of job titles.
- previousProfessions contains roles the person explicitly says they worked in
  before. Do not promote previous work into professions unless they also say they
  are seeking that role now.
- Normalize profession names to concise English canonical labels when practical
  (Backend Developer, Network Administrator, Sales Manager, Cashier, Bartender,
  Accountant, Nurse, Teacher, AI / ML Engineer, etc.). Keep distinct roles
  distinct; do not collapse every engineer into Engineer or every manager into
  Manager.
- Translate the SEMANTICS of Uzbek/Russian/Ukrainian/Kazakh/Kyrgyz labels and
  sentences into normalized structured values. Preserve proper names; profession
  labels themselves should normally be canonical English.
- skills contains concrete abilities, tools and techniques. Normalize obvious
  spelling variants when unambiguous, e.g. Talwindcss -> Tailwind,
  React.Js -> React, Fastapi -> FastAPI, Postgresql -> PostgreSQL.
- features contains useful candidate circumstances explicitly stated, such as
  Student, Parental leave, No experience, Night shift, Open to relocation.
- languages MUST contain every explicitly mentioned human language, including
  languages mentioned only inside prose. Preserve an explicitly stated level in
  the same string using a concise normalized form, e.g. "Russian — professional",
  "Tajik — basic", "English — B2", "Uzbek — native". Normalize common level
  wording: родной/native -> native; свободный/fluent -> fluent;
  профессиональный/professional -> professional; разговорный/conversational ->
  conversational; средний/intermediate -> intermediate; базовый/basic -> basic;
  preserve CEFR A1-C2 verbatim. Do not invent a level when none is stated.
  Example: "Знание профессионального русского языка и базового таджикского"
  => ["Russian — professional", "Tajik — basic"].
- age is numeric only when stated. isAdult follows age when age is known; otherwise
  null. The calling application applies its own default when age is unavailable.
- salaryMin/salaryMax/currency are CURRENT expectations requested by the
  candidate, not a previous salary. Respect open ranges: "300$+" means
  salaryMin=300, salaryMax=null, currency=USD; "5 mln+" means min=5000000 and
  max=null. Do not convert currencies.
- country/city/district must describe where the candidate is actually located or
  explicitly wants to work. Do not treat Telegram channel/source metadata as
  proof of residence. Use an ISO-3166 alpha-2 country code when known (UZ, UA,
  KZ, KG, RO, CA, US, etc.). "Локація #Canada" therefore means country=CA, not
  UA merely because it appeared in a Ukrainian channel.
- remote is true/false ONLY if remote/office preference is explicit; otherwise
  null. Absence of the word remote NEVER means false.
- relocationReady is true/false only when explicit; otherwise null.
- employmentTypes may contain full_time and/or part_time when supported by text.
- experienceYears means experience RELEVANT TO THE CURRENT desired profession(s).
  Unrelated previous experience must not be counted. Example: a candidate seeking
  Backend Developer who says "1 yillik matematikadan repititorlik tajribam bor"
  has previousProfession Tutor, but backend experienceYears is null unless backend
  experience is separately stated.
- contacts may contain telegram/email/phone only when present in the unredacted
  knownFacts. The raw prompt may have contacts redacted for privacy.
- confidence is overall 0..1 certainty in the structured extraction.`;

export function candidatePayload({ text, knownFacts, meta }) {
  return { source: meta || {}, knownFacts: knownFacts || {}, text };
}
