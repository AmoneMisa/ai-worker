import { DatabaseSync } from 'node:sqlite';

const cache = new Map();

/**
 * Resolve the FreeLLMAPI unified client key without requiring a dashboard copy/paste.
 *
 * Production mounts FreeLLMAPI's persistent SQLite volume read-only into ai-worker.
 * An explicit FREELLMAPI_API_KEY still wins for local development/overrides.
 */
export function resolveFreeLlmApiKey({ explicitKey = '', dbPath = '' } = {}) {
  const direct = String(explicitKey || '').trim();
  if (direct) return direct;

  const path = String(dbPath || '').trim();
  if (!path) return '';
  if (cache.has(path)) return cache.get(path);

  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key' LIMIT 1").get();
    const key = String(row?.value || '').trim();
    if (!key) return '';
    cache.set(path, key);
    return key;
  } catch {
    // The provider layer turns an empty key into *_NOT_CONFIGURED. Keeping this
    // helper quiet avoids leaking filesystem/database details into request logs.
    return '';
  } finally {
    try { db?.close(); } catch {}
  }
}
