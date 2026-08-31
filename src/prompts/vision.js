import { VISION_FIELDS } from '../schemas/vision.js';

export function visionPrompt(photoLabels = []) {
  return `Analyze real-estate listing photos and return ONLY one JSON object with exactly these keys: ${VISION_FIELDS.join(', ')}.
Each key must be {"value":...,"confidence":0..1,"evidence":["photo_1",...]}. Use only the supplied photo labels as evidence IDs.

Evidence rules:
- Report only facts directly visible in the images. Never infer a feature merely because it is common for this type of home.
- Not seeing something is NOT evidence it is absent. Use value:null, confidence:0, evidence:[] whenever a fact cannot be established.
- Use false only when an image directly proves absence; this is rare. Otherwise use null.
- Never estimate area, floor, building year, price, address, location, ownership, lease terms, commission, pet/child/smoking policy or other contractual facts from appearance. Those belong to text extraction.
- If a screenshot, sign or floor plan contains text, use it only as supporting evidence for a field in this schema; do not invent additional keys.

Counting/layout rules:
- roomsVisible is the minimum number of distinct habitable rooms that can be established across all photos. Do not count kitchens, bathrooms, corridors or balconies as habitable rooms, and avoid double-counting the same room from different angles.
- bedroomsVisible and bathroomsVisible follow the same minimum-distinct-room rule.
- bathroomLayoutVisible may be combined, separate, mixed, or null. combined means toilet and bath/shower are visibly in the same room; separate means distinct toilet and bath/shower rooms are both established; mixed means both layouts are visibly present. Do not infer whole-apartment layout from a single bathroom photo.
- euroLayoutVisible is true only when an open-plan kitchen integrated with a living room is clearly established by the photos or a readable floor plan. Otherwise null.

Feature rules:
- furnished means clearly furnished living/bedroom spaces, not one stray object.
- parkingVisible requires an identifiable dedicated parking space/garage/parking area associated with the property; a random street car is insufficient.
- privateYard means a yard clearly private to the listed dwelling. closedYard means an enclosed/gated shared or private courtyard; do not treat every fence as proof.
- terrace is an outdoor usable terrace/patio, distinct from a normal balcony.
- elevatorVisible requires an identifiable lift/elevator or its doors/control panel in the building.
- gasVisible requires identifiable gas infrastructure such as a gas hob, meter, pipework or gas appliance. Do not infer gas merely from cookware.
- heatingVisible requires identifiable heating equipment such as radiators, underfloor-heating controls or a heating appliance. Air conditioners alone are not proof of primary heating.
- hotWaterVisible is true only when hot-water equipment/controls are directly identifiable. A bathroom or tap alone is not proof.
- internetEquipmentVisible requires identifiable router/ONT/modem/network termination equipment. It indicates visible internet equipment, not guaranteed active service.
- gasWaterHeaterVisible means a gas-fired instantaneous water heater / gas column is visibly identifiable.
- waterBoilerVisible means an electric/storage water heater is visibly identifiable. Do not confuse it with a kitchen hood, cabinet, meter, radiator or unrelated heating appliance.
- newBuildingVisible is true only with strong visual evidence of a newly constructed/new-build property; if age is uncertain, return null rather than guessing.
- renovationLevel must be one of: basic, good, modern, luxury, needs_renovation, or null. Judge finish/condition conservatively; do not use price or assumed neighborhood status.

Appliance/fixture rules:
- kitchenVisible, washingMachineVisible, dishwasherVisible, tvVisible, microwaveVisible, ovenVisible, bidetVisible, walkInClosetVisible, bathtubVisible and showerVisible require the corresponding object/space to be visibly identifiable.
- airConditioner and balcony require direct visual evidence. Do not convert non-visibility into false.

Photo labels in request order: ${photoLabels.join(', ') || 'none'}.`;
}
