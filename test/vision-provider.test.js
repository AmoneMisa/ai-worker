import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VISION_PROVIDERS = 'groq,cloudflare';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
process.env.CLOUDFLARE_API_TOKEN = 'test-cloudflare-token';

const { emptyVisionResult } = await import('../src/schemas/vision.js');
const { analyzePhotos } = await import('../src/services/vision.js');

test('vision falls back between providers and caches the successful result', async () => {
  const vision = emptyVisionResult();
  vision.kitchenVisible = { value: true, confidence: 0.95, evidence: ['visible kitchen'] };

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    if (String(url).includes('api.groq.com')) {
      return new Response('temporary failure', { status: 503 });
    }
    if (String(url).includes('api.cloudflare.com')) {
      return new Response(JSON.stringify({ result: { response: JSON.stringify(vision) } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    const first = await analyzePhotos(['https://example.com/flat.jpg']);
    assert.equal(first.cached, false);
    assert.equal(first.provider, 'cloudflare');
    assert.equal(first.data.kitchenVisible.value, true);
    assert.equal(calls, 2);

    const second = await analyzePhotos(['https://example.com/flat.jpg']);
    assert.equal(second.cached, true);
    assert.equal(second.provider, 'cloudflare');
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
