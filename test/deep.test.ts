// The deep tier: diff coverage, mutation testing, API-break detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWithCoverage, uncoveredLines } from '../src/deep/coverage.ts';

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'pg-deep-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
}
const lines = (text: string) => text.split('\n').map((t, i) => ({ n: i + 1, text: t }));

const PY = 'def f(x):\n    if x > 0:\n        return 1\n    # note\n    return 2\n';
const TS = 'export function g(x: number) {\n  if (x > 0) {\n    return 1;\n  }\n  return 2;\n}\n';

test('python coverage: the untaken branch is uncovered, comments are not counted', async () => {
  const dir = project({ 'pkg/__init__.py': '', 'pkg/m.py': PY, 'tests/test_m.py': 'from pkg.m import f\n\n\ndef test_f():\n    assert f(5) == 1\n' });
  try {
    const { run, coverage } = await runWithCoverage(dir, 'pytest', ['tests/test_m.py'], ['pkg/m.py'], 60_000);
    assert.deepEqual(run.tests, { 'tests/test_m.py::test_f': 'pass' });
    assert.ok(coverage);
    assert.deepEqual(uncoveredLines(coverage, 'pkg/m.py', lines(PY)), [5]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('node:test coverage: the untaken branch is uncovered', async () => {
  const dir = project({
    'package.json': '{ "type": "module" }\n',
    'src/g.ts': TS,
    'test/g.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { g } from '../src/g.ts';\n\ntest('g', () => assert.equal(g(5), 1));\n",
  });
  try {
    const { run, coverage } = await runWithCoverage(dir, 'node-test', ['test/g.test.ts'], ['src/g.ts'], 60_000);
    assert.deepEqual(run.tests, { 'test/g.test.ts::g': 'pass' });
    assert.ok(coverage);
    assert.deepEqual(uncoveredLines(coverage, 'src/g.ts', lines(readFileSync(join(dir, 'src/g.ts'), 'utf8'))), [5]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { mutantsFor, spread } from '../src/deep/mutate.ts';

test('mutants: comparisons, booleans, constants and returns, never inside strings or comments', () => {
  const py = 'def ok(x, y):\n    if x >= 3 and not y:  # x >= 3 here\n        return "a >= b"\n    return x + 1\n';
  const ms = mutantsFor('m.py', py, 'py', [2, 3, 4], 10).map((m) => `${m.line}:${m.op}:${m.after.trim()}`);
  assert.deepEqual(ms, [
    '2:>= -> >:if x > 3 and not y:  # x >= 3 here',
    '2:and -> or:if x >= 3 or not y:  # x >= 3 here',
    '2:drop not:if x >= 3 and y:  # x >= 3 here',
    '2:n -> n+1:if x >= 4 and not y:  # x >= 3 here',
    '3:empty return:return None',
    '4:empty return:return None',
    '4:+ -> -:return x - 1',
    '4:n -> n+1:return x + 2',
  ]);
  const js = "export const f = (a: number) => {\n  if (a === 0 || a > 10) return `x > ${a}`;\n  return a * 2; // a * 2\n};\n";
  const jm = mutantsFor('m.ts', js, 'js', [2, 3], 10).map((m) => `${m.line}:${m.op}`);
  assert.deepEqual(jm, ['2:=== -> !==', '2:> -> >=', '2:|| -> &&', '2:n -> n+1', '2:n -> n+1', '3:empty return', '3:* -> /', '3:n -> n+1']);
  assert.deepEqual(mutantsFor('m.py', 'import os\n@cache\ndef f():\n', 'py', [1, 2, 3]), []);
});

test('spread gives every line a mutant before any line gets a second', () => {
  const ms = [1, 1, 1, 2, 2, 3].map((line, i) => ({ file: 'f', line, op: String(i), before: '', after: '' }));
  assert.deepEqual(spread(ms, 4).map((m) => m.op), ['0', '3', '5', '1']);
});

import { fileChange } from '../src/changes.ts';
import { testQuality } from '../src/deep/mutation.ts';

test('mutation testing: weak tests let mutants survive, strong tests kill them', async () => {
  const before = 'def discount(price, qty):\n    return price\n';
  const after = 'def discount(price, qty):\n    if qty >= 10:\n        return price * 0.9\n    return price\n';
  const weak = 'from pkg.shop import discount\n\n\ndef test_small():\n    assert discount(100, 1) == 100\n\n\ndef test_bulk():\n    assert discount(100, 20) < 100\n';
  const strong = 'from pkg.shop import discount\n\n\ndef test_small():\n    assert discount(100, 1) == 100\n\n\ndef test_edge():\n    assert discount(100, 10) == 90\n    assert discount(100, 9) == 100\n';
  for (const [tests, expectSurvivors] of [[weak, true], [strong, false]] as const) {
    const dir = project({ 'pkg/__init__.py': '', 'pkg/shop.py': after, 'tests/test_shop.py': tests });
    try {
      const { findings, stats } = await testQuality({
        dir, changes: [fileChange('pkg/shop.py', before, after)], testFiles: new Map([['tests/test_shop.py', tests]]), budgetMs: 120_000,
      });
      assert.ok(stats.mutants >= 3, `mutants ${stats.mutants}`);
      const survivors = findings.find((f) => f.rule === 'surviving-mutants');
      assert.equal(!!survivors, expectSurvivors, JSON.stringify(findings, null, 1));
      if (survivors) assert.match(survivors.evidence.join('\n'), /if qty >= 10: {2}-> {2}if qty > 10:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('diff coverage: changed code no test runs is reported', async () => {
  const before = 'def f(x):\n    return x\n';
  const after = 'def f(x):\n    if x < 0:\n        y = -x\n        z = y * 2\n        return z\n    return x\n';
  const tests = 'from pkg.m import f\n\n\ndef test_f():\n    assert f(2) == 2\n';
  const dir = project({ 'pkg/__init__.py': '', 'pkg/m.py': after, 'tests/test_m.py': tests });
  try {
    const { findings } = await testQuality({ dir, changes: [fileChange('pkg/m.py', before, after)], testFiles: new Map([['tests/test_m.py', tests]]), budgetMs: 120_000 });
    const f = findings.find((x) => x.rule === 'uncovered-change');
    assert.equal(f?.level, 'challenge');
    assert.deepEqual(f?.evidence.map((e) => e.split(':')[0]), ['3', '4', '5']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { apiBreaks } from '../src/deep/api.ts';

test('API breaks: removed or harder-to-call functions with stale callers block; compatible changes do not', () => {
  const lib = 'def total(items):\n    return sum(items)\n\n\ndef tax(amount, rate=0.2):\n    return amount * rate\n';
  const caller = 'from pkg.lib import total, tax\n\nprint(total([1, 2]))\nprint(tax(10, rate=0.1))\n';
  const check = (libAfter: string, callerAfter = caller, added: Record<string, string> = {}) => {
    const dir = project({ 'pkg/__init__.py': '', 'pkg/lib.py': libAfter, 'app.py': callerAfter, ...added });
    try {
      const changes = [fileChange('pkg/lib.py', lib, libAfter), ...Object.entries(added).map(([p, t]) => fileChange(p, null, t))];
      return apiBreaks(dir, changes).map((f) => `${f.level}:${f.rule}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  // Removed while app.py still imports and calls it.
  assert.deepEqual(check('def tax(amount, rate=0.2):\n    return amount * rate\n'), ['block:api-removed-still-used']);
  // A new required parameter that app.py does not pass.
  assert.deepEqual(check(lib.replace('def total(items):', 'def total(items, currency):')), ['block:call-sites-not-updated']);
  // A keyword renamed under a caller that still uses it.
  assert.deepEqual(check(lib.replace('rate=0.2):\n    return amount * rate', 'pct=0.2):\n    return amount * pct')), ['block:call-sites-not-updated']);
  // Compatible: a new optional parameter.
  assert.deepEqual(check(lib.replace('def total(items):', 'def total(items, start=0):')), []);
  // Moved to another module the callers now use: not a removal.
  assert.deepEqual(check('def tax(amount, rate=0.2):\n    return amount * rate\n', 'from pkg.sums import total\nfrom pkg.lib import tax\n', { 'pkg/sums.py': 'def total(items):\n    return sum(items)\n' }), []);
});

test('API breaks in TypeScript: a new required parameter with an old call site blocks', () => {
  const before = 'export function fmt(n: number): string {\n  return String(n);\n}\n';
  const after = 'export function fmt(n: number, unit: string): string {\n  return n + unit;\n}\n';
  const dir = project({ 'src/fmt.ts': after, 'src/view.ts': "import { fmt } from './fmt.ts';\nexport const label = fmt(3);\n" });
  try {
    assert.deepEqual(apiBreaks(dir, [fileChange('src/fmt.ts', before, after)]).map((f) => `${f.level}:${f.rule}`), ['block:call-sites-not-updated']);
    const optional = after.replace('unit: string', "unit = ''");
    writeFileSync(join(dir, 'src/fmt.ts'), optional);
    assert.deepEqual(apiBreaks(dir, [fileChange('src/fmt.ts', before, optional)]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCommit } from '../src/commit.ts';

test('recognising git commit in a shell command', () => {
  const at = (cmd: string) => parseCommit(cmd, '/repo');
  assert.equal(at('git status'), null);
  assert.equal(at('git commit --dry-run'), null);
  assert.deepEqual(at('git commit -m "fix: a -> b"'), { dir: '/repo', all: false, amend: false });
  assert.equal(at('git add -A && git commit -am "wip"')?.all, true);
  assert.equal(at('git -c user.name=x commit --amend --no-edit')?.amend, true);
  assert.match(at('cd sub && git commit -m x')!.dir, /sub$/);
  assert.match(at('git -C ../other commit -m x')!.dir, /other$/);
});

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const PRETOOL = fileURLToPath(new URL('../src/pretool.mjs', import.meta.url));
const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });

test('the agent committing weakly tested code is challenged once, then the user is told', () => {
  const lib = 'def discount(price, qty):\n    return price\n';
  const dir = project({ 'pkg/__init__.py': '', 'pkg/shop.py': lib, 'tests/test_shop.py': 'from pkg.shop import discount\n\n\ndef test_small():\n    assert discount(100, 1) == 100\n' });
  const state = mkdtempSync(join(tmpdir(), 'pg-deep-state-'));
  try {
    git(dir, 'init', '-q'); git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
    writeFileSync(join(dir, 'pkg/shop.py'), 'def discount(price, qty):\n    if qty >= 10:\n        return price * 0.9\n    return price\n');
    git(dir, 'add', '-A');
    const pretool = () => {
      const r = spawnSync(process.execPath, [PRETOOL], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, PROOF_GATE_STATE_DIR: state },
        input: JSON.stringify({ session_id: 'deep1', cwd: dir, tool_name: 'Bash', tool_input: { command: 'git commit -m "bulk discount"' } }),
      });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout ? JSON.parse(r.stdout) : null;
    };
    const first = pretool();
    assert.equal(first?.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(first.hookSpecificOutput.permissionDecisionReason, /before you commit/);
    assert.match(first.hookSpecificOutput.permissionDecisionReason, /uncovered-change|surviving-mutants/);
    const second = pretool();
    assert.equal(second?.hookSpecificOutput, undefined);
    assert.match(second.systemMessage, /uncovered-change|surviving-mutants/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  }
});

test('install-hook writes a pre-commit hook and will not clobber someone else\'s', () => {
  const dir = project({ 'a.py': 'x = 1\n' });
  try {
    git(dir, 'init', '-q');
    const install = (...args: string[]) => spawnSync(process.execPath, [CLI, 'install-hook', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(install().status, 0);
    const hook = join(dir, '.git', 'hooks', 'pre-commit');
    assert.match(readFileSync(hook, 'utf8'), /proof-gate pre-commit hook[\s\S]*deep --staged --hook/);
    assert.equal(install().status, 0); // reinstalling its own hook is fine
    writeFileSync(hook, '#!/bin/sh\necho mine\n');
    assert.equal(install().status, 2);
    assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\necho mine\n');
    assert.equal(install('--force').status, 0);
    assert.ok(existsSync(`${hook}.before-proof-gate`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regex literals are not mutated, divisions still are', () => {
  const js = 'const RE = /[A-Za-z0-9]{2,}/g;\nconst half = total / 2;\nconst ok = s.match(/a+b/) && n > 1;\n';
  const ms = mutantsFor('m.ts', js, 'js', [1, 2, 3], 10).map((m) => `${m.line}:${m.op}`);
  assert.deepEqual(ms, ['2:/ -> *', '2:n -> n+1', '3:> -> >=', '3:&& -> ||', '3:n -> n+1']);
});
