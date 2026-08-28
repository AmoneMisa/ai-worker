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

  ollamaUrl: env('OLLAMA_URL', 'http://ollama:11434').replace(/\/$/, ''),
  model: env('AI_MODEL', 'qwen3.5:2b'),
  think: bool('AI_THINK', false),

  translationUrl: env('TRANSLATION_URL', 'http://translator:4040').replace(/\/$/, ''),
  translationServiceTimeoutMs: number('TRANSLATION_SERVICE_TIMEOUT_MS', 30_000, { min: 1, integer: true }),
  translationFallbackToQwen: bool('TRANSLATION_FALLBACK_TO_QWEN', true),

  visionProviders: list('VISION_PROVIDERS', 'groq,cloudflare'),
  visionConcurrency: number('VISION_CONCURRENCY', 1, { min: 1, integer: true }),
  visionProviderTimeoutMs: number('VISION_PROVIDER_TIMEOUT_MS', 30_000, { min: 1, integer: true }),
  visionCooldownMs: number('VISION_COOLDOWN_MS', 5 * 60_000, { min: 0, integer: true }),
  visionCacheTtlMs: number('VISION_CACHE_TTL_MS', 30 * 24 * 60 * 60_000, { min: 1, integer: true }),
  groqApiKey: env('GROQ_API_KEY'),
  groqVisionModel: env('GROQ_VISION_MODEL', 'qwen/qwen3.6-27b'),
  cloudflareAccountId: env('CLOUDFLARE_ACCOUNT_ID'),
  cloudflareApiToken: env('CLOUDFLARE_API_TOKEN', env('CLOUDFLARE_AUTH_TOKEN')),
  cloudflareVisionModel: env('CLOUDFLARE_VISION_MODEL', '@cf/meta/llama-3.2-11b-vision-instruct'),
  geminiApiKey: env('GEMINI_API_KEY'),
  geminiVisionModel: env('GEMINI_VISION_MODEL', 'gemini-2.5-flash'),
  nvidiaApiKey: env('NVIDIA_API_KEY'),
  nvidiaVisionModel: env('NVIDIA_VISION_MODEL', 'meta/llama-3.2-11b-vision-instruct'),
  huggingfaceApiKey: env('HUGGINGFACE_API_KEY'),
  huggingfaceVisionModel: env('HUGGINGFACE_VISION_MODEL', 'Qwen/Qwen2.5-VL-3B-Instruct'),
  llm7ApiKey: env('LLM7_API_KEY'),
  llm7VisionModel: env('LLM7_VISION_MODEL', 'gpt-4o-mini'),
  openrouterApiKey: env('OPENROUTER_API_KEY'),
  openrouterVisionModel: env('OPENROUTER_VISION_MODEL', 'google/gemma-4-31b-it:free'),
  // Defaults to the same model as text extraction so Ollama keeps a single model
  // loaded (OLLAMA_MAX_LOADED_MODELS=1) instead of swapping between two on every
  // request. Only set OLLAMA_VISION_MODEL separately if that model is multimodal.
  ollamaVisionModel: env('OLLAMA_VISION_MODEL', env('AI_MODEL', 'qwen3.5:2b')),
  ollamaVisionTimeoutMs: number('OLLAMA_VISION_TIMEOUT_MS', 180_000, { min: 1, integer: true }),

  concurrency: number('AI_CONCURRENCY', 1, { min: 1, integer: true }),
  queueMaxPending: number('AI_QUEUE_MAX_PENDING', 100, { min: 1, integer: true }),
  textContext: number('AI_TEXT_CONTEXT', 8192, { min: 256, integer: true }),
  textTimeoutMs: number('AI_TEXT_TIMEOUT_MS', 120_000, { min: 1, integer: true }),
  translationTimeoutMs: number('AI_TRANSLATION_TIMEOUT_MS', 180_000, { min: 1, integer: true }),

  maxRetries: number('AI_MAX_RETRIES', 1, { min: 0, integer: true }),
  maxPhotosPerListing: number('AI_MAX_PHOTOS_PER_LISTING', 4, { min: 1, max: 20, integer: true }),
  minConfidence: number('AI_MIN_CONFIDENCE', 0.6, { min: 0, max: 1 }),
  maxTextChars: number('AI_MAX_TEXT_CHARS', 32_000, { min: 1, integer: true }),
  apiKey: env('AI_API_KEY'),

  promptVersion: number('PROMPT_VERSION', 1, { min: 1, integer: true }),
  schemaVersion: number('SCHEMA_VERSION', 3, { min: 1, integer: true }),
  cacheTtlMs: number('AI_CACHE_TTL_MS', 24 * 60 * 60 * 1000, { min: 1, integer: true }),
  translationCacheTtlMs: number('AI_TRANSLATION_CACHE_TTL_MS', 7 * 24 * 60 * 60 * 1000, { min: 1, integer: true }),
  cacheMaxEntries: number('AI_CACHE_MAX_ENTRIES', 2_000, { min: 10, integer: true }),
});
