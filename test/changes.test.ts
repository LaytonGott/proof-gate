import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, fileChange } from '../src/changes.ts';

const apply = (x: string[], y: string[]) => {
  const out: string[] = [];
  for (const op of diffLines(x, y)) if (op.kind !== 'del') out.push(op.kind === 'same' ? x[op.a] : y[op.b]);
  return out;
};

test('diff reproduces the target and keeps common lines', () => {
  const cases: Array<[string[], string[]]> = [
    [[], []],
    [['a'], []],
    [[], ['a']],
    [['a', 'b', 'c'], ['a', 'x', 'c']],
    [['a', 'b', 'c', 'd'], ['b', 'c', 'e', 'd', 'f']],
    ['the quick brown fox jumps over the lazy dog'.split(' '), 'a quick brown dog jumps over the fox'.split(' ')],
  ];
  for (const [x, y] of cases) {
    assert.deepEqual(apply(x, y), y);
    const ops = diffLines(x, y);
    assert.equal(ops.filter((o) => o.kind !== 'add').length, x.length);
  }
});

test('diff is minimal on a single replacement', () => {
  const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
  assert.deepEqual(ops.map((o) => o.kind), ['same', 'del', 'add', 'same']);
});

test('random diffs reproduce the target', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 300; t++) {
    const x = Array.from({ length: Math.floor(rnd() * 12) }, () => 'abcd'[Math.floor(rnd() * 4)]);
    const y = Array.from({ length: Math.floor(rnd() * 12) }, () => 'abcd'[Math.floor(rnd() * 4)]);
    assert.deepEqual(apply(x, y), y);
  }
});

test('fileChange pairs replaced lines with line numbers', () => {
  const c = fileChange('t.py', 'a\nassert f(2) == 2\nc\n', 'a\nassert f(2) == 3\nc\n');
  assert.equal(c.status, 'M');
  assert.deepEqual(c.replaced, [{ removed: [{ n: 2, text: 'assert f(2) == 2' }], added: [{ n: 2, text: 'assert f(2) == 3' }] }]);
  assert.deepEqual(fileChange('n.py', null, 'x\n').status, 'A');
  assert.deepEqual(fileChange('d.py', 'x\n', null).status, 'D');
});
