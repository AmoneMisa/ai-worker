import { z } from 'zod';

// Fields worth LLM enrichment (deterministic ones like price/area/floor are
// passed in as knownFacts and only filled when the parser missed them). Kept
// close to the app's Listing shape so merging back is trivial.

const NUM = ['number', 'null'];
const INT = ['integer', 'null'];
const BOOL = ['boolean', 'null'];
const STR = ['string', 'null'];

// JSON Schema embedded in the provider payload so the model returns matching
// structured output (spec 12).
const apartmentProperties = {
    dealType: { type: STR, enum: ['rent', 'sale', 'daily_rent', null] },
    propertyType: { type: STR, enum: ['apartment', 'house', 'room', 'studio', 'commercial', null] },
    rooms: { type: INT },
    bedrooms: { type: INT },
    areaM2: { type: NUM },
    floor: { type: INT },
    floorsTotal: { type: INT },
    district: { type: STR },
    kvartal: { type: STR },
    newBuilding: { type: BOOL },
    balcony: { type: BOOL },
    airConditioner: { type: BOOL },
    gas: { type: BOOL },
    bathrooms: { type: INT },
    furnished: { type: BOOL },
    petsAllowed: { type: BOOL },
    childrenAllowed: { type: BOOL },
    communalSeparated: { type: BOOL },
    depositRequired: { type: BOOL },
    depositAmount: { type: NUM },
    commissionRequired: { type: BOOL },
    commissionPercent: { type: NUM },
    priceAmount: { type: NUM },
    priceCurrency: { type: STR },
    pricePeriod: { type: STR, enum: ['day', 'week', 'month', 'total', null] },
    negotiable: { type: BOOL },
    utilitiesAmount: { type: NUM },
    minLeaseTerm: { type: STR },
    availableFrom: { type: STR },
    parking: { type: BOOL },
    elevator: { type: BOOL },
    heating: { type: BOOL },
    hotWater: { type: BOOL },
    internet: { type: BOOL },
    smokingAllowed: { type: BOOL },
    condition: { type: STR, enum: ['needs_renovation', 'basic', 'good', 'modern', 'luxury', null] },
    amenities: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
};

export const apartmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: apartmentProperties,
  // Requiring every key (with null for unknown values) produces a stable output
  // contract and prevents the model from silently omitting difficult fields.
  required: Object.keys(apartmentProperties),
};

const nullableInt = z.number().int().nullable().catch(null);
const nullableNum = z.number().nullable().catch(null);
const nullableBool = z.boolean().nullable().catch(null);
const nullableStr = z.string().nullable().catch(null);

// Runtime validation of the model output (spec 13). `.catch` keeps a single bad
// field from failing the whole record — it degrades to null instead.
export const ApartmentSchema = z.object({
  dealType: z.enum(['rent', 'sale', 'daily_rent']).nullable().catch(null),
  propertyType: z.enum(['apartment', 'house', 'room', 'studio', 'commercial']).nullable().catch(null),
  rooms: nullableInt,
  bedrooms: nullableInt,
  areaM2: nullableNum,
  floor: nullableInt,
  floorsTotal: nullableInt,
  district: nullableStr,
  kvartal: nullableStr,
  newBuilding: nullableBool,
  balcony: nullableBool,
  airConditioner: nullableBool,
  gas: nullableBool,
  bathrooms: nullableInt,
  furnished: nullableBool,
  petsAllowed: nullableBool,
  childrenAllowed: nullableBool,
  communalSeparated: nullableBool,
  depositRequired: nullableBool,
  depositAmount: nullableNum,
  commissionRequired: nullableBool,
  commissionPercent: nullableNum,
  priceAmount: nullableNum,
  priceCurrency: nullableStr,
  pricePeriod: z.enum(['day', 'week', 'month', 'total']).nullable().catch(null),
  negotiable: nullableBool,
  utilitiesAmount: nullableNum,
  minLeaseTerm: nullableStr,
  availableFrom: nullableStr,
  parking: nullableBool,
  elevator: nullableBool,
  heating: nullableBool,
  hotWater: nullableBool,
  internet: nullableBool,
  smokingAllowed: nullableBool,
  condition: z.enum(['needs_renovation', 'basic', 'good', 'modern', 'luxury']).nullable().catch(null),
  amenities: z.array(z.string()).catch([]),
  confidence: z.number().min(0).max(1).catch(0),
}).partial();

// Business validation (spec 13): drop impossible values instead of storing them.
export function sanitizeApartment(v) {
  if (v.rooms != null && (v.rooms < 1 || v.rooms > 20)) v.rooms = null;
  if (v.areaM2 != null && (v.areaM2 <= 0 || v.areaM2 > 2000)) v.areaM2 = null;
  if (v.floor != null && v.floorsTotal != null && v.floor > v.floorsTotal) v.floorsTotal = null;
  if (v.bathrooms != null && (v.bathrooms < 1 || v.bathrooms > 10)) v.bathrooms = null;
  if (v.commissionPercent != null && (v.commissionPercent < 0 || v.commissionPercent > 100)) v.commissionPercent = null;
  return v;
}
