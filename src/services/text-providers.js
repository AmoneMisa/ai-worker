// Text-only sibling of vision-providers.js: same OpenAI-compatible providers,
// same JSON-object response mode, but no image content parts. The JSON Schema
// for the requested extraction kind travels inside the user payload (the system
// prompt already instructs the model to match "the supplied JSON schema").
import { config } from '../config.js';
import { fetchJson, parseModelJson } from '../util/httpProvider.js';
import { resolveFreeLlmApiKey } from '../util/freellmapiKey.js';

function validate(value) {
  try {
    return parseModelJson(value);
  } catch {
    const error = new Error('TEXT_SCHEMA_INVALID');
    error.code = 'TEXT_SCHEMA_INVALID';
    throw error;
  }
}

async function openAiCompatibleText(provider, { baseUrl, apiKey, model, extraBody = {} }, { schema, systemPrompt, payload }) {
  if (!apiKey) {
    throw Object.assign(new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`), { code: 'TEXT_PROVIDER_NOT_CONFIGURED' });
  }
  const data = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ schema, ...payload }) },
      ],
      temperature: 0,
      max_completion_tokens: 2400,
      response_format: { type: 'json_object' },
      ...extraBody,
    }),
  }, provider, { bucket: 'textProviders', timeoutMs: config.textTimeoutMs });
  return validate(data?.choices?.[0]?.message?.content);
}

async function freellmapi(request) {
  return openAiCompatibleText('freellmapi', {
    baseUrl: config.freeLlmApiBaseUrl,
    apiKey: resolveFreeLlmApiKey({
      explicitKey: config.freeLlmApiKey,
      keyFile: config.freeLlmApiKeyFile,
    }),
    model: config.freeLlmApiTextModel,
  }, request);
}

async function groq(request) {
  return openAiCompatibleText('groq', {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: config.groqApiKey,
    model: config.groqTextModel,
    extraBody: { reasoning_effort: 'none' },
  }, request);
}

async function gemini(request) {
  return openAiCompatibleText('gemini', {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: config.geminiApiKey,
    model: config.geminiTextModel,
  }, request);
}

async function nvidia(request) {
  return openAiCompatibleText('nvidia', {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: config.nvidiaApiKey,
    model: config.nvidiaTextModel,
  }, request);
}

async function huggingface(request) {
  return openAiCompatibleText('huggingface', {
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey: config.huggingfaceApiKey,
    model: config.huggingfaceTextModel,
  }, request);
}

async function llm7(request) {
  return openAiCompatibleText('llm7', {
    baseUrl: 'https://api.llm7.io/v1',
    apiKey: config.llm7ApiKey,
    model: config.llm7TextModel,
  }, request);
}

async function openrouter(request) {
  return openAiCompatibleText('openrouter', {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: config.openrouterApiKey,
    model: config.openrouterTextModel,
  }, request);
}

async function mistral(request) {
  return openAiCompatibleText('mistral', {
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: config.mistralApiKey,
    model: config.mistralTextModel,
  }, request);
}

export const TEXT_PROVIDERS = Object.freeze({
  freellmapi, groq, gemini, nvidia, huggingface, llm7, openrouter, mistral,
});
