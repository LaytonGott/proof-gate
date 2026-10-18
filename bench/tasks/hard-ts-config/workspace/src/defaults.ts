import type { Config } from './types.ts';

export const DEFAULTS: Config = {
  port: 8080,
  host: 'localhost',
  log: { level: 'info', pretty: false },
  features: ['search'],
};
