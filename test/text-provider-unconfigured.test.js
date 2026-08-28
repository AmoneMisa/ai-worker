import test from 'node:test';
import assert from 'node:assert/strict';

// No NVIDIA_API_KEY set in this process.
const { TEXT_PROVIDERS } = await import('../src/services/text-providers.js');

test('a provider with no API key configured fails instantly without a network call', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('should not have called fetch for an unconfigured provider'); };

  try {
    await assert.rejects(
      TEXT_PROVIDERS.nvidia({ schema: {}, systemPrompt: 'system', payload: { text: 'x' } }),
      (error) => {
        assert.match(error.message, /NVIDIA_NOT_CONFIGURED/);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
