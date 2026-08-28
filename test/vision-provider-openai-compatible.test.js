import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VISION_PROVIDERS = 'groq,gemini,nvidia,huggingface,llm7,openrouter,mistral';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.NVIDIA_API_KEY = 'test-nvidia-key';
process.env.HUGGINGFACE_API_KEY = 'test-huggingface-key';
process.env.LLM7_API_KEY = 'test-llm7-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';

const { emptyVisionResult } = await import('../src/schemas/vision.js');
const { analyzePhotos } = await import('../src/services/vision.js');

test('falls through groq -> gemini to nvidia, the first that succeeds', async () => {
  const vision = emptyVisionResult();
  vision.balcony = { value: true, confidence: 0.9, evidence: ['visible railing'] };

  const originalFetch = global.fetch;
  const calledUrls = [];
  global.fetch = async (url) => {
    calledUrls.push(String(url));
    if (String(url).includes('api.groq.com')) return new Response('down', { status: 503 });
    if (String(url).includes('generativelanguage.googleapis.com')) return new Response('down', { status: 503 });
    if (String(url).includes('integrate.api.nvidia.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(vision) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    const result = await analyzePhotos(['https://example.com/flat.jpg']);
    assert.equal(result.provider, 'nvidia');
    assert.equal(result.data.balcony.value, true);
    assert.deepEqual(calledUrls.map((u) => new URL(u).hostname), [
      'api.groq.com',
      'generativelanguage.googleapis.com',
      'integrate.api.nvidia.com',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
