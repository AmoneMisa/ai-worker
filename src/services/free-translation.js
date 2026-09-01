import { config } from '../config.js';

const SCRIPT_LANGUAGES = [
  [/\p{Script=Hiragana}|\p{Script=Katakana}/u, 'ja'],
  [/\p{Script=Hangul}/u, 'ko'],
  [/\p{Script=Han}/u, 'zh-CN'],
  [/\p{Script=Arabic}/u, 'ar'],
];

function confidentSourceLanguage(text) {
  for (const [pattern, language] of SCRIPT_LANGUAGES) {
    if (pattern.test(text)) return language;
  }
  if (/[іїєґ]/iu.test(text)) return 'uk';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  return null;
}

export async function tryFreeTranslation(text, targetLanguage) {
  if (!config.freeTranslatorEnabled) return null;
  const source = confidentSourceLanguage(text);
  const target = targetLanguage === 'Russian' ? 'ru' : targetLanguage === 'English' ? 'en' : null;
  if (!source || !target || source === target || Buffer.byteLength(text, 'utf8') > config.freeTranslatorMaxBytes) return null;

  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${source}|${target}`);
  url.searchParams.set('mt', '1');
  const response = await fetch(url, { signal: AbortSignal.timeout(config.freeTranslatorTimeoutMs) });
  if (!response.ok) throw new Error(`FREE_TRANSLATOR_HTTP_${response.status}`);
  const body = await response.json();
  const translatedText = String(body?.responseData?.translatedText || '').trim();
  if (!translatedText || Number(body?.responseStatus || 200) >= 400) throw new Error('FREE_TRANSLATOR_EMPTY');
  return {
    data: { translatedText, sourceLanguage: source, confidence: 0.8 },
    provider: 'mymemory',
    confidence: 0.8,
    lowConfidence: false,
    timings: { totalMs: 0 },
  };
}
