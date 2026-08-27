import { config } from '../config.js';
import { recordVisionProvider } from '../util/metrics.js';
import { VisionSchema, visionJsonSchema, emptyVisionResult, sanitizeVision } from '../schemas/vision.js';
import { visionPrompt } from '../prompts/vision.js';
import { structured } from '../ollama/client.js';

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

// Shared shape for OpenAI-compatible chat-completions vision APIs (Groq,
// Gemini, NVIDIA NIM, GitHub Models all speak this dialect).
async function openAiCompatibleVision(provider, { baseUrl, apiKey, model, extraBody = {} }, images) {
  if (!apiKey) {
    throw Object.assign(new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`), { code: 'VISION_PROVIDER_NOT_CONFIGURED' });
  }
  const selected = images.slice(0, 3);
  const content = [{ type: 'text', text: visionPrompt(selected.map((image) => image.id)) }];
  for (const image of selected) content.push({ type: 'image_url', image_url: { url: image.url } });
  const data = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' },
      ...extraBody,
    }),
  }, provider);
  return validate(data?.choices?.[0]?.message?.content);
}

async function groq(images) {
  return openAiCompatibleVision('groq', {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: config.groqApiKey,
    model: config.groqVisionModel,
    extraBody: { reasoning_effort: 'none' },
  }, images);
}

async function gemini(images) {
  return openAiCompatibleVision('gemini', {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: config.geminiApiKey,
    model: config.geminiVisionModel,
  }, images);
}

async function nvidia(images) {
  return openAiCompatibleVision('nvidia', {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: config.nvidiaApiKey,
    model: config.nvidiaVisionModel,
  }, images);
}

async function githubModels(images) {
  return openAiCompatibleVision('githubmodels', {
    baseUrl: 'https://models.github.ai/inference',
    apiKey: config.githubModelsToken,
    model: config.githubVisionModel,
  }, images);
}

async function huggingface(images) {
  return openAiCompatibleVision('huggingface', {
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey: config.huggingfaceApiKey,
    model: config.huggingfaceVisionModel,
  }, images);
}

async function llm7(images) {
  return openAiCompatibleVision('llm7', {
    baseUrl: 'https://api.llm7.io/v1',
    apiKey: config.llm7ApiKey,
    model: config.llm7VisionModel,
  }, images);
}

async function openrouter(images) {
  return openAiCompatibleVision('openrouter', {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: config.openrouterApiKey,
    model: config.openrouterVisionModel,
  }, images);
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

async function toBase64Image(image) {
  if (/^data:image\//i.test(image.url)) {
    const comma = image.url.indexOf(',');
    return comma >= 0 ? image.url.slice(comma + 1) : '';
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.visionProviderTimeoutMs);
  try {
    const response = await fetch(image.url, { signal: ctrl.signal });
    if (!response.ok) throw new Error(`IMAGE_FETCH_HTTP_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } finally {
    clearTimeout(timer);
  }
}

async function ollama(images) {
  const selected = images.slice(0, 3);
  const started = Date.now();
  try {
    const base64Images = await Promise.all(selected.map(toBase64Image));
    const { data } = await structured({
      schema: visionJsonSchema,
      systemPrompt: visionPrompt(selected.map((image) => image.id)),
      payload: 'Analyze the attached apartment listing photos and return the JSON object described above.',
      images: base64Images,
      model: config.ollamaVisionModel,
      timeoutMs: config.ollamaVisionTimeoutMs,
    });
    recordVisionProvider('ollama', { ok: true, ms: Date.now() - started });
    return validate(data);
  } catch (error) {
    const retryable = error?.code === 'OLLAMA_TIMEOUT' || error?.code === 'OLLAMA_UNAVAILABLE'
      || /OLLAMA_HTTP_5\d\d/.test(error?.message || '');
    recordVisionProvider('ollama', { ok: false, ms: Date.now() - started, timeout: error?.code === 'OLLAMA_TIMEOUT' });
    const wrapped = new Error(`OLLAMA_VISION_FAILED: ${error.message}`);
    wrapped.retryable = retryable;
    throw wrapped;
  }
}

export const VISION_PROVIDERS = Object.freeze({
  groq, gemini, nvidia, githubmodels: githubModels, huggingface, llm7, openrouter, cloudflare, ollama,
});
