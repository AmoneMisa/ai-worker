import test from 'node:test';
import assert from 'node:assert/strict';
import { redactContacts } from '../src/util/privacy.js';

test('redacts contacts without damaging skill and property syntax', () => {
  const value = redactContacts(
    'C# C++ .NET 5/9 $600 — +998 90 123 45 67, dev@example.com, @owner_name, https://example.com/ad',
  );
  assert.match(value, /C# C\+\+ \.NET 5\/9 \$600/);
  assert.match(value, /\[PHONE\]/);
  assert.match(value, /\[EMAIL\]/);
  assert.match(value, /\[TELEGRAM\]/);
  assert.match(value, /\[URL\]/);
  assert.doesNotMatch(value, /dev@example\.com|owner_name|998 90/);
});
