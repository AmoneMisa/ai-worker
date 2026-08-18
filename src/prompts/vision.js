import { VISION_FIELDS } from '../schemas/vision.js';

export function visionPrompt(photoLabels = []) {
  return `Analyze apartment listing photos and return ONLY one JSON object with exactly these keys: ${VISION_FIELDS.join(', ')}.
Each key must be {"value":...,"confidence":0..1,"evidence":["photo_1",...]}. Use the supplied photo labels as evidence IDs.
Rules:
- Report only facts actually visible in the images. Never infer a feature merely because it is common.
- Not seeing something is NOT evidence it is absent. Use value:null, confidence:0, evidence:[] when unknown.
- Use false only when an image directly proves absence, which is rare; otherwise null.
- bathroomsVisible and bedroomsVisible are the minimum number of distinct rooms that can be visually established across the provided photos; avoid double-counting the same room from different angles.
- furnished means clearly furnished living/bedroom spaces, not a single stray object.
- renovationLevel may be one of: basic, standard, modern, luxury, unfinished, needs_renovation, or null.
- Do not use listing text or assumptions to fill gaps.
Photo labels in request order: ${photoLabels.join(', ') || 'none'}.`;
}
