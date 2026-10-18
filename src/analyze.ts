// Runs every rule over a change set and orders the findings.
import { specialCase } from './rules/special-case.ts';
import { testConfig } from './rules/test-config.ts';
import { testIntegrity } from './rules/test-integrity.ts';
import { transcript } from './rules/transcript.ts';
import type { Context, Finding, Level, Rule } from './types.ts';

export const RULES: Record<string, Rule> = { testIntegrity, testConfig, specialCase, transcript };

const RANK: Record<Level, number> = { block: 0, challenge: 1, info: 2 };

export async function analyze(ctx: Context): Promise<Finding[]> {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const rule of Object.values(RULES)) {
    for (const f of await rule(ctx)) {
      if (seen.has(f.fingerprint)) continue;
      seen.add(f.fingerprint);
      out.push(f);
    }
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
}

export function formatFindings(findings: Finding[]): string {
  return findings
    .map((f) => [`[${f.level}] ${f.rule}: ${f.message}`, ...f.evidence.map((e) => `    ${e}`)].join('\n'))
    .join('\n');
}
