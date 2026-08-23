const entries = new Map();

function now() {
  return Date.now();
}

export function memoryGet(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    entries.delete(key);
    return null;
  }
  return entry.value;
}

export function memorySet(key, value, ttlMs) {
  entries.set(key, {
    value,
    expiresAt: now() + Math.max(1, Number(ttlMs) || 1),
  });
  return value;
}

export function memoryDelete(key) {
  entries.delete(key);
}

export function memoryClear() {
  entries.clear();
}

export function memorySize() {
  const current = now();
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= current) entries.delete(key);
  }
  return entries.size;
}
