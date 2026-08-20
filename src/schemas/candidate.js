import { z } from 'zod';

const NUM = ['number', 'null'];
const INT = ['integer', 'null'];
const BOOL = ['boolean', 'null'];
const STR = ['string', 'null'];

const contactProperties = {
  telegram: { type: STR },
  email: { type: STR },
  phone: { type: STR },
};

const candidateProperties = {
  name: { type: STR },
  professions: { type: 'array', items: { type: 'string' } },
  previousProfessions: { type: 'array', items: { type: 'string' } },
  skills: { type: 'array', items: { type: 'string' } },
  features: { type: 'array', items: { type: 'string' } },
  age: { type: INT },
  isAdult: { type: BOOL },
  salaryMin: { type: NUM },
  salaryMax: { type: NUM },
  currency: { type: STR },
  country: { type: STR },
  city: { type: STR },
  district: { type: STR },
  remote: { type: BOOL },
  relocationReady: { type: BOOL },
  employmentTypes: {
    type: 'array',
    items: { type: 'string', enum: ['full_time', 'part_time'] },
  },
  experienceYears: { type: NUM },
  education: { type: STR },
  languages: { type: 'array', items: { type: 'string' } },
  contacts: {
    type: 'object',
    additionalProperties: false,
    properties: contactProperties,
    required: Object.keys(contactProperties),
  },
  confidence: { type: 'number' },
};

export const candidateJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: candidateProperties,
  required: Object.keys(candidateProperties),
};

const nStr = z.string().nullable().catch(null);
const nBool = z.boolean().nullable().catch(null);
const nNum = z.number().nullable().catch(null);
const nInt = z.number().int().nullable().catch(null);

export const CandidateSchema = z.object({
  name: nStr,
  professions: z.array(z.string()).catch([]),
  previousProfessions: z.array(z.string()).catch([]),
  skills: z.array(z.string()).catch([]),
  features: z.array(z.string()).catch([]),
  age: nInt,
  isAdult: nBool,
  salaryMin: nNum,
  salaryMax: nNum,
  currency: nStr,
  country: nStr,
  city: nStr,
  district: nStr,
  remote: nBool,
  relocationReady: nBool,
  employmentTypes: z.array(z.enum(['full_time', 'part_time'])).catch([]),
  experienceYears: nNum,
  education: nStr,
  languages: z.array(z.string()).catch([]),
  contacts: z.object({
    telegram: nStr,
    email: nStr,
    phone: nStr,
  }).catch({ telegram: null, email: null, phone: null }),
  confidence: z.number().min(0).max(1).catch(0),
}).partial();

function cleanList(items, max = 20) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

export function sanitizeCandidate(v) {
  v.professions = cleanList(v.professions, 10);
  v.previousProfessions = cleanList(v.previousProfessions, 12);
  v.skills = cleanList(v.skills, 30);
  v.features = cleanList(v.features, 12);
  v.languages = cleanList(v.languages, 12);
  v.employmentTypes = cleanList(v.employmentTypes, 2).filter((item) => item === 'full_time' || item === 'part_time');

  for (const field of ['name', 'currency', 'country', 'city', 'district', 'education']) {
    if (typeof v[field] === 'string') v[field] = v[field].trim() || null;
  }

  if (v.age != null && (v.age < 14 || v.age > 90)) v.age = null;
  if (v.age != null) v.isAdult = v.age >= 18;
  if (v.experienceYears != null && (v.experienceYears < 0 || v.experienceYears > 70)) v.experienceYears = null;
  if (v.salaryMin != null && v.salaryMin < 0) v.salaryMin = null;
  if (v.salaryMax != null && v.salaryMax < 0) v.salaryMax = null;
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) {
    [v.salaryMin, v.salaryMax] = [v.salaryMax, v.salaryMin];
  }
  if (typeof v.currency === 'string') v.currency = v.currency.toUpperCase();

  if (!v.contacts || typeof v.contacts !== 'object') {
    v.contacts = { telegram: null, email: null, phone: null };
  } else {
    for (const field of ['telegram', 'email', 'phone']) {
      const value = v.contacts[field];
      v.contacts[field] = typeof value === 'string' && value.trim() ? value.trim() : null;
    }
  }
  return v;
}
