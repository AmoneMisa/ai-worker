import { EXTRACTION_RULES } from './common.js';

export const APARTMENT_SYSTEM = `${EXTRACTION_RULES}

You extract structured data about ONE real-estate listing (apartment/house/room).
The text may be in Russian, Uzbek, Kazakh, Ukrainian, Romanian or English, and
may contain typos or transliteration (e.g. "kvartil"->kvartal, "kvadirat"->m²,
"etajli"->storeys). Interpret intent but never guess unstated facts.

- kvartal: the micro-district / massiv number when present (e.g. "14").
- condition: infer only from explicit words (evroremont/новостройка/требует ремонта…).
- communalSeparated: true only if utilities are stated as paid separately; false if
  stated as included; otherwise null.
- Central-Asian shorthand room/floor/storeys may look like "2/4/4". A superscript
  conversion marker such as "2³/4/4" means a 2-room plan converted to 3 rooms,
  on floor 4 of a 4-storey building; report rooms=3, floor=4, floorsTotal=4.
- Uzbek "uy" often means home/apartment generically. Do not classify it as a
  detached house without a house-specific signal such as hovli, villa or cottage.
- confidence: your overall 0..1 certainty for this extraction.`;

// Build the user payload: the cleaned text plus what the deterministic parser
// already found, so the model only fills gaps and doesn't override good values.
export function apartmentPayload({ text, knownFacts, meta }) {
  return { source: meta || {}, knownFacts: knownFacts || {}, text };
}
