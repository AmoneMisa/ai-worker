// Shared HTTP wrapper for external LLM providers (vision + text). Handles the
// timeout/abort/retryable-status/metrics bookkeeping so vision-providers.js
// and text-providers.js don't duplicate it.
import { config } from '../config.js';
import { recordProviderResult } from './metrics.js';

export async function fetchJson(url, options, provider, { bucket = 'visionProviders', timeoutMs } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.visionProviderTimeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: ctrl.signal });
    const ms = Date.now() - started;
    if (!response.ok) {
      recordProviderResult(bucket, provider, { ok: false, ms, status: response.status });
      const body = await response.text().catch(() => '');
      const error = new Error(`${provider.toUpperCase()}_HTTP_${response.status}: ${body.slice(0, 200)}`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    recordProviderResult(bucket, provider, { ok: true, ms });
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      recordProviderResult(bucket, provider, { ok: false, ms: Date.now() - started, timeout: true });
      const timeout = new Error(`${provider.toUpperCase()}_TIMEOUT`);
      timeout.code = 'PROVIDER_TIMEOUT';
      timeout.retryable = true;
      throw timeout;
    }
    if (!error?.status) recordProviderResult(bucket, provider, { ok: false, ms: Date.now() - started });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parseModelJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}
