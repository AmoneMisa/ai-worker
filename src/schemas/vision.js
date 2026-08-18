import { z } from 'zod';

const EvidenceField = z.object({
  value: z.union([z.boolean(), z.number().int().nonnegative(), z.string(), z.null()]),
  confidence: z.number().min(0).max(1).catch(0),
  evidence: z.array(z.string()).max(12).catch([]),
}).strict();

export const VISION_FIELDS = [
  'airConditioner',
  'balcony',
  'bathroomsVisible',
  'bathroomLayoutVisible',
  'bedroomsVisible',
  'furnished',
  'parkingVisible',
  'closedYard',
  'elevatorVisible',
  'kitchenVisible',
  'washingMachineVisible',
  'dishwasherVisible',
  'tvVisible',
  'gasWaterHeaterVisible',
  'waterBoilerVisible',
  'renovationLevel',
];

export const VisionSchema = z.object({
  airConditioner: EvidenceField,
  balcony: EvidenceField,
  bathroomsVisible: EvidenceField,
  bathroomLayoutVisible: EvidenceField,
  bedroomsVisible: EvidenceField,
  furnished: EvidenceField,
  parkingVisible: EvidenceField,
  closedYard: EvidenceField,
  elevatorVisible: EvidenceField,
  kitchenVisible: EvidenceField,
  washingMachineVisible: EvidenceField,
  dishwasherVisible: EvidenceField,
  tvVisible: EvidenceField,
  gasWaterHeaterVisible: EvidenceField,
  waterBoilerVisible: EvidenceField,
  renovationLevel: EvidenceField,
}).strict();

export function emptyVisionResult() {
  return Object.fromEntries(VISION_FIELDS.map((field) => [field, { value: null, confidence: 0, evidence: [] }]));
}

export function sanitizeVision(value) {
  const out = emptyVisionResult();
  const booleanFields = new Set([
    'airConditioner',
    'balcony',
    'furnished',
    'parkingVisible',
    'closedYard',
    'elevatorVisible',
    'kitchenVisible',
    'washingMachineVisible',
    'dishwasherVisible',
    'tvVisible',
    'gasWaterHeaterVisible',
    'waterBoilerVisible',
  ]);

  for (const field of VISION_FIELDS) {
    const item = value?.[field];
    if (!item) continue;
    const evidence = [...new Set((item.evidence || []).map(String))].slice(0, 12);
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
    let v = item.value ?? null;

    if ((field === 'bathroomsVisible' || field === 'bedroomsVisible') && v != null) {
      v = Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null;
    }

    if (field === 'bathroomLayoutVisible' && v != null) {
      const layout = String(v).toLowerCase().trim();
      v = ['combined', 'separate', 'mixed'].includes(layout) ? layout : null;
    }

    if (field === 'renovationLevel' && v != null) {
      const level = String(v).toLowerCase().trim();
      v = ['basic', 'standard', 'modern', 'luxury', 'unfinished', 'needs_renovation'].includes(level)
        ? level
        : null;
    }

    // A negative fact is almost never provable from listing photos. Convert weak
    // false claims to unknown instead of treating "not visible" as "does not exist".
    if (booleanFields.has(field) && v === false && confidence < 0.98) v = null;

    out[field] = { value: v, confidence: v == null ? 0 : confidence, evidence: v == null ? [] : evidence };
  }
  return out;
}
