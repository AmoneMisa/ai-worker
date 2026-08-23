// Central config, all env-driven. Sensible defaults let the service boot with
// nothing set; production overrides come from ai-worker.env.
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const bool = (v, d) => (v == null || v === '' ? d : v === 'true' || v === '1');
const list = (v, d) => String(v || d).split(',').map((x) => x.trim()).filter(Boolean);

export const config = {
  port: num(process.env.PORT, 4030),

  enabled: bool(process.env.AI_ENABLED, true),
  textEnabled: bool(process.env.AI_TEXT_ENABLED, true),
  visionEnabled: bool(process.env.AI_VISION_ENABLED, false),

  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama:11434',
  model: process.env.AI_MODEL || 'qwen3.5:2b',
  think: bool(process.env.AI_THINK, false),
  visionModel: process.env.AI_VISION_MODEL || 'qwen3.5:2b',

  translationUrl: (process.env.TRANSLATION_URL || 'http://translator:4040').replace(/\/$/, ''),
  translationServiceTimeoutMs: num(process.env.TRANSLATION_SERVICE_TIMEOUT_MS, 30_000),
  translationFallbackToQwen: bool(process.env.TRANSLATION_FALLBACK_TO_QWEN, true),

  visionProviders: list(process.env.VISION_PROVIDERS, 'groq,cloudflare'),
  visionConcurrency: Math.max(1, num(process.env.VISION_CONCURRENCY, 1)),
  visionProviderTimeoutMs: num(process.env.VISION_PROVIDER_TIMEOUT_MS, 30_000),
  visionCooldownMs: num(process.env.VISION_COOLDOWN_MS, 5 * 60_000),
  visionCacheTtlMs: num(process.env.VISION_CACHE_TTL_MS, 30 * 24 * 60 * 60_000),
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqVisionModel: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b',
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AUTH_TOKEN || '',
  cloudflareVisionModel: process.env.CLOUDFLARE_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct',

  concurrency: num(process.env.AI_CONCURRENCY, 1),
  textContext: num(process.env.AI_TEXT_CONTEXT, 8192),
  imageContext: num(process.env.AI_IMAGE_CONTEXT, 4096),
  textTimeoutMs: num(process.env.AI_TEXT_TIMEOUT_MS, 120_000),
  translationTimeoutMs: num(process.env.AI_TRANSLATION_TIMEOUT_MS, 180_000),
  imageTimeoutMs: num(process.env.AI_IMAGE_TIMEOUT_MS, 300_000),

  maxRetries: num(process.env.AI_MAX_RETRIES, 1),
  maxPhotosPerListing: num(process.env.AI_MAX_PHOTOS_PER_LISTING, 4),
  imageMaxWidth: num(process.env.AI_IMAGE_MAX_WIDTH, 1280),
  imageMaxHeight: num(process.env.AI_IMAGE_MAX_HEIGHT, 1280),
  minConfidence: num(process.env.AI_MIN_CONFIDENCE, 0.6),
  maxTextChars: num(process.env.AI_MAX_TEXT_CHARS, 32_000),
  apiKey: process.env.AI_API_KEY || '',

  promptVersion: num(process.env.PROMPT_VERSION, 1),
  schemaVersion: num(process.env.SCHEMA_VERSION, 3),
  cacheTtlMs: num(process.env.AI_CACHE_TTL_MS, 24 * 60 * 60 * 1000),
  translationCacheTtlMs: num(process.env.AI_TRANSLATION_CACHE_TTL_MS, 7 * 24 * 60 * 60 * 1000),
};
