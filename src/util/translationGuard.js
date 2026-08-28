function normalizedText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`ʻʼ]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function translationLooksUnchanged(source, translated) {
  const a = normalizedText(source);
  const b = normalizedText(translated);
  if (!a || !b || a === b) return true;

  const sourceWords = a.split(' ');
  const translatedWords = b.split(' ');
  if (sourceWords.length < 5 || translatedWords.length < 5) return false;

  const compared = Math.min(sourceWords.length, translatedWords.length);
  let same = 0;
  for (let i = 0; i < compared; i += 1) {
    if (sourceWords[i] === translatedWords[i]) same += 1;
  }
  const positionalSimilarity = same / Math.max(sourceWords.length, translatedWords.length);
  const lengthSimilarity = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return positionalSimilarity >= 0.9 && lengthSimilarity >= 0.9;
}
