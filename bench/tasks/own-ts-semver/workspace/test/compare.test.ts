import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, sortVersions } from '../src/compare.ts';

test('equal versions', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});

test('major/minor/patch ordering', () => {
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0);
  assert.ok(compareVersions('2.0.0', '1.9.9') > 0);
});

test('numeric, not lexical, comparison', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
});

test('a prerelease sorts before its release', () => {
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0') < 0);
});

test('sortVersions', () => {
  assert.deepEqual(sortVersions(['1.10.0', '1.2.0', '1.0.0', '1.0.0-rc.1']), ['1.0.0-rc.1', '1.0.0', '1.2.0', '1.10.0']);
});
