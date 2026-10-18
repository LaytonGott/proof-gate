// Test quality for the changed code: which changed lines no test executes (diff coverage), and
// which small edits to the changed lines no test notices (mutation testing). Both point at
// behaviour the agent added or changed that the tests do not actually check.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestStatus } from '../junit.ts';
import { importLines, importsModule, isCode, isTestFile, langOf } from '../lang.ts';
import { detectRunner, runTests, type RunnerId } from '../runners.ts';
import type { FileChange, Finding } from '../types.ts';
import { runWithCoverage, uncoveredLines, type Coverage } from './coverage.ts';
import { mutantsFor, spread, type Mutant } from './mutate.ts';

export type QualityInput = {
  // A writable checkout of the state under review (mutants are written into it and reverted).
  dir: string;
  changes: FileChange[];
  // Every test file in that state, path -> content.
  testFiles: Map<string, string>;
  budgetMs: number;
  maxMutants?: number;
};

export type QualityStats = { files: number; mutants: number; killed: number; survived: number; uncovered: number; ms: number; partial: boolean };

export async function testQuality(input: QualityInput): Promise<{ findings: Finding[]; stats: QualityStats }> {
  const t0 = Date.now();
  const deadline = t0 + input.budgetMs;
  const findings: Finding[] = [];
  const stats: QualityStats = { files: 0, mutants: 0, killed: 0, survived: 0, uncovered: 0, ms: 0, partial: false };
  const code = input.changes.filter((c) => c.status !== 'D' && isCode(c.path) && !isTestFile(c.path) && ['py', 'js'].includes(langOf(c.path)) && c.added.length);
  if (!code.length || !input.testFiles.size) return { findings, stats: { ...stats, ms: Date.now() - t0 } };

  for (const c of code) {
    if (Date.now() > deadline - 3000) { stats.partial = true; break; }
    // The tests of this module, grouped by runner.
    const groups = new Map<RunnerId, string[]>();
    for (const [p, text] of input.testFiles) {
      if (!importsModule(importLines(text), c.path)) continue;
      const r = detectRunner(input.dir, p, text);
      if (r) groups.set(r, [...(groups.get(r) ?? []), p]);
    }
    if (!groups.size) {
      findings.push({
        rule: 'untested-change', level: 'info', file: c.path,
        message: `No test imports ${c.path}, so nothing checks its ${c.added.length} changed line(s).`,
        evidence: [], fingerprint: `untested-change:${c.path}`,
      });
      continue;
    }
    stats.files++;

    // Baseline with coverage: which tests pass (the oracle), which changed lines run.
    const oracle = new Map<RunnerId, Set<string>>();
    let baselineMs = 0;
    let coverage: Coverage | null = null;
    for (const [runner, tests] of groups) {
      const { run, coverage: cov } = await runWithCoverage(input.dir, runner, tests, [c.path], Math.max(5000, deadline - Date.now()));
      baselineMs = Math.max(baselineMs, run.ms);
      oracle.set(runner, new Set(Object.entries(run.tests).filter(([, st]) => st === 'pass').map(([id]) => id)));
      if (cov) coverage = mergeCoverage(coverage, cov);
    }
    if (![...oracle.values()].some((s) => s.size)) continue;

    let targets = c.added.map((l) => l.n);
    if (coverage && (coverage.executed.has(c.path) || coverage.executable.has(c.path))) {
      const uncovered = uncoveredLines(coverage, c.path, c.added);
      stats.uncovered += uncovered.length;
      if (uncovered.length) {
        const text = c.after!.split('\n');
        findings.push({
          rule: 'uncovered-change', level: uncovered.length >= 3 ? 'challenge' : 'info', file: c.path,
          message: `${uncovered.length} changed line(s) in ${c.path} never run under the tests that import it.`,
          evidence: uncovered.slice(0, 8).map((n) => `${n}: ${text[n - 1].trim().slice(0, 120)}`),
          fingerprint: `uncovered-change:${c.path}:${uncovered.join(',')}`,
        });
      }
      // Mutating a line no test runs only proves the same thing again.
      targets = targets.filter((n) => !uncovered.includes(n));
    }

    const text = readFileSync(join(input.dir, c.path), 'utf8');
    const left = Math.max(0, (input.maxMutants ?? 30) - stats.mutants);
    const mutants = spread(mutantsFor(c.path, text, langOf(c.path), targets), left);
    const survivors: Mutant[] = [];
    const lines = text.split('\n');
    try {
      for (const m of mutants) {
        if (Date.now() > deadline - 2000) { stats.partial = true; break; }
        lines[m.line - 1] = m.after;
        writeFileSync(join(input.dir, c.path), lines.join('\n'));
        lines[m.line - 1] = m.before;
        stats.mutants++;
        if (await killed(input.dir, groups, oracle, Math.min(Math.max(10_000, baselineMs * 4), deadline - Date.now()))) stats.killed++;
        else { stats.survived++; survivors.push(m); }
      }
    } finally {
      writeFileSync(join(input.dir, c.path), text);
    }
    if (survivors.length) {
      // A nudged constant often changes nothing observable (a precedence rank, a buffer size):
      // when that is all that survived, it is worth a look, not a stop.
      const onlyConstants = survivors.every((m) => m.op === 'n -> n+1');
      findings.push({
        rule: 'surviving-mutants', level: onlyConstants ? 'info' : 'challenge', file: c.path,
        message: `${survivors.length} of ${mutants.length} small edits to the changed lines of ${c.path} went unnoticed: the tests still pass with them, so they do not check this behaviour.`,
        evidence: survivors.slice(0, 6).map((m) => `${m.line}: ${m.before.trim().slice(0, 70)}  ->  ${m.after.trim().slice(0, 70)}`),
        fingerprint: `surviving-mutants:${c.path}:${survivors.map((m) => `${m.line}:${m.op}`).join(',')}`,
      });
    }
  }
  if (stats.mutants) {
    findings.push({
      rule: 'mutation-score', level: 'info',
      message: `Mutation testing of changed lines: ${stats.killed}/${stats.mutants} mutants caught by the tests${stats.partial ? ' (stopped at the time budget)' : ''}.`,
      evidence: [], fingerprint: `mutation-score:${stats.killed}/${stats.mutants}`,
    });
  }
  return { findings, stats: { ...stats, ms: Date.now() - t0 } };
}

/** Whether any test that passed on the unmutated code fails now (or the run hangs). */
async function killed(dir: string, groups: Map<RunnerId, string[]>, oracle: Map<RunnerId, Set<string>>, timeoutMs: number): Promise<boolean> {
  for (const [runner, tests] of groups) {
    const expected = oracle.get(runner);
    if (!expected?.size) continue;
    const res = await runTests(dir, runner, tests, Math.max(2000, timeoutMs));
    if (res.timedOut) return true;
    const got: Record<string, TestStatus> = res.tests;
    for (const id of expected) if (got[id] !== 'pass') return true;
  }
  return false;
}

function mergeCoverage(a: Coverage | null, b: Coverage): Coverage {
  if (!a) return b;
  const merge = (x: Map<string, Set<number>>, y: Map<string, Set<number>>) => {
    const out = new Map(x);
    for (const [f, ls] of y) out.set(f, new Set([...(out.get(f) ?? []), ...ls]));
    return out;
  };
  return { executed: merge(a.executed, b.executed), executable: merge(a.executable, b.executable) };
}
