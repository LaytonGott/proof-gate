import type { Config, DeepPartial } from './types.ts';

/** Parses the deployment config.json. An empty or missing file means no overrides. */
export function parseFile(text: string | undefined): DeepPartial<Config> {
  if (!text || !text.trim()) return {};
  const data = JSON.parse(text);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('config.json must contain a JSON object');
  }
  return data as DeepPartial<Config>;
}
