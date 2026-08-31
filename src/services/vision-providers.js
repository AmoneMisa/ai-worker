import { config } from '../config.js';
import { VisionSchema, emptyVisionResult, sanitizeVision } from '../schemas/vision.js';
import { visionPrompt } from '../prompts/vision.js';
import { fetchJson, parseModelJson } from '../util/httpProvider.js';
import { resolveFreeLlmApiKey } from '../util/freellmapiKey.js';

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

// Shared shape for OpenAI-compatible chat-completions vision APIs. FreeLLMAPI
// speaks this dialect and routes image requests only to vision-capable free
// endpoints. Direct providers remain available for explicit opt-in/debugging.
async function openAiCompatibleVision(provider, { baseUrl, apiKey, model, extraBody = {} }, images) {
  if (!apiKey) {
    throw Object.assign(new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`), { code: 'VISION_PROVIDER_NOT_CONFIGURED' });
  }
  const selected = images.slice(0, config.maxPhotosPerListing);
  const content = [{ type: 'text', text: visionPrompt(selected.map((image) => image.id)) }];
  for (const image of selected) content.push({ type: 'image_url', image_url: { url: image.url } });
  const data = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_completion_tokens: 3200,
      response_format: { type: 'json_object' },
      ...extraBody,
    }),
  }, provider);
  return validate(data?.choices?.[0]?.message?.content);
}

async function freellmapi(images) {
  return openAiCompatibleVision('freellmapi', {
    baseUrl: config.freeLlmApiBaseUrl,
    apiKey: resolveFreeLlmApiKey({
      explicitKey: config.freeLlmApiKey,
      keyFile: config.freeLlmApiKeyFile,
    }),
    model: config.freeLlmApiVisionModel,
  }, images);
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

async function mistral(images) {
  return openAiCompatibleVision('mistral', {
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: config.mistralApiKey,
    model: config.mistralVisionModel,
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
          max_tokens: 3200,
        }),
      },
      'cloudflare',
    );
    const raw = data?.result?.response ?? data?.result ?? data?.response;
    results.push(validate(raw));
  }
  return mergePhotoResults(results);
}

export const VISION_PROVIDERS = Object.freeze({
  freellmapi, groq, gemini, nvidia, huggingface, llm7, openrouter, mistral, cloudflare,
});
