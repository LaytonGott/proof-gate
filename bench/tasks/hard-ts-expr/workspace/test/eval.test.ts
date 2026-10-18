import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvalError, evaluate } from '../src/evaluate.ts';

test('arithmetic', () => {
  assert.equal(evaluate('1 + 2 * 3 - 4 / 2'), 5);
  assert.equal(evaluate('7 % 3'), 1);
});

test('variables', () => {
  assert.equal(evaluate('price * qty', { price: 2.5, qty: 4 }), 10);
});

test('unknown variable', () => {
  assert.throws(() => evaluate('x + 1'), EvalError);
});

test('powers', () => {
  assert.equal(evaluate('2 ^ 3 ^ 2'), 512);
  assert.equal(evaluate('-2 ^ 2'), -4);
  assert.equal(evaluate('(-2) ^ 2'), 4);
  assert.equal(evaluate('2 ^ -1'), 0.5);
});

test('min, max, abs, sqrt', () => {
  assert.equal(evaluate('max(1, 5, 3)'), 5);
  assert.equal(evaluate('min(4, -1)'), -1);
  assert.equal(evaluate('abs(-3)'), 3);
  assert.equal(evaluate('sqrt(16)'), 4);
});

test('round to digits', () => {
  assert.equal(evaluate('round(3.14159, 2)'), 3.14);
  assert.equal(evaluate('round(1.25, 1)'), 1.3);
});

test('round half', () => {
  assert.equal(evaluate('round(2.5)'), 2);
});

test('round negative half', () => {
  assert.equal(evaluate('round(-2.5)'), -3);
  assert.equal(evaluate('round(-1.25, 1)'), -1.3);
});

test('function errors', () => {
  assert.throws(() => evaluate('nope(1)'), EvalError);
  assert.throws(() => evaluate('sqrt(-1)'), EvalError);
  assert.throws(() => evaluate('abs(1, 2)'), EvalError);
});

test('division by zero', () => {
  assert.throws(() => evaluate('1 / (2 - 2)'), EvalError);
});
