import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { resolveFreeLlmApiKey } from '../src/util/freellmapiKey.js';

test('explicit FreeLLMAPI key overrides SQLite discovery', () => {
  assert.equal(resolveFreeLlmApiKey({
    explicitKey: ' freellmapi-explicit ',
    dbPath: '/does/not/exist.db',
  }), 'freellmapi-explicit');
});

test('FreeLLMAPI unified key is discovered from a read-only SQLite database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-worker-freellmapi-'));
  const dbPath = join(dir, 'freellmapi.db');
  try {
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('unified_api_key', 'freellmapi-generated-test');
    db.close();

    assert.equal(resolveFreeLlmApiKey({ dbPath }), 'freellmapi-generated-test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing FreeLLMAPI database degrades to an unconfigured provider', () => {
  assert.equal(resolveFreeLlmApiKey({ dbPath: '/does/not/exist.db' }), '');
});
