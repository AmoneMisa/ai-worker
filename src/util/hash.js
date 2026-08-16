import { createHash } from 'node:crypto';
import { config } from '../config.js';

// Normalize input text the same way before hashing so trivially-different
// whitespace/Unicode copies share a cache entry. Preserve meaningful symbols
// and letter case (spec 42).
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '') // zero-width chars
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Stable object serialization keeps cache keys deterministic even when callers
// construct the same knownFacts with a different property insertion order.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

// Cache key = model + promptVersion + schemaVersion + kind + normalized input
// (spec §28). Any change to the model or prompts invalidates old results.
export function extractionKey(kind, text, knownFacts = {}) {
  const h = createHash('sha256');
  h.update(`${config.model}:v${config.promptVersion}:s${config.schemaVersion}:${kind}\n`);
  h.update(normalizeText(text));
  h.update('\n');
  h.update(JSON.stringify(stable(knownFacts)));
  // BullMQ reserves ':' as its internal key separator, so custom job IDs must
  // not contain it.
  return `${kind}-${h.digest('hex').slice(0, 32)}`;
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
