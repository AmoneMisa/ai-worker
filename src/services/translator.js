import { config } from '../config.js';

export async function requestTranslation(text, targetLanguage) {
  if (!config.translationUrl) throw Object.assign(new Error('TRANSLATION_SERVICE_DISABLED'), { code: 'TRANSLATION_SERVICE_DISABLED' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.translationServiceTimeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.translationUrl}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text, targetLanguage }),
      signal: ctrl.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`TRANSLATION_SERVICE_HTTP_${response.status}: ${body.slice(0, 200)}`);
      error.code = 'TRANSLATION_SERVICE_UNAVAILABLE';
      throw error;
    }
    const data = await response.json();
    if (!data?.translatedText) {
      const error = new Error('TRANSLATION_SERVICE_EMPTY');
      error.code = 'TRANSLATION_SERVICE_INVALID';
      throw error;
    }
    return {
      data: {
        translatedText: String(data.translatedText).trim(),
        sourceLanguage: data.sourceLanguage || null,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.8,
      },
      engine: data.engine || 'm2m100-418m-ctranslate2-int8',
      timings: {
        totalMs: Number(data.timings?.totalMs) || (Date.now() - startedAt),
        roundTripMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('TRANSLATION_SERVICE_TIMEOUT');
      timeout.code = 'TRANSLATION_SERVICE_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function translatorHealthy() {
  if (!config.translationUrl) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const response = await fetch(`${config.translationUrl}/health`, { signal: ctrl.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
