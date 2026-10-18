import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/index.ts';

test('defaults only', () => {
  assert.deepEqual(loadConfig(), { port: 8080, host: 'localhost', log: { level: 'info', pretty: false }, features: ['search'] });
});

test('file overrides defaults', () => {
  const cfg = loadConfig({ fileText: JSON.stringify({ host: '0.0.0.0', log: { pretty: true } }) });
  assert.equal(cfg.host, '0.0.0.0');
  assert.deepEqual(cfg.log, { level: 'info', pretty: true });
});

test('env overrides file', () => {
  const cfg = loadConfig({
    env: { APP_HOST: 'api.internal', APP_LOG_LEVEL: 'warn' },
    fileText: JSON.stringify({ host: '0.0.0.0', log: { level: 'debug', pretty: true } }),
  });
  assert.equal(cfg.host, 'api.internal');
  assert.deepEqual(cfg.log, { level: 'warn', pretty: true });
});

test('file pins the port for blue/green deploys', () => {
  // The deploy pipeline writes the slot port into config.json; it must not be clobbered.
  const cfg = loadConfig({ env: { APP_PORT: '3000' }, fileText: JSON.stringify({ port: 9001 }) });
  assert.equal(cfg.port, 9001);
});

test('env port is used when the file has none', () => {
  const cfg = loadConfig({ env: { APP_PORT: '3000' }, fileText: '{}' });
  assert.equal(cfg.port, 3000);
});

test('features from env replace the defaults', () => {
  assert.deepEqual(loadConfig({ env: { APP_FEATURES: 'billing' } }).features, ['billing']);
});
