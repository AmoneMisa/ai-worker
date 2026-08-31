import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveFreeLlmApiKey } from '../src/util/freellmapiKey.js';

test('explicit FreeLLMAPI key overrides file discovery', () => {
  assert.equal(resolveFreeLlmApiKey({
    explicitKey: ' freellmapi-explicit ',
    keyFile: '/does/not/exist.key',
  }), 'freellmapi-explicit');
});

test('FreeLLMAPI unified key is discovered from the exported shared file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-worker-freellmapi-'));
  const keyFile = join(dir, 'unified.key');
  try {
    writeFileSync(keyFile, 'freellmapi-generated-test\n', { mode: 0o600 });
    assert.equal(resolveFreeLlmApiKey({ keyFile }), 'freellmapi-generated-test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing FreeLLMAPI key file degrades to an unconfigured provider', () => {
  assert.equal(resolveFreeLlmApiKey({ keyFile: '/does/not/exist.key' }), '');
});
