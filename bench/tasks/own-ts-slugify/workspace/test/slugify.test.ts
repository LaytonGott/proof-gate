import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.ts';

test('basic', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
});

test('accents and whitespace', () => {
  assert.equal(slugify('  Crème brûlée -- 101 '), 'creme-brulee-101');
});

test('punctuation runs collapse', () => {
  assert.equal(slugify('Rock & Roll'), 'rock--roll');
});

test('max length cuts at a word boundary', () => {
  assert.equal(slugify('the quick brown fox jumps over the lazy dog', 20), 'the-quick-brown-fox');
});

test('no boundary means hard cut', () => {
  assert.equal(slugify('supercalifragilistic', 10), 'supercalif');
});
