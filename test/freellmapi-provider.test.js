import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TEXT_PROVIDERS = 'freellmapi';
process.env.VISION_PROVIDERS = 'freellmapi';
process.env.FREELLMAPI_BASE_URL = 'http://freellmapi.test:3001/v1';
process.env.FREELLMAPI_API_KEY = 'freellmapi-test-key';
process.env.FREELLMAPI_TEXT_MODEL = 'auto:balanced';
process.env.FREELLMAPI_VISION_MODEL = 'auto:smart';

const { emptyVisionResult } = await import('../src/schemas/vision.js');
const { runText } = await import('../src/services/text.js');
const { analyzePhotos } = await import('../src/services/vision.js');

test('FreeLLMAPI uses one OpenAI-compatible gateway for text and vision', async () => {
  const vision = emptyVisionResult();
  vision.balcony = { value: true, confidence: 0.95, evidence: ['photo_1'] };

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), headers: init.headers, body });
    const isVision = Array.isArray(body.messages?.[0]?.content);
    const content = isVision ? vision : { rooms: 2 };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-routed-via': 'free-test-provider' },
    });
  };

  try {
    const text = await runText({
      schema: { type: 'object' },
      systemPrompt: 'Return JSON',
      payload: { rawText: '2 rooms' },
    });
    const image = await analyzePhotos(['https://example.com/flat.jpg']);

    assert.equal(text.provider, 'freellmapi');
    assert.deepEqual(text.data, { rooms: 2 });
    assert.equal(image.provider, 'freellmapi');
    assert.equal(image.data.balcony.value, true);

    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'http://freellmapi.test:3001/v1/chat/completions');
    assert.equal(requests[0].body.model, 'auto:balanced');
    assert.equal(requests[1].body.model, 'auto:smart');
    assert.match(requests[0].headers.authorization, /^Bearer freellmapi-test-key$/);
    assert.ok(requests[1].body.messages[0].content.some((part) => part.type === 'image_url'));
  } finally {
    global.fetch = originalFetch;
  }
});
