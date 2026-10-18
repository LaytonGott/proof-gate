// Line coverage of changed code, with no coverage tool installed: Node's built-in V8 coverage
// for node:test suites, and a small sys.monitoring pytest plugin (pg_cov.py) for Python.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests, type RunnerId, type RunResult } from '../runners.ts';

const PLUGIN_DIR = fileURLToPath(new URL('.', import.meta.url));

export type Coverage = {
  // Per measured file (relative path): lines that ran.
  executed: Map<string, Set<number>>;
  // Per measured file: lines that can run at all (Python only; JS uses V8's ranges instead).
  executable: Map<string, Set<number>>;
};

/** Runs `tests` with `runner` in `root`, measuring the code files in `measure`. */
export async function runWithCoverage(root: string, runner: RunnerId, tests: string[], measure: string[], timeoutMs: number): Promise<{ run: RunResult; coverage: Coverage | null }> {
  const scratch = mkdtempSync(join(tmpdir(), 'pg-cov-'));
  try {
    if (runner === 'pytest') {
      const out = join(scratch, 'cov.json');
      const run = await runTests(root, runner, tests, timeoutMs, {
        env: {
          PG_COV_OUT: out,
          PG_COV_ROOT: root,
          PG_COV_FILES: measure.join(delimiter),
          PYTHONPATH: [PLUGIN_DIR, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        },
        pytestArgs: ['-p', 'pg_cov'],
      });
      if (!existsSync(out)) return { run, coverage: null };
      const data = JSON.parse(readFileSync(out, 'utf8')) as { executed: Record<string, number[]>; executable: Record<string, number[]> };
      const toMap = (o: Record<string, number[]>) => new Map(Object.entries(o).map(([f, ls]) => [f.replace(/\\/g, '/'), new Set(ls)]));
      return { run, coverage: { executed: toMap(data.executed), executable: toMap(data.executable) } };
    }
    if (runner === 'node-test') {
      const dir = join(scratch, 'v8');
      const run = await runTests(root, runner, tests, timeoutMs, { env: { NODE_V8_COVERAGE: dir } });
      return { run, coverage: existsSync(dir) ? readV8(dir, root, measure) : null };
    }
    return { run: await runTests(root, runner, tests, timeoutMs), coverage: null };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

type Range = { startOffset: number; endOffset: number; count: number };

/**
 * V8 block coverage to executed lines. A line ran if the innermost range containing its first
 * code character has a non-zero count; ranges from all processes are merged.
 */
function readV8(dir: string, root: string, measure: string[]): Coverage {
  const wanted = new Set(measure);
  const ranges = new Map<string, Range[]>();
  for (const f of readdirSync(dir)) {
    let report: { result?: Array<{ url: string; functions: Array<{ ranges: Range[] }> }> };
    try {
      report = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    for (const script of report.result ?? []) {
      if (!script.url.startsWith('file:')) continue;
      const abs = fileURLToPath(script.url);
      const rel = (isAbsolute(abs) ? relative(root, abs) : abs).replace(/\\/g, '/');
      if (!wanted.has(rel)) continue;
      const list = ranges.get(rel) ?? [];
      for (const fn of script.functions) list.push(...fn.ranges);
      ranges.set(rel, list);
    }
  }
  const executed = new Map<string, Set<number>>();
  for (const [rel, rs] of ranges) {
    const text = readFileSync(join(root, rel), 'utf8');
    const lines = new Set<number>();
    let offset = 0;
    text.split('\n').forEach((line, i) => {
      const first = line.search(/\S/);
      if (first >= 0) {
        const at = offset + first;
        let best: Range | null = null;
        for (const r of rs) {
          if (r.startOffset <= at && at < r.endOffset && (!best || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) best = r;
        }
        if (best && best.count > 0) lines.add(i + 1);
      }
      offset += line.length + 1;
    });
    executed.set(rel, lines);
  }
  return { executed, executable: new Map() };
}

// Lines that hold no behaviour of their own: blank, comments, lone braces and brackets.
const INERT = /^\s*($|#|\/\/|\/\*|\*|[{}()[\];,]+\s*$|else\s*:?\s*$|\}\s*else\s*\{?\s*$|try\s*:\s*$|finally\s*:\s*$|(export\s+)?(import|from)\s)/;

/** Changed lines (1-based, after) that no test executed, for files that were measured. */
export function uncoveredLines(coverage: Coverage, file: string, lines: Array<{ n: number; text: string }>): number[] {
  const ran = coverage.executed.get(file);
  const executable = coverage.executable.get(file);
  if (!ran && !executable) return [];
  return lines
    .filter((l) => !INERT.test(l.text))
    .filter((l) => (executable && executable.size ? executable.has(l.n) : true))
    .filter((l) => !(ran ?? new Set()).has(l.n))
    .map((l) => l.n);
}
