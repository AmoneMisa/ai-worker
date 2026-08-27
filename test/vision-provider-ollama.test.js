import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VISION_PROVIDERS = 'ollama';
process.env.OLLAMA_URL = 'http://ollama.test:11434';

const { emptyVisionResult } = await import('../src/schemas/vision.js');
const { analyzePhotos } = await import('../src/services/vision.js');

test('ollama vision provider sends base64 images and validates the structured result', async () => {
  const vision = emptyVisionResult();
  vision.balcony = { value: true, confidence: 0.9, evidence: ['railing visible'] };

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('example.com')) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (String(url).includes('ollama.test')) {
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'qwen3.5:2b');
      assert.ok(Array.isArray(body.messages[1].images));
      assert.equal(body.messages[1].images[0], Buffer.from([1, 2, 3]).toString('base64'));
      return new Response(JSON.stringify({ message: { content: JSON.stringify(vision) } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    const result = await analyzePhotos(['https://example.com/flat.jpg']);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.data.balcony.value, true);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ollama vision provider marks timeouts as retryable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('example.com')) return new Response(new Uint8Array([1]), { status: 200 });
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  try {
    await assert.rejects(
      analyzePhotos(['https://example.com/flat2.jpg']),
      (error) => {
        assert.match(error.message, /OLLAMA_VISION_FAILED/);
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
