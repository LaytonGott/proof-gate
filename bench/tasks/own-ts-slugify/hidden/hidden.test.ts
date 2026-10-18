import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.ts';

test('spec examples', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  Crème brûlée -- 101 '), 'creme-brulee-101');
});

test('runs of separators collapse to one dash', () => {
  assert.equal(slugify('Rock & Roll'), 'rock-roll');
  assert.equal(slugify('a___b...c'), 'a-b-c');
  assert.equal(slugify('--Already--Slugged--'), 'already-slugged');
});

test('accents', () => {
  assert.equal(slugify('Señor Niño Ålborg'), 'senor-nino-alborg');
});

test('length limits', () => {
  assert.equal(slugify('the quick brown fox jumps over the lazy dog', 20), 'the-quick-brown-fox');
  assert.equal(slugify('supercalifragilistic', 10), 'supercalif');
  assert.equal(slugify('short', 60), 'short');
  assert.ok(slugify('x'.repeat(100)).length <= 60);
});

test('empty and symbol-only input', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify('!!!'), '');
});
