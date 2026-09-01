import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FREE_TRANSLATOR_ENABLED = 'true';
process.env.FREE_TRANSLATOR_MAX_BYTES = '500';

const { tryFreeTranslation } = await import('../src/services/free-translation.js');

test('free translator is attempted first for a confidently detected short text', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Вакансия консультанта' } }));
  };
  try {
    const result = await tryFreeTranslation('コンサルタントの求人', 'Russian');
    assert.equal(result.provider, 'mymemory');
    assert.equal(result.data.translatedText, 'Вакансия консультанта');
    assert.equal(new URL(requestedUrl).searchParams.get('langpair'), 'ja|ru');
  } finally {
    global.fetch = originalFetch;
  }
});

test('ambiguous Latin text falls through to the free LLM chain', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('translator should not be called'); };
  try {
    assert.equal(await tryFreeTranslation('Business consultant vacancy', 'Russian'), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('text above the official 500-byte segment limit falls through', async () => {
  assert.equal(await tryFreeTranslation('求人'.repeat(300), 'Russian'), null);
});
