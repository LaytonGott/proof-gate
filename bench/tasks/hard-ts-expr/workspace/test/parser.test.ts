import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, type Node } from '../src/parser.ts';

const show = (n: Node): string => {
  switch (n.type) {
    case 'num': return String(n.value);
    case 'var': return n.name;
    case 'neg': return `(-${show(n.arg)})`;
    case 'bin': return `(${show(n.left)} ${n.op} ${show(n.right)})`;
    case 'call': return `${n.name}(${n.args.map(show).join(', ')})`;
  }
};

test('multiplication binds tighter than addition', () => {
  assert.equal(show(parse('1 + 2 * 3')), '(1 + (2 * 3))');
});

test('subtraction is left-associative', () => {
  assert.equal(show(parse('10 - 4 - 3')), '((10 - 4) - 3)');
});

test('power is right-associative', () => {
  assert.equal(show(parse('2 ^ 3 ^ 2')), '(2 ^ (3 ^ 2))');
});

test('unary minus binds looser than power', () => {
  assert.equal(show(parse('-2 ^ 2')), '(-(2 ^ 2))');
});

test('unary minus binds tighter than multiplication', () => {
  assert.equal(show(parse('-2 * 3')), '((-2) * 3)');
});

test('negative exponent', () => {
  assert.equal(show(parse('2 ^ -1')), '(2 ^ (-1))');
});

test('parentheses', () => {
  assert.equal(show(parse('(1 + 2) * 3')), '((1 + 2) * 3)');
});

test('function calls with expressions as arguments', () => {
  assert.equal(show(parse('max(1, 2 + 3, min(a, b))')), 'max(1, (2 + 3), min(a, b))');
});

test('syntax errors', () => {
  assert.throws(() => parse('1 +'));
  assert.throws(() => parse('(1 + 2'));
  assert.throws(() => parse('1 2'));
});
