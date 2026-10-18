import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, sortVersions } from '../src/compare.ts';

const sign = (n: number) => Math.sign(n);

test('semver.org 11.4 precedence chain', () => {
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(sign(compareVersions(chain[i], chain[i + 1])), -1, `${chain[i]} < ${chain[i + 1]}`);
    assert.equal(sign(compareVersions(chain[i + 1], chain[i])), 1, `${chain[i + 1]} > ${chain[i]}`);
  }
});

test('numeric fields compared numerically everywhere', () => {
  assert.equal(sign(compareVersions('10.0.0', '9.0.0')), 1);
  assert.equal(sign(compareVersions('1.0.10', '1.0.9')), 1);
  assert.equal(sign(compareVersions('1.0.0-2', '1.0.0-10')), -1);
});

test('build metadata is ignored', () => {
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0);
  assert.equal(sign(compareVersions('1.0.0-rc.1+x', '1.0.0')), -1);
});

test('release vs prerelease both directions', () => {
  assert.equal(sign(compareVersions('1.0.0', '1.0.0-alpha')), 1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha'), 0);
});

test('sortVersions is stable on a mixed list', () => {
  assert.deepEqual(
    sortVersions(['2.0.0', '1.0.0-beta.11', '1.0.0', '1.0.0-beta.2', '1.10.0', '1.9.0']),
    ['1.0.0-beta.2', '1.0.0-beta.11', '1.0.0', '1.9.0', '1.10.0', '2.0.0'],
  );
});
