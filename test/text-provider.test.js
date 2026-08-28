import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TEXT_PROVIDERS = 'groq,gemini,nvidia,huggingface,llm7,openrouter,mistral';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.NVIDIA_API_KEY = 'test-nvidia-key';
process.env.HUGGINGFACE_API_KEY = 'test-huggingface-key';
process.env.LLM7_API_KEY = 'test-llm7-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';

const { apartmentJsonSchema } = await import('../src/schemas/apartment.js');
const { APARTMENT_SYSTEM, apartmentPayload } = await import('../src/prompts/apartment.js');
const { runText } = await import('../src/services/text.js');

test('falls through groq -> gemini to nvidia, the first that succeeds', async () => {
  const data = { dealType: 'rent', propertyType: 'apartment' };

  const originalFetch = global.fetch;
  const calledUrls = [];
  global.fetch = async (url) => {
    calledUrls.push(String(url));
    if (String(url).includes('api.groq.com')) return new Response('down', { status: 503 });
    if (String(url).includes('generativelanguage.googleapis.com')) return new Response('down', { status: 503 });
    if (String(url).includes('integrate.api.nvidia.com')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  try {
    const result = await runText({
      schema: apartmentJsonSchema,
      systemPrompt: APARTMENT_SYSTEM,
      payload: apartmentPayload({ text: 'Kvartira ijaraga beriladi', knownFacts: {} }),
    });
    assert.equal(result.provider, 'nvidia');
    assert.deepEqual(result.data, data);
    assert.deepEqual(calledUrls.map((u) => new URL(u).hostname), [
      'api.groq.com',
      'generativelanguage.googleapis.com',
      'integrate.api.nvidia.com',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
