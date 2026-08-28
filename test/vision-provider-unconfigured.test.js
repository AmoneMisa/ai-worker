import test from 'node:test';
import assert from 'node:assert/strict';

// No GEMINI_API_KEY/NVIDIA_API_KEY set in this process.
const { VISION_PROVIDERS } = await import('../src/services/vision-providers.js');

test('a provider with no API key configured fails instantly without a network call', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('should not have called fetch for an unconfigured provider'); };

  try {
    await assert.rejects(
      VISION_PROVIDERS.nvidia([{ id: 'photo_1', url: 'https://example.com/flat.jpg' }]),
      (error) => {
        assert.match(error.message, /NVIDIA_NOT_CONFIGURED/);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
