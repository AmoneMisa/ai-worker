// Ollama-backed AIClient (spec §39). Business logic depends only on this
// interface so the engine (Ollama/Qwen today) can later be swapped without
// touching deterministic parsers.
import { config } from '../config.js';
import { log } from '../util/logger.js';

async function chat(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`OLLAMA_HTTP_${res.status}: ${text.slice(0, 200)}`);
      err.code = 'OLLAMA_UNAVAILABLE';
      throw err;
    }
    const data = await res.json();
    data._roundTripMs = Date.now() - startedAt;
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('OLLAMA_TIMEOUT');
      err.code = 'OLLAMA_TIMEOUT';
      throw err;
    }
    if (!e.code) e.code = 'OLLAMA_UNAVAILABLE';
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function timings(data) {
  return {
    totalMs: (data.total_duration || 0) / 1e6,
    ollamaDurationMs: (data.total_duration || 0) / 1e6,
    roundTripMs: data._roundTripMs || 0,
    loadMs: (data.load_duration || 0) / 1e6,
    promptEvalMs: (data.prompt_eval_duration || 0) / 1e6,
    evalMs: (data.eval_duration || 0) / 1e6,
    promptEvalCount: data.prompt_eval_count || 0,
    evalCount: data.eval_count || 0,
  };
}

// Structured Outputs are used for apartment/vacancy extraction where schema
// validation is valuable. Translation intentionally does NOT use this path: on
// CPU the JSON schema materially increases prompt-prefill cost for a task whose
// natural output is already plain text.
export async function structured({ schema, systemPrompt, payload, images, model, contextSize, timeoutMs }) {
  const userMsg = { role: 'user', content: typeof payload === 'string' ? payload : JSON.stringify(payload) };
  if (Array.isArray(images) && images.length) userMsg.images = images; // base64 strings

  const data = await chat(
    {
      model: model || config.model,
      stream: false,
      think: config.think,
      format: schema,
      options: { temperature: 0, num_ctx: contextSize || config.textContext },
      messages: [{ role: 'system', content: systemPrompt }, userMsg],
    },
    timeoutMs || config.textTimeoutMs,
  );

  const content = data?.message?.content;
  if (!content) {
    const err = new Error('INVALID_AI_JSON: empty content');
    err.code = 'INVALID_AI_JSON';
    throw err;
  }
  try {
    return { data: JSON.parse(content), timings: timings(data) };
  } catch {
    const err = new Error('INVALID_AI_JSON: not JSON');
    err.code = 'INVALID_AI_JSON';
    throw err;
  }
}

// Interactive translation gets a deliberately tiny instruction prompt and no
// JSON schema. The original listing text is sent directly as the user message,
// reducing the ~1k-token structured prompt overhead visible on CPU-only Qwen.
export async function translate({ text, targetLanguage, model, contextSize, timeoutMs }) {
  const language = String(targetLanguage || 'Russian').trim() || 'Russian';
  const systemPrompt = [
    `Translate the user's complete text into ${language}.`,
    'Preserve line breaks, names, addresses, monetary amounts, measurements, URLs, usernames and phone numbers.',
    'Understand informal Uzbek in Latin or Cyrillic and common real-estate shorthand.',
    'Do not summarize, omit, explain or add information. Output only the translated text.',
  ].join(' ');

  const data = await chat(
    {
      model: model || config.model,
      stream: false,
      think: config.think,
      options: { temperature: 0, num_ctx: contextSize || config.textContext },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(text || '') },
      ],
    },
    timeoutMs || config.translationTimeoutMs,
  );

  const content = String(data?.message?.content || '').trim();
  if (!content) {
    const err = new Error('INVALID_TRANSLATION: empty content');
    err.code = 'INVALID_TRANSLATION';
    throw err;
  }
  return { data: content, timings: timings(data) };
}

// Health probe (spec §31). Never throws — returns a boolean.
export async function ollamaHealthy() {
  let timer;
  try {
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: ctrl.signal });
    return res.ok;
  } catch (e) {
    log.warn('ollama health check failed', { error: e.message });
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
