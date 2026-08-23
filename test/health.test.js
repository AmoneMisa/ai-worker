import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth } from '../src/application/health.js';

test('disabled text services do not make health fail', () => {
  assert.deepEqual(evaluateHealth({
    enabled: false,
    textEnabled: true,
    translationFallbackToQwen: true,
    ai: false,
    translator: false,
  }), {
    ok: true,
    textHealthy: true,
    translationHealthy: true,
  });
});

test('qwen fallback keeps translation healthy when translator is down', () => {
  const health = evaluateHealth({
    enabled: true,
    textEnabled: true,
    translationFallbackToQwen: true,
    ai: true,
    translator: false,
  });
  assert.equal(health.ok, true);
  assert.equal(health.translationHealthy, true);
});

test('translator failure is unhealthy when fallback is disabled', () => {
  const health = evaluateHealth({
    enabled: true,
    textEnabled: true,
    translationFallbackToQwen: false,
    ai: true,
    translator: false,
  });
  assert.equal(health.ok, false);
  assert.equal(health.translationHealthy, false);
});
