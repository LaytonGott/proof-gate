import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/evaluate.ts';

test('precedence and associativity per README', () => {
  assert.equal(evaluate('2 ^ 3 ^ 2'), 512);
  assert.equal(evaluate('2 ^ 2 ^ 3'), 256);
  assert.equal(evaluate('-2 ^ 2'), -4);
  assert.equal(evaluate('-3 ^ 2 + 10'), 1);
  assert.equal(evaluate('(-2) ^ 3'), -8);
  assert.equal(evaluate('2 ^ -2'), 0.25);
  assert.equal(evaluate('-2 * 3 ^ 2'), -18);
  assert.equal(evaluate('100 - 10 - 1'), 89);
  assert.equal(evaluate('2 * -3'), -6);
  assert.equal(evaluate('--2'), 2);
});

test('round half away from zero', () => {
  assert.equal(evaluate('round(2.5)'), 3);
  assert.equal(evaluate('round(-2.5)'), -3);
  assert.equal(evaluate('round(0.5)'), 1);
  assert.equal(evaluate('round(-0.5)'), -1);
  assert.equal(evaluate('round(1.4)'), 1);
  assert.equal(evaluate('round(-1.4)'), -1);
  assert.equal(evaluate('round(1.25, 1)'), 1.3);
  assert.equal(evaluate('round(-1.25, 1)'), -1.3);
  assert.equal(evaluate('round(3.14159, 2)'), 3.14);
});

test('everything else still works', () => {
  assert.equal(evaluate('max(1, 2 + 3, min(10, 7))'), 7);
  assert.equal(evaluate('price * (1 - discount)', { price: 200, discount: 0.25 }), 150);
});
