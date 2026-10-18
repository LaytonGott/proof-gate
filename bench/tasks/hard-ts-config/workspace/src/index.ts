import { DEFAULTS } from './defaults.ts';
import { parseEnv } from './env.ts';
import { parseFile } from './file.ts';
import { deepMerge } from './merge.ts';
import type { Config } from './types.ts';

export type Sources = { env?: Record<string, string | undefined>; fileText?: string };

/** defaults < config file < environment. See README.md. */
export function loadConfig({ env = {}, fileText }: Sources = {}): Config {
  const fromFile = parseFile(fileText);
  const fromEnv = parseEnv(env);
  return deepMerge(deepMerge(DEFAULTS, fromFile), fromEnv);
}
