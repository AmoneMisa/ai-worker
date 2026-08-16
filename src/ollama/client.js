// Ollama-backed AIClient (spec §39). Business logic depends only on this
// interface — structured({ schema, systemPrompt, payload, images, ... }) — so the
// engine (Ollama/Qwen today) can later be swapped for another local model or a
// cloud fallback without touching the parsers.
import { config } from '../config.js';
import { log } from '../util/logger.js';

async function chat(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    return await res.json();
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

// Returns the parsed JSON object the model produced. Structured Outputs only —
// we pass a JSON Schema as `format`, never parse markdown (spec §12). Validation
// (zod + business rules) happens in the caller (spec §13).
export async function structured({ schema, systemPrompt, payload, images, model, contextSize, timeoutMs }) {
  const userMsg = { role: 'user', content: typeof payload === 'string' ? payload : JSON.stringify(payload) };
  if (Array.isArray(images) && images.length) userMsg.images = images; // base64 strings

  const data = await chat(
    {
      model: model || config.model,
      stream: false,
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
    return { data: JSON.parse(content), timings: { totalMs: (data.total_duration || 0) / 1e6, evalCount: data.eval_count } };
  } catch {
    const err = new Error('INVALID_AI_JSON: not JSON');
    err.code = 'INVALID_AI_JSON';
    throw err;
  }
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
