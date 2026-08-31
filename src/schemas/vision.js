import { z } from 'zod';

const EvidenceField = z.object({
  value: z.union([z.boolean(), z.number().int().nonnegative(), z.string(), z.null()]),
  confidence: z.number().min(0).max(1).catch(0),
  evidence: z.array(z.string()).max(12).catch([]),
}).strict();

// Keep this list aligned with the image-observable part of Flat Finder's public
// Listing contract. Fields whose meaning is contractual/textual (petsAllowed,
// commission, lease term, etc.) deliberately stay in text extraction instead of
// being guessed from photos.
export const VISION_FIELDS = [
  'roomsVisible',
  'bedroomsVisible',
  'bathroomsVisible',
  'bathroomLayoutVisible',
  'airConditioner',
  'balcony',
  'terrace',
  'privateYard',
  'furnished',
  'parkingVisible',
  'closedYard',
  'elevatorVisible',
  'kitchenVisible',
  'washingMachineVisible',
  'dishwasherVisible',
  'tvVisible',
  'microwaveVisible',
  'ovenVisible',
  'bidetVisible',
  'walkInClosetVisible',
  'bathtubVisible',
  'showerVisible',
  'gasVisible',
  'heatingVisible',
  'hotWaterVisible',
  'internetEquipmentVisible',
  'gasWaterHeaterVisible',
  'waterBoilerVisible',
  'euroLayoutVisible',
  'newBuildingVisible',
  'renovationLevel',
];

export const VisionSchema = z.object(
  Object.fromEntries(VISION_FIELDS.map((field) => [field, EvidenceField])),
).strict();

// JSON Schema embedded in the provider payload (Structured Outputs, mirrors VisionSchema).
function evidenceFieldSchema(valueSchema) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      value: valueSchema,
      confidence: { type: 'number' },
      evidence: { type: 'array', items: { type: 'string' } },
    },
    required: ['value', 'confidence', 'evidence'],
  };
}

const integerFields = new Set(['roomsVisible', 'bathroomsVisible', 'bedroomsVisible']);
const booleanFields = new Set(VISION_FIELDS.filter((field) => ![
  ...integerFields,
  'bathroomLayoutVisible',
  'renovationLevel',
].includes(field)));

const visionProperties = Object.fromEntries(VISION_FIELDS.map((field) => {
  if (integerFields.has(field)) {
    return [field, evidenceFieldSchema({ type: ['integer', 'null'] })];
  }
  if (field === 'bathroomLayoutVisible') {
    return [field, evidenceFieldSchema({ type: ['string', 'null'], enum: ['combined', 'separate', 'mixed', null] })];
  }
  if (field === 'renovationLevel') {
    return [field, evidenceFieldSchema({
      type: ['string', 'null'],
      enum: ['basic', 'good', 'modern', 'luxury', 'needs_renovation', null],
    })];
  }
  return [field, evidenceFieldSchema({ type: ['boolean', 'null'] })];
}));

export const visionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: visionProperties,
  required: VISION_FIELDS,
};

export function emptyVisionResult() {
  return Object.fromEntries(VISION_FIELDS.map((field) => [field, { value: null, confidence: 0, evidence: [] }]));
}

export function sanitizeVision(value) {
  const out = emptyVisionResult();

  for (const field of VISION_FIELDS) {
    const item = value?.[field];
    if (!item) continue;
    const evidence = [...new Set((item.evidence || []).map(String))].slice(0, 12);
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
    let v = item.value ?? null;

    if (integerFields.has(field) && v != null) {
      v = Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null;
    }

    if (field === 'bathroomLayoutVisible' && v != null) {
      const layout = String(v).toLowerCase().trim();
      v = ['combined', 'separate', 'mixed'].includes(layout) ? layout : null;
    }

    if (field === 'renovationLevel' && v != null) {
      const raw = String(v).toLowerCase().trim();
      const aliases = { standard: 'good', unfinished: 'needs_renovation' };
      const level = aliases[raw] || raw;
      v = ['basic', 'good', 'modern', 'luxury', 'needs_renovation'].includes(level) ? level : null;
    }

    // A negative fact is almost never provable from listing photos. Convert weak
    // false claims to unknown instead of treating "not visible" as "does not exist".
    if (booleanFields.has(field) && v === false && confidence < 0.98) v = null;

    out[field] = { value: v, confidence: v == null ? 0 : confidence, evidence: v == null ? [] : evidence };
  }
  return out;
}
