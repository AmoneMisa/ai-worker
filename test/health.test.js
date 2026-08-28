import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth } from '../src/application/health.js';

test('disabled text services do not make health fail', () => {
  assert.deepEqual(evaluateHealth({
    enabled: false,
    textEnabled: true,
    textProvidersConfigured: false,
  }), {
    ok: true,
    textHealthy: true,
  });
});

test('healthy when at least one text provider is configured', () => {
  const health = evaluateHealth({
    enabled: true,
    textEnabled: true,
    textProvidersConfigured: true,
  });
  assert.equal(health.ok, true);
  assert.equal(health.textHealthy, true);
});

test('unhealthy when text is required and no provider is configured', () => {
  const health = evaluateHealth({
    enabled: true,
    textEnabled: true,
    textProvidersConfigured: false,
  });
  assert.equal(health.ok, false);
  assert.equal(health.textHealthy, false);
});
