import { z } from 'zod';

const NUM = ['number', 'null'];
const INT = ['integer', 'null'];
const BOOL = ['boolean', 'null'];
const STR = ['string', 'null'];

// International-aware (spec 8): visa/relocation/foreigners kept generic, no
// per-country data models. Deterministic bits (contacts, exact salary numbers)
// come from the app as knownFacts; the LLM fills semantics it can't.
const vacancyProperties = {
    title: { type: STR },
    company: { type: STR },
    salaryMin: { type: NUM },
    salaryMax: { type: NUM },
    currency: { type: STR },
    salaryPeriod: { type: STR, enum: ['hour', 'day', 'week', 'month', 'year', null] },
    employmentType: { type: STR, enum: ['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', null] },
    workFormat: { type: STR, enum: ['office', 'remote', 'hybrid', 'field', null] },
    experienceMinYears: { type: INT },
    experienceMaxYears: { type: INT },
    skills: { type: 'array', items: { type: 'string' } },
    languages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          language: { type: 'string' },
          level: { type: STR },
          required: { type: BOOL },
        },
        required: ['language', 'level', 'required'],
      },
    },
    visaSponsorship: { type: BOOL },
    visaTypes: { type: 'array', items: { type: 'string' } },
    relocationSupport: { type: BOOL },
    foreignersAccepted: { type: BOOL },
    localLanguageRequired: { type: BOOL },
    localLanguageLevel: { type: STR },
    salaryGross: { type: BOOL },
    salaryNegotiable: { type: BOOL },
    seniority: { type: STR, enum: ['junior', 'middle', 'senior', 'lead', null] },
    schedule: { type: STR },
    contractType: { type: STR },
    education: { type: STR },
    managementRole: { type: BOOL },
    deadline: { type: STR },
    niceToHave: { type: 'array', items: { type: 'string' } },
    tools: { type: 'array', items: { type: 'string' } },
    applicationLanguage: { type: STR },
    confidence: { type: 'number' },
};

export const vacancyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: vacancyProperties,
  required: Object.keys(vacancyProperties),
};

const nInt = z.number().int().nullable().catch(null);
const nNum = z.number().nullable().catch(null);
const nBool = z.boolean().nullable().catch(null);
const nStr = z.string().nullable().catch(null);

export const VacancySchema = z.object({
  title: nStr,
  company: nStr,
  salaryMin: nNum,
  salaryMax: nNum,
  currency: nStr,
  salaryPeriod: z.enum(['hour', 'day', 'week', 'month', 'year']).nullable().catch(null),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance']).nullable().catch(null),
  workFormat: z.enum(['office', 'remote', 'hybrid', 'field']).nullable().catch(null),
  experienceMinYears: nInt,
  experienceMaxYears: nInt,
  skills: z.array(z.string()).catch([]),
  languages: z.array(z.object({
    language: z.string(),
    level: z.string().nullable().catch(null),
    required: z.boolean().nullable().catch(null),
  })).catch([]),
  visaSponsorship: nBool,
  visaTypes: z.array(z.string()).catch([]),
  relocationSupport: nBool,
  foreignersAccepted: nBool,
  localLanguageRequired: nBool,
  localLanguageLevel: nStr,
  salaryGross: nBool,
  salaryNegotiable: nBool,
  seniority: z.enum(['junior', 'middle', 'senior', 'lead']).nullable().catch(null),
  schedule: nStr,
  contractType: nStr,
  education: nStr,
  managementRole: nBool,
  deadline: nStr,
  niceToHave: z.array(z.string()).catch([]),
  tools: z.array(z.string()).catch([]),
  applicationLanguage: nStr,
  confidence: z.number().min(0).max(1).catch(0),
}).partial();

export function sanitizeVacancy(v) {
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) {
    // swap rather than drop — a min/max inversion is usually just ordering
    [v.salaryMin, v.salaryMax] = [v.salaryMax, v.salaryMin];
  }
  if (v.experienceMinYears != null && (v.experienceMinYears < 0 || v.experienceMinYears > 50)) v.experienceMinYears = null;
  if (v.experienceMaxYears != null && (v.experienceMaxYears < 0 || v.experienceMaxYears > 50)) v.experienceMaxYears = null;
  if (v.experienceMinYears != null && v.experienceMaxYears != null && v.experienceMinYears > v.experienceMaxYears) {
    [v.experienceMinYears, v.experienceMaxYears] = [v.experienceMaxYears, v.experienceMinYears];
  }
  for (const field of ['skills', 'niceToHave', 'tools', 'visaTypes']) {
    v[field] = [...new Set((v[field] || []).map((item) => item.trim()).filter(Boolean))];
  }
  return v;
}
