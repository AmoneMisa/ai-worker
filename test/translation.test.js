import test from 'node:test';
import assert from 'node:assert/strict';
import { translationLooksUnchanged } from '../src/util/translationGuard.js';

test('translationLooksUnchanged detects identical normalized text', () => {
  assert.equal(translationLooksUnchanged('Salom, dunyo!', 'salom dunyo'), true);
});

test('translationLooksUnchanged accepts a real translation', () => {
  assert.equal(
    translationLooksUnchanged(
      'Kvartira markazda joylashgan, barcha qulayliklar mavjud',
      'Квартира находится в центре, есть все удобства',
    ),
    false,
  );
});
