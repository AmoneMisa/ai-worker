import { config } from '../config.js';
import { recordVisionProvider } from '../util/metrics.js';
import { VisionSchema, emptyVisionResult, sanitizeVision } from '../schemas/vision.js';
import { visionPrompt } from '../prompts/vision.js';

async function fetchJson(url, options, provider) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.visionProviderTimeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: ctrl.signal });
    const ms = Date.now() - started;
    if (!response.ok) {
      recordVisionProvider(provider, { ok: false, ms, status: response.status });
      const body = await response.text().catch(() => '');
      const error = new Error(`${provider.toUpperCase()}_HTTP_${response.status}: ${body.slice(0, 200)}`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    recordVisionProvider(provider, { ok: true, ms });
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      recordVisionProvider(provider, { ok: false, ms: Date.now() - started, timeout: true });
      const timeout = new Error(`${provider.toUpperCase()}_TIMEOUT`);
      timeout.code = 'VISION_PROVIDER_TIMEOUT';
      timeout.retryable = true;
      throw timeout;
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
  let parsedJson;
  try {
    parsedJson = parseModelJson(value);
  } catch {
    const error = new Error('VISION_SCHEMA_INVALID');
    error.code = 'VISION_SCHEMA_INVALID';
    throw error;
  }
  const parsed = VisionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const error = new Error('VISION_SCHEMA_INVALID');
    error.code = 'VISION_SCHEMA_INVALID';
    throw error;
  }
  return sanitizeVision(parsed.data);
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

async function groq(images) {
  if (!config.groqApiKey) throw Object.assign(new Error('GROQ_NOT_CONFIGURED'), { code: 'VISION_PROVIDER_NOT_CONFIGURED' });
  const selected = images.slice(0, 3);
  const content = [{ type: 'text', text: visionPrompt(selected.map((image) => image.id)) }];
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

async function cloudflare(images) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
    throw Object.assign(new Error('CLOUDFLARE_NOT_CONFIGURED'), { code: 'VISION_PROVIDER_NOT_CONFIGURED' });
  }
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

export const VISION_PROVIDERS = Object.freeze({ groq, cloudflare });
