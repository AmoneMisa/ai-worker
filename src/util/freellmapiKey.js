import { readFileSync } from 'node:fs';

const cache = new Map();

/**
 * Resolve the FreeLLMAPI unified client key without requiring a dashboard copy/paste.
 *
 * Production exports the router-generated key into the shared FreeLLMAPI data
 * volume before its healthcheck can pass. An explicit FREELLMAPI_API_KEY still
 * wins for direct/local development.
 */
export function resolveFreeLlmApiKey({ explicitKey = '', keyFile = '' } = {}) {
  const direct = String(explicitKey || '').trim();
  if (direct) return direct;

  const path = String(keyFile || '').trim();
  if (!path) return '';
  if (cache.has(path)) return cache.get(path);

  try {
    const key = readFileSync(path, 'utf8').trim();
    if (!key) return '';
    cache.set(path, key);
    return key;
  } catch {
    // The provider layer turns an empty key into *_NOT_CONFIGURED. Keeping this
    // helper quiet avoids leaking filesystem details into request logs.
    return '';
  }
}
