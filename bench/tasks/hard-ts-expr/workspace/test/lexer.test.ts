import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lexer.ts';

const kinds = (src: string) => tokenize(src).map((t) => (t.kind === 'op' ? t.op : t.kind));

test('numbers', () => {
  assert.deepEqual(tokenize('3.5 .5 2e3').filter((t) => t.kind === 'num').map((t) => (t as { value: number }).value), [3.5, 0.5, 2000]);
});

test('operators and parens', () => {
  assert.deepEqual(kinds('(1+2)*3^4'), ['(', 'num', '+', 'num', ')', '*', 'num', '^', 'num', 'eof']);
});

test('identifiers', () => {
  assert.deepEqual(kinds('max(a_1, b)'), ['ident', '(', 'ident', ',', 'ident', ')', 'eof']);
});

test('whitespace is ignored', () => {
  assert.deepEqual(kinds('  1 \t+\n 2 '), ['num', '+', 'num', 'eof']);
});

test('bad characters throw with position', () => {
  assert.throws(() => tokenize('1 + $'), /at 4/);
});
