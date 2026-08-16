// Central config, all env-driven (spec §32). Sensible defaults let the service
// boot with nothing set; production overrides come from ai-worker.env.
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const bool = (v, d) => (v == null || v === '' ? d : v === 'true' || v === '1');

export const config = {
  port: num(process.env.PORT, 4030),
  redisUrl: process.env.REDIS_URL || 'redis://ai-redis:6379',

  // Feature flags — turning AI off must leave the apps working on deterministic
  // parsers alone (spec §54). text/vision can be toggled independently.
  enabled: bool(process.env.AI_ENABLED, true),
  textEnabled: bool(process.env.AI_TEXT_ENABLED, true),
  visionEnabled: bool(process.env.AI_VISION_ENABLED, false),

  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama:11434',
  model: process.env.AI_MODEL || 'qwen2.5:3b',
  visionModel: process.env.AI_VISION_MODEL || 'qwen2.5vl:3b',

  // CPU-only: inference is serial. One at a time, everything else waits in queue.
  concurrency: num(process.env.AI_CONCURRENCY, 1),

  textContext: num(process.env.AI_TEXT_CONTEXT, 8192),
  imageContext: num(process.env.AI_IMAGE_CONTEXT, 4096),
  textTimeoutMs: num(process.env.AI_TEXT_TIMEOUT_MS, 120_000),
  imageTimeoutMs: num(process.env.AI_IMAGE_TIMEOUT_MS, 300_000),

  maxRetries: num(process.env.AI_MAX_RETRIES, 1),
  maxPhotosPerListing: num(process.env.AI_MAX_PHOTOS_PER_LISTING, 5),
  imageMaxWidth: num(process.env.AI_IMAGE_MAX_WIDTH, 1280),
  imageMaxHeight: num(process.env.AI_IMAGE_MAX_HEIGHT, 1280),
  minConfidence: num(process.env.AI_MIN_CONFIDENCE, 0.6),
  maxTextChars: num(process.env.AI_MAX_TEXT_CHARS, 32_000),
  apiKey: process.env.AI_API_KEY || '',

  // Bump either when the prompt/schema changes so the result cache invalidates
  // (spec §28/§29). Stored on every cached result for provenance.
  promptVersion: num(process.env.PROMPT_VERSION, 1),
  schemaVersion: num(process.env.SCHEMA_VERSION, 3),

  // Result cache retention (24h default). Keyed by model+prompt+input hash.
  cacheTtlMs: num(process.env.AI_CACHE_TTL_MS, 24 * 60 * 60 * 1000),
};
