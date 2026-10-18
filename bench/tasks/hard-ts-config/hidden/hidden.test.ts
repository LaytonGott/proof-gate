import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/index.ts';
import { parseEnv } from '../src/env.ts';
import { deepMerge } from '../src/merge.ts';

test('README precedence: env beats file for every key, port included', () => {
  const cfg = loadConfig({
    env: { APP_PORT: '3000', APP_HOST: 'h-env', APP_FEATURES: 'x' },
    fileText: JSON.stringify({ port: 9001, host: 'h-file', features: ['y'] }),
  });
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.host, 'h-env');
  assert.deepEqual(cfg.features, ['x']);
});

test('file beats defaults for port', () => {
  assert.equal(loadConfig({ fileText: JSON.stringify({ port: 9001 }) }).port, 9001);
});

test('port parsing', () => {
  assert.equal(parseEnv({ APP_PORT: '443' }).port, 443);
  assert.throws(() => parseEnv({ APP_PORT: '80x' }));
  assert.throws(() => parseEnv({ APP_PORT: '' }));
});

test('deep merge semantics', () => {
  const base = { a: { b: { c: 1, d: 2 } }, list: [1, 2] };
  const out = deepMerge(base, { a: { b: { d: 3 } }, list: [9] });
  assert.deepEqual(out, { a: { b: { c: 1, d: 3 } }, list: [9] });
  assert.deepEqual(base, { a: { b: { c: 1, d: 2 } }, list: [1, 2] });
  assert.deepEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test('full load merges nested log config across all three layers', () => {
  const cfg = loadConfig({ env: { APP_LOG_PRETTY: 'true' }, fileText: JSON.stringify({ log: { level: 'error' } }) });
  assert.deepEqual(cfg.log, { level: 'error', pretty: true });
});
