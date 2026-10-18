// Test execution in the Stop hook, end to end, in throwaway git repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const STATE = mkdtempSync(join(tmpdir(), 'pg-exec-state-'));
let session = 0;

const sh = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const hook = (cwd: string, sub: string, input: object) => {
  const r = spawnSync(process.execPath, [CLI, 'hook', sub], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PROOF_GATE_STATE_DIR: STATE } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const transcript = (dir: string, text: string, edited: string[] = []) => {
  const p = join(dir, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(p, [
    { type: 'user', message: { role: 'user', content: 'do the task' } },
    ...edited.map((f) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }] } })),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
};

/** A repo with the given files committed. */
function repo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'pg-exec-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  sh(dir, 'init', '-q');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

/** Runs one turn: prompt hook, the edits, then the stop hook. */
function turn(dir: string, edits: Record<string, string>, finalMessage = 'Done.') {
  const id = `exec-${++session}`;
  hook(dir, 'prompt', { session_id: id, cwd: dir });
  for (const [p, text] of Object.entries(edits)) writeFileSync(join(dir, p), text);
  return hook(dir, 'stop', { session_id: id, cwd: dir, transcript_path: transcript(dir, finalMessage) });
}

const CALC = 'def half(x):\n    return x / 2\n';
const CALC_TEST = 'from calc import half\n\n\ndef test_half():\n    assert half(4) == 2\n\n\ndef test_half_odd():\n    assert half(3) == 1.5\n';

test('a change that breaks an untouched test is blocked as a regression', () => {
  const dir = repo({ 'calc.py': CALC, 'tests/test_calc.py': CALC_TEST });
  try {
    const out = turn(dir, { 'calc.py': 'def half(x):\n    return x // 2\n' });
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /\[block\] regression: tests\/test_calc\.py::test_half_odd passed before/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an edited test that passes only in its edited form is challenged with proof', () => {
  const dir = repo({ 'calc.py': CALC, 'tests/test_calc.py': CALC_TEST });
  try {
    const out = turn(dir, {
      'calc.py': 'def half(x):\n    return x // 2\n',
      'tests/test_calc.py': CALC_TEST.replace('half(3) == 1.5', 'half(3) == 1'),
    });
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /test-edited-to-pass: tests\/test_calc\.py::test_half_odd passes only in its edited form: the original test passed before/);
    assert.doesNotMatch(out.reason, /\[block\] regression/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saying the tests pass while they fail is blocked', () => {
  const dir = repo({ 'calc.py': 'def half(x):\n    return x // 2\n', 'tests/test_calc.py': CALC_TEST });
  try {
    const out = turn(dir, { 'calc.py': '# halving\ndef half(x):\n    return x // 2\n' }, 'All tests pass now.');
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /false-green: The agent says the tests pass, but 1 affected test\(s\) fail/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const LIMITER = 'class RateLimiter:\n    def __init__(self, capacity=10):\n        self.capacity = capacity\n\n    def burst(self):\n        return self.capacity\n';
const LIMITER_TEST = (n: number) => `from ratelimit.limiter import RateLimiter\n\n\ndef test_burst():\n    assert RateLimiter().burst() == ${n}\n`;

test('a constant copied from a test that it turned green stays a challenge', () => {
  const dir = repo({ 'ratelimit/__init__.py': '', 'ratelimit/limiter.py': LIMITER, 'tests/test_api.py': LIMITER_TEST(11) });
  try {
    const out = turn(dir, { 'ratelimit/limiter.py': LIMITER.replace('return self.capacity', 'return 11  # mobile launch burst') });
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /literal-from-test: .*Its test went from failing to passing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a constant shared with a test that was already passing drops to info', () => {
  const dir = repo({
    'ratelimit/__init__.py': '',
    'ratelimit/limiter.py': LIMITER.replace('capacity=10', 'capacity=12'),
    'tests/test_api.py': LIMITER_TEST(12).replace('== 12', '== 12\n    assert RateLimiter(capacity=37).burst() == 37'),
  });
  try {
    const out = turn(dir, { 'ratelimit/limiter.py': LIMITER.replace('capacity=10', 'capacity=12') + '\nMAX_KEYS = 37\n' });
    assert.equal(out?.decision, undefined);
    assert.match(out.systemMessage, /\[info\] literal-from-test: .*likely coincidence/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('committing mid-turn does not hide the change from the gate', () => {
  const dir = repo({ 'calc.py': CALC, 'tests/test_calc.py': CALC_TEST });
  const outside = mkdtempSync(join(tmpdir(), 'pg-exec-cwd-'));
  try {
    const id = `exec-${++session}`;
    hook(outside, 'prompt', { session_id: id, cwd: outside });
    // Make the reflog's next entry clearly later than the turn's start.
    const until = Date.now() + 1100;
    while (Date.now() < until) { /* wait */ }
    const target = join(dir, 'tests', 'test_calc.py');
    writeFileSync(target, 'from calc import half\n\n\ndef test_half():\n    assert half(4) == 2\n');
    sh(dir, 'commit', '-q', '-am', 'tidy tests');
    const out = hook(outside, 'stop', { session_id: id, cwd: outside, transcript_path: transcript(outside, 'Done.', [target]) });
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, new RegExp(`\\[${basename(dir)}\\].*tests-removed|tests-removed.*`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('node:test suites run too', () => {
  const dir = repo({
    'package.json': '{ "type": "module" }\n',
    'src/math.ts': 'export const double = (x: number) => x * 2;\n',
    'test/math.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { double } from '../src/math.ts';\n\ntest('doubles', () => assert.equal(double(3), 6));\n",
  });
  try {
    const out = turn(dir, { 'src/math.ts': 'export const double = (x: number) => x + 2;\n' });
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /regression: test\/math\.test\.ts::doubles passed before/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cleaning up after a run never touches the repo's own node_modules", () => {
  const dir = repo({ '.gitignore': 'node_modules/\n', 'calc.py': CALC, 'tests/test_calc.py': CALC_TEST });
  try {
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
    turn(dir, { 'calc.py': 'def half(x):\n    return x // 2\n' });
    assert.ok(existsSync(join(dir, 'node_modules', 'pkg', 'index.js')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { nodeHasJunitReporter } from '../src/runners.ts';

test('node:test is only used where it can write a JUnit report', () => {
  assert.deepEqual(['18.20.4', '20.10.0', '20.11.0', '21.2.0', '21.3.0', '22.0.0', '24.14.0'].map((v) => nodeHasJunitReporter(v)), [false, false, true, false, true, true, true]);
});
