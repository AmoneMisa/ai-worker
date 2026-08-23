import { extract } from '../services/extract.js';
import { analyzePhotos } from '../services/vision.js';

// Application-level job dispatcher. The queue owns scheduling only; concrete AI
// work stays here so execution policy is independent from providers and storage.
export async function executeJob(kind, input) {
  if (kind === 'photo') {
    const vision = await analyzePhotos(input?.images);
    return {
      data: vision.data,
      provider: vision.provider,
      cached: vision.cached,
      analyzedAt: vision.analyzedAt,
      timings: {},
    };
  }
  return await extract(kind, input);
}
