import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../src/env.ts';

test('empty env gives no overrides', () => {
  assert.deepEqual(parseEnv({}), {});
});

test('APP_PORT is a number', () => {
  assert.deepEqual(parseEnv({ APP_PORT: '3000' }), { port: 3000 });
});

test('APP_PORT rejects garbage', () => {
  assert.throws(() => parseEnv({ APP_PORT: 'eighty' }), /APP_PORT/);
});

test('log level and pretty', () => {
  assert.deepEqual(parseEnv({ APP_LOG_LEVEL: 'DEBUG', APP_LOG_PRETTY: 'true' }), { log: { level: 'debug', pretty: true } });
});

test('unknown log level throws', () => {
  assert.throws(() => parseEnv({ APP_LOG_LEVEL: 'loud' }), /APP_LOG_LEVEL/);
});

test('features list', () => {
  assert.deepEqual(parseEnv({ APP_FEATURES: 'search, billing,,beta ' }), { features: ['search', 'billing', 'beta'] });
});
