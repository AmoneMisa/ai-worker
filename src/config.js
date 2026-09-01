// Central env-driven configuration. Invalid production values fail fast at boot
// instead of surfacing later as NaN timeouts, broken concurrency limits or
// silently unsafe thresholds.
function env(name, fallback = '') {
  const value = process.env[name];
  return value == null || value === '' ? fallback : value;
}

function bool(name, fallback) {
  const raw = env(name, null);
  if (raw == null) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`Invalid ${name}: expected true|false|1|0`);
}

function number(name, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const raw = env(name, null);
  const value = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    const range = `${Number.isFinite(min) ? min : '-∞'}..${Number.isFinite(max) ? max : '∞'}`;
    throw new Error(`Invalid ${name}: expected ${integer ? 'integer ' : ''}number in ${range}`);
  }
  return value;
}

function list(name, fallback) {
  return String(env(name, fallback)).split(',').map((item) => item.trim()).filter(Boolean);
}

export const config = Object.freeze({
  port: number('PORT', 4030, { min: 1, max: 65535, integer: true }),

  enabled: bool('AI_ENABLED', true),
  textEnabled: bool('AI_TEXT_ENABLED', true),
  visionEnabled: bool('AI_VISION_ENABLED', false),

  // FreeLLMAPI is the default production gateway. It only catalogs free-tier
  // endpoints and performs provider/model failover internally. Direct providers
  // remain available for explicit opt-in/debugging, but are no longer defaults.
  textProviders: list('TEXT_PROVIDERS', 'freellmapi'),
  translationProviders: list('TRANSLATION_PROVIDERS', 'freellmapi'),
  visionProviders: list('VISION_PROVIDERS', 'freellmapi'),
  freeLlmApiBaseUrl: env('FREELLMAPI_BASE_URL', 'http://freellmapi:3001/v1').replace(/\/$/, ''),
  // Optional explicit override. Production exports the generated unified key to
  // a read-only file in FreeLLMAPI's shared data volume before healthcheck passes.
  freeLlmApiKey: env('FREELLMAPI_API_KEY'),
  freeLlmApiKeyFile: env('FREELLMAPI_API_KEY_FILE', '/run/freellmapi/unified.key'),
  freeLlmApiTextModel: env('FREELLMAPI_TEXT_MODEL', 'auto:balanced'),
  freeLlmApiVisionModel: env('FREELLMAPI_VISION_MODEL', 'auto:smart'),
  freeTranslatorEnabled: bool('FREE_TRANSLATOR_ENABLED', true),
  freeTranslatorMaxBytes: number('FREE_TRANSLATOR_MAX_BYTES', 500, { min: 1, max: 500, integer: true }),
  freeTranslatorTimeoutMs: number('FREE_TRANSLATOR_TIMEOUT_MS', 8_000, { min: 1, integer: true }),

  visionConcurrency: number('VISION_CONCURRENCY', 1, { min: 1, integer: true }),
  visionProviderTimeoutMs: number('VISION_PROVIDER_TIMEOUT_MS', 30_000, { min: 1, integer: true }),
  visionCooldownMs: number('VISION_COOLDOWN_MS', 5 * 60_000, { min: 0, integer: true }),
  visionCacheTtlMs: number('VISION_CACHE_TTL_MS', 30 * 24 * 60 * 60_000, { min: 1, integer: true }),
  groqApiKey: env('GROQ_API_KEY'),
  groqVisionModel: env('GROQ_VISION_MODEL', 'qwen/qwen3.6-27b'),
  groqTextModel: env('GROQ_TEXT_MODEL', env('GROQ_VISION_MODEL', 'qwen/qwen3.6-27b')),
  cloudflareAccountId: env('CLOUDFLARE_ACCOUNT_ID'),
  cloudflareApiToken: env('CLOUDFLARE_API_TOKEN', env('CLOUDFLARE_AUTH_TOKEN')),
  cloudflareVisionModel: env('CLOUDFLARE_VISION_MODEL', '@cf/meta/llama-3.2-11b-vision-instruct'),
  geminiApiKey: env('GEMINI_API_KEY'),
  geminiVisionModel: env('GEMINI_VISION_MODEL', 'gemini-3.6-flash'),
  geminiTextModel: env('GEMINI_TEXT_MODEL', env('GEMINI_VISION_MODEL', 'gemini-3.6-flash')),
  nvidiaApiKey: env('NVIDIA_API_KEY'),
  nvidiaVisionModel: env('NVIDIA_VISION_MODEL', 'meta/llama-3.2-11b-vision-instruct'),
  nvidiaTextModel: env('NVIDIA_TEXT_MODEL', env('NVIDIA_VISION_MODEL', 'meta/llama-3.2-11b-vision-instruct')),
  huggingfaceApiKey: env('HUGGINGFACE_API_KEY'),
  huggingfaceVisionModel: env('HUGGINGFACE_VISION_MODEL', 'Qwen/Qwen3-VL-30B-A3B-Instruct'),
  huggingfaceTextModel: env('HUGGINGFACE_TEXT_MODEL', env('HUGGINGFACE_VISION_MODEL', 'Qwen/Qwen3-VL-30B-A3B-Instruct')),
  llm7ApiKey: env('LLM7_API_KEY'),
  // Free/turbo-tier text model; the vision-capable models on llm7 currently
  // require paid balance ("pro" tier), so text intentionally does not fall
  // back to the vision model default here.
  llm7VisionModel: env('LLM7_VISION_MODEL', 'gpt-5.4-mini'),
  llm7TextModel: env('LLM7_TEXT_MODEL', 'gpt-oss'),
  mistralApiKey: env('MISTRAL_API_KEY'),
  mistralVisionModel: env('MISTRAL_VISION_MODEL', 'mistral-small-latest'),
  mistralTextModel: env('MISTRAL_TEXT_MODEL', env('MISTRAL_VISION_MODEL', 'mistral-small-latest')),
  openrouterApiKey: env('OPENROUTER_API_KEY'),
  openrouterVisionModel: env('OPENROUTER_VISION_MODEL', 'google/gemma-4-31b-it:free'),
  openrouterTextModel: env('OPENROUTER_TEXT_MODEL', env('OPENROUTER_VISION_MODEL', 'google/gemma-4-31b-it:free')),

  concurrency: number('AI_CONCURRENCY', 1, { min: 1, integer: true }),
  queueMaxPending: number('AI_QUEUE_MAX_PENDING', 100, { min: 1, integer: true }),
  // Per-request HTTP timeout for text-provider (extraction/translation) calls.
  textTimeoutMs: number('AI_TEXT_TIMEOUT_MS', 120_000, { min: 1, integer: true }),

  maxRetries: number('AI_MAX_RETRIES', 1, { min: 0, integer: true }),
  maxPhotosPerListing: number('AI_MAX_PHOTOS_PER_LISTING', 10, { min: 1, max: 20, integer: true }),
  minConfidence: number('AI_MIN_CONFIDENCE', 0.6, { min: 0, max: 1 }),
  maxTextChars: number('AI_MAX_TEXT_CHARS', 32_000, { min: 1, integer: true }),
  apiKey: env('AI_API_KEY'),

  promptVersion: number('PROMPT_VERSION', 2, { min: 1, integer: true }),
  schemaVersion: number('SCHEMA_VERSION', 4, { min: 1, integer: true }),
  cacheTtlMs: number('AI_CACHE_TTL_MS', 24 * 60 * 60 * 1000, { min: 1, integer: true }),
  translationCacheTtlMs: number('AI_TRANSLATION_CACHE_TTL_MS', 7 * 24 * 60 * 60 * 1000, { min: 1, integer: true }),
  cacheMaxEntries: number('AI_CACHE_MAX_ENTRIES', 2_000, { min: 10, integer: true }),
});
