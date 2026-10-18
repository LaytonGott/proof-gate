// Runs a project's own tests and reports per-test results. Detects the runner from the test
// file itself (pytest, node:test, vitest, jest); anything else is skipped, not guessed at.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJunit, type TestStatus } from './junit.ts';
import { langOf } from './lang.ts';

export type RunnerId = 'pytest' | 'node-test' | 'vitest' | 'jest';

export type RunResult = {
  tests: Record<string, TestStatus>;
  ms: number;
  timedOut: boolean;
  // Output tail, for the evidence in a finding.
  output: string;
};

let pythonCmd: string | null | undefined;
/** python3 or python, whichever has pytest; null if neither does. */
function python(): string | null {
  if (pythonCmd !== undefined) return pythonCmd;
  pythonCmd = null;
  for (const cmd of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(cmd, ['-m', 'pytest', '--version'], { encoding: 'utf8', timeout: 30_000 });
    if (r.status === 0) {
      pythonCmd = cmd;
      break;
    }
  }
  return pythonCmd;
}

/**
 * The JS entry point of a locally installed CLI (vitest, jest), run with `node` directly so no
 * shell is ever involved: test file names come from the repo and must not be shell-parsed.
 */
const nodeBin = (root: string, pkg: string): string | null => {
  const manifest = join(root, 'node_modules', pkg, 'package.json');
  if (!existsSync(manifest)) return null;
  try {
    const bin = JSON.parse(readFileSync(manifest, 'utf8')).bin;
    const rel = typeof bin === 'string' ? bin : bin?.[pkg];
    const p = rel ? join(root, 'node_modules', pkg, rel) : null;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
};

/** node --test can write the JUnit report this gate reads: Node 20.11+ / 21.3+. */
export function nodeHasJunitReporter(version = process.versions.node): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 21 || (major === 21 && minor >= 3) || (major === 20 && minor >= 11);
}

/** Which runner executes this test file, or null when none is available. */
export function detectRunner(root: string, path: string, text: string): RunnerId | null {
  const lang = langOf(path);
  if (lang === 'py') return python() ? 'pytest' : null;
  if (lang !== 'js') return null;
  if (/from\s+['"]node:test['"]|require\(\s*['"]node:test['"]\s*\)/.test(text)) return nodeHasJunitReporter() ? 'node-test' : null;
  if (/from\s+['"]vitest['"]/.test(text) || /\bvi\.(fn|mock|spyOn)\b/.test(text)) return nodeBin(root, 'vitest') ? 'vitest' : null;
  if (nodeBin(root, 'jest')) return 'jest';
  if (nodeBin(root, 'vitest')) return 'vitest';
  return null;
}

type Proc = { code: number | null; stdout: string; stderr: string; timedOut: boolean; ms: number };
/** spawn with an argument array and no shell. */
function runProcess(cmd: string, args: string[], cwd: string, timeoutMs: number, extraEnv: Record<string, string> = {}): Promise<Proc> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const env: NodeJS.ProcessEnv = { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', PYTHONDONTWRITEBYTECODE: '1', ...extraEnv };
    // Set when this process itself runs under `node --test`: a child that inherits it reports
    // to that parent instead of writing its own report.
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(cmd, args, { cwd, env, windowsHide: true, shell: false });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut, ms: Date.now() - t0 }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(err), timedOut, ms: Date.now() - t0 }); });
  });
}

// Jest and vitest JSON reports share a shape.
function parseJestJson(text: string, root: string): Record<string, TestStatus> {
  const out: Record<string, TestStatus> = {};
  try {
    const report = JSON.parse(text);
    for (const file of report.testResults ?? []) {
      const rel = String(file.name ?? file.testFilePath ?? '').replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, '');
      for (const a of file.assertionResults ?? []) {
        const st: TestStatus = a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skip';
        out[`${rel}::${a.fullName ?? a.title}`] = st;
      }
    }
  } catch {
    // An unreadable report means nothing ran; the caller marks the files failed.
  }
  return out;
}

export type RunExtras = {
  // Extra environment for the test process (coverage collection).
  env?: Record<string, string>;
  // Extra pytest arguments, placed before the files (`-p plugin`).
  pytestArgs?: string[];
};

/** Runs `files` (paths relative to `root`) with one runner, in one process. */
export async function runTests(root: string, runner: RunnerId, files: string[], timeoutMs: number, extras: RunExtras = {}): Promise<RunResult> {
  const env = extras.env ?? {};
  const scratch = mkdtempSync(join(tmpdir(), 'pg-report-'));
  const report = join(scratch, runner === 'vitest' || runner === 'jest' ? 'report.json' : 'report.xml');
  let p: Proc;
  try {
    // `--` ends option parsing, so a test file named like a flag is still just a file.
    if (runner === 'pytest') {
      p = await runProcess(python()!, ['-m', 'pytest', '-q', '-p', 'no:cacheprovider', '-o', 'junit_family=xunit1', `--junitxml=${report}`, `--rootdir=${root}`, ...(extras.pytestArgs ?? []), '--', ...files], root, timeoutMs, env);
    } else if (runner === 'node-test') {
      p = await runProcess(process.execPath, ['--test', '--test-reporter=junit', `--test-reporter-destination=${report}`, '--', ...files], root, timeoutMs, env);
    } else if (runner === 'vitest') {
      p = await runProcess(process.execPath, [nodeBin(root, 'vitest')!, 'run', '--reporter=json', `--outputFile=${report}`, '--', ...files], root, timeoutMs, env);
    } else {
      p = await runProcess(process.execPath, [nodeBin(root, 'jest')!, '--ci', '--json', `--outputFile=${report}`, '--', ...files], root, timeoutMs, env);
    }
    const text = existsSync(report) ? readFileSync(report, 'utf8') : '';
    // Older Node versions write JUnit without each test's file. One file: it is that file.
    // Several: run them one at a time so every result can be attributed.
    if (runner === 'node-test' && /<testcase\b(?![^>]*\bfile=)/.test(text)) {
      if (files.length > 1) {
        const merged: RunResult = { tests: {}, ms: 0, timedOut: false, output: '' };
        for (const f of files) {
          const r = await runTests(root, runner, [f], Math.max(1000, timeoutMs - merged.ms), extras);
          Object.assign(merged.tests, r.tests);
          merged.ms += r.ms;
          merged.timedOut ||= r.timedOut;
          merged.output = r.output;
        }
        return merged;
      }
    }
    const tests = runner === 'vitest' || runner === 'jest' ? parseJestJson(text, root) : parseJunit(text, { root, fallbackFile: files.length === 1 ? files[0] : undefined });
    // A file that crashed or timed out before reporting anything counts as failed.
    for (const f of files) {
      if (!Object.keys(tests).some((id) => id.startsWith(`${f}::`)) && (p.code !== 0 || p.timedOut)) tests[`${f}::<collection>`] = 'fail';
    }
    return { tests, ms: p.ms, timedOut: p.timedOut, output: `${p.stdout}\n${p.stderr}`.trim().slice(-2000) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
