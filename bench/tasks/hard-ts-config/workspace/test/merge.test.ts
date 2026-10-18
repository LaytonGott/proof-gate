import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../src/merge.ts';

test('top-level override', () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: 3 }), { a: 1, b: 3 });
});

test('nested objects merge key by key', () => {
  assert.deepEqual(deepMerge({ log: { level: 'info', pretty: false } }, { log: { level: 'debug' } }), { log: { level: 'debug', pretty: false } });
});

test('arrays are replaced', () => {
  assert.deepEqual(deepMerge({ features: ['a', 'b'] }, { features: ['c'] }), { features: ['c'] });
});

test('undefined override values are ignored', () => {
  assert.deepEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test('inputs are not mutated', () => {
  const base = { log: { level: 'info', pretty: false } };
  const override = { log: { pretty: true } };
  deepMerge(base, override);
  assert.deepEqual(base, { log: { level: 'info', pretty: false } });
  assert.deepEqual(override, { log: { pretty: true } });
});
