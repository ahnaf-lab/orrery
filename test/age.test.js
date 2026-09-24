import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageDays } from '../src/age.js';

test('ageDays computes whole days between a release date and now', () => {
  const now = new Date('2026-09-25T00:00:00Z');
  assert.equal(ageDays('2026-09-15T00:00:00Z', now), 10);
});

test('ageDays never goes negative for a release date after "now"', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(ageDays('2026-06-01T00:00:00Z', now), 0);
});

test('ageDays returns null for an unparsable date', () => {
  assert.equal(ageDays('not-a-date'), null);
});
