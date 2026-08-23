import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { memoryGet, memorySet } from '../cache/memory.js';
import { log } from '../util/logger.js';
import { recordVisionProvider } from '../util/metrics.js';
import { VisionSchema, emptyVisionResult, sanitizeVision } from '../schemas/vision.js';
import { visionPrompt } from '../prompts/vision.js';

const cooldownUntil = new Map();
const CACHE_PREFIX = 'ai:vision:';
let active = 0;
const waiters = [];

async function acquire() {
  if (active < config.visionConcurrency) {
    active += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  active += 1;
}

function release() {
  active = Math.max(0, active - 1);
  waiters.shift()?.();
}

function cacheKey(images) {
  const h = createHash('sha256');
  h.update(`vision:v${config.promptVersion}:s${config.schemaVersion}\n`);
  for (const image of images) h.update(`${image}\n`);
  return h.digest('hex').slice(0, 40);
}

function normalizeImages(images) {
  return images.slice(0, config.maxPhotosPerListing).map((image, index) => {
    if (typeof image === 'string') return { id: `photo_${index + 1}`, url: image };
    return { id: String(image?.id || `photo_${index + 1}`), url: String(image?.url || image?.dataUrl || '') };
  }).filter((x) => /^https?:\/\//i.test(x.url) || /^data:image\//i.test(x.url));
}

async function fetchJson(url, options, provider) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.visionProviderTimeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const ms = Date.now() - started;
    if (!res.ok) {
      recordVisionProvider(provider, { ok: false, ms, status: res.status });
      if (res.status === 429 || res.status >= 500) cooldownUntil.set(provider, Date.now() + config.visionCooldownMs);
      const body = await res.text().catch(() => '');
      const err = new Error(`${provider.toUpperCase()}_HTTP_${res.status}: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    recordVisionProvider(provider, { ok: true, ms });
    return await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      recordVisionProvider(provider, { ok: false, ms: Date.now() - started, timeout: true });
      cooldownUntil.set(provider, Date.now() + config.visionCooldownMs);
      throw new Error(`${provider.toUpperCase()}_TIMEOUT`);
    }
    if (!error?.status) recordVisionProvider(provider, { ok: false, ms: Date.now() - started });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function validate(value) {
  const parsed = VisionSchema.safeParse(parseModelJson(value));
  if (!parsed.success) throw new Error('VISION_SCHEMA_INVALID');
  return sanitizeVision(parsed.data);
}

async function groq(images) {
  if (!config.groqApiKey) throw new Error('GROQ_NOT_CONFIGURED');
  const selected = images.slice(0, 3);
  const content = [{ type: 'text', text: visionPrompt(selected.map((x) => x.id)) }];
  for (const image of selected) content.push({ type: 'image_url', image_url: { url: image.url } });
  const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.groqApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.groqVisionModel,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
    }),
  }, 'groq');
  return validate(data?.choices?.[0]?.message?.content);
}

function mergePhotoResults(items) {
  const out = emptyVisionResult();
  for (const item of items) {
    for (const [field, candidate] of Object.entries(item || {})) {
      if (!candidate || candidate.value == null) continue;
      const current = out[field];
      if (!current || current.value == null || candidate.confidence > current.confidence) {
        out[field] = candidate;
      } else if (typeof candidate.value === 'number' && typeof current.value === 'number') {
        out[field] = candidate.value > current.value ? candidate : current;
      } else if (candidate.value === true && current.value === true) {
        out[field] = {
          value: true,
          confidence: Math.max(current.confidence, candidate.confidence),
          evidence: [...new Set([...(current.evidence || []), ...(candidate.evidence || [])])],
        };
      }
    }
  }
  return sanitizeVision(out);
}

async function cloudflare(images) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) throw new Error('CLOUDFLARE_NOT_CONFIGURED');
  const results = [];
  for (const image of images) {
    const data = await fetchJson(
      `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/${config.cloudflareVisionModel}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${config.cloudflareApiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: visionPrompt([image.id]) }],
          image: image.url,
          max_tokens: 1200,
        }),
      },
      'cloudflare',
    );
    const raw = data?.result?.response ?? data?.result ?? data?.response;
    results.push(validate(raw));
  }
  return mergePhotoResults(results);
}

const PROVIDERS = { groq, cloudflare };

async function analyzeNow(inputImages) {
  const images = normalizeImages(Array.isArray(inputImages) ? inputImages : []);
  if (!images.length) throw new Error('VISION_NO_VALID_IMAGES');

  const key = cacheKey(images.map((x) => `${x.id}:${x.url}`));
  const cached = memoryGet(CACHE_PREFIX + key);
  if (cached) return { cached: true, ...cached };

  const errors = [];
  for (const provider of config.visionProviders) {
    const run = PROVIDERS[provider];
    if (!run) continue;
    if ((cooldownUntil.get(provider) || 0) > Date.now()) continue;
    try {
      const data = await run(images);
      const record = { provider, data, analyzedAt: new Date().toISOString() };
      memorySet(CACHE_PREFIX + key, record, config.visionCacheTtlMs);
      return { cached: false, ...record };
    } catch (error) {
      errors.push(`${provider}:${error.message}`);
      log.warn('vision provider failed', { provider, error: error.message });
    }
  }
  const error = new Error(`VISION_PROVIDERS_FAILED: ${errors.join(' | ') || 'none available'}`);
  error.code = 'VISION_PROVIDERS_FAILED';
  throw error;
}

export async function analyzePhotos(inputImages) {
  await acquire();
  try {
    return await analyzeNow(inputImages);
  } finally {
    release();
  }
}
