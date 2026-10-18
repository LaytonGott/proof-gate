// The deep tier: everything the quick tier checks, plus diff coverage, mutation testing of the
// changed lines and API-break detection. Slower (minutes), so it runs at commit time.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, sortFindings } from '../analyze.ts';
import { executeChecks, refineWithExecution } from '../execute.ts';
import { changesBetween, disposeMaterialized, materialize, testFilesIn, type Repo } from '../git.ts';
import type { Finding } from '../types.ts';
import { apiBreaks } from './api.ts';
import { testQuality, type QualityStats } from './mutation.ts';

export type DeepOptions = { budgetMs: number; maxMutants?: number; finalMessage?: string };

export async function deepCheck(repo: Repo, base: string, target: string, opts: DeepOptions): Promise<{ findings: Finding[]; quality: QualityStats | null }> {
  if (base === target) return { findings: [], quality: null };
  const t0 = Date.now();
  const changes = changesBetween(repo, base, target);
  if (!changes.length) return { findings: [], quality: null };
  const testFiles = testFilesIn(repo, target);
  const staticFindings = await analyze({ changes, testFiles: async () => testFiles, finalMessage: opts.finalMessage });

  const scratch = mkdtempSync(join(tmpdir(), 'pg-deep-'));
  const baseDir = join(scratch, 'base');
  const newDir = join(scratch, 'new');
  try {
    materialize(repo, base, baseDir);
    materialize(repo, target, newDir);
    // Roughly a third of the budget for the quick tier's runs, the rest for mutation.
    const exec = await executeChecks({ baseDir, newDir, changes, testFiles, finalMessage: opts.finalMessage, budgetMs: Math.round(opts.budgetMs / 3) });
    const api = apiBreaks(newDir, changes);
    const quality = await testQuality({ dir: newDir, changes, testFiles, budgetMs: Math.max(10_000, opts.budgetMs - (Date.now() - t0)), maxMutants: opts.maxMutants });
    return { findings: sortFindings([...refineWithExecution(staticFindings, exec), ...exec.findings, ...api, ...quality.findings]), quality: quality.stats };
  } finally {
    disposeMaterialized(baseDir);
    disposeMaterialized(newDir);
    rmSync(scratch, { recursive: true, force: true });
  }
}
