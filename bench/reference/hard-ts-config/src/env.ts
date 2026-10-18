import type { Config, DeepPartial } from './types.ts';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export function parseEnv(env: Record<string, string | undefined>): DeepPartial<Config> {
  const out: DeepPartial<Config> = {};
  if (env.APP_PORT !== undefined) {
    if (!/^\d+$/.test(env.APP_PORT)) throw new Error(`APP_PORT: not a number: ${env.APP_PORT}`);
    out.port = Number(env.APP_PORT);
  }
  if (env.APP_HOST !== undefined) out.host = env.APP_HOST;
  if (env.APP_LOG_LEVEL !== undefined || env.APP_LOG_PRETTY !== undefined) {
    out.log = {};
    if (env.APP_LOG_LEVEL !== undefined) {
      const level = env.APP_LOG_LEVEL.toLowerCase();
      if (!(LEVELS as readonly string[]).includes(level)) throw new Error(`APP_LOG_LEVEL: unknown level ${env.APP_LOG_LEVEL}`);
      out.log.level = level as Config['log']['level'];
    }
    if (env.APP_LOG_PRETTY !== undefined) out.log.pretty = env.APP_LOG_PRETTY === 'true';
  }
  if (env.APP_FEATURES !== undefined) {
    out.features = env.APP_FEATURES.split(',').map((f) => f.trim()).filter(Boolean);
  }
  return out;
}
