// End to end: the CLI's Claude Code hooks in a throwaway git repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const STATE = mkdtempSync(join(tmpdir(), 'pg-state-'));

const sh = (cwd: string, cmd: string, ...args: string[]) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const hook = (cwd: string, sub: string, input: object) => {
  const r = spawnSync(process.execPath, [CLI, 'hook', sub], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PROOF_GATE_STATE_DIR: STATE } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pg-hook-'));
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'calc.py'), 'def half(x):\n    return x / 2\n');
  writeFileSync(join(dir, 'tests', 'test_calc.py'), 'from calc import half\n\ndef test_half():\n    assert half(4) == 2\n    assert half(3) == 1.5\n');
  sh(dir, 'git', 'init', '-q');
  sh(dir, 'git', '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'code');
  return dir;
}

test('stop is allowed when the turn changed nothing', () => {
  const dir = repo();
  try {
    hook(dir, 'prompt', { session_id: 's1', cwd: dir });
    assert.equal(hook(dir, 'stop', { session_id: 's1', cwd: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deleting an assertion blocks every stop until the cap, then the user is told', () => {
  const dir = repo();
  try {
    hook(dir, 'prompt', { session_id: 's2', cwd: dir });
    writeFileSync(join(dir, 'tests', 'test_calc.py'), 'from calc import half\n\ndef test_half():\n    assert half(4) == 2\n');
    for (let i = 0; i < 3; i++) {
      const out = hook(dir, 'stop', { session_id: 's2', cwd: dir, stop_hook_active: i > 0 });
      assert.equal(out.decision, 'block');
      assert.match(out.reason, /assertions-removed/);
    }
    const last = hook(dir, 'stop', { session_id: 's2', cwd: dir, stop_hook_active: true });
    assert.equal(last.decision, undefined);
    assert.match(last.systemMessage, /unresolved problem/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a challenge stops the agent once, then is passed on to the user', () => {
  const dir = repo();
  try {
    hook(dir, 'prompt', { session_id: 's3', cwd: dir });
    writeFileSync(join(dir, 'tests', 'test_calc.py'), 'from calc import half\n\ndef test_half():\n    assert half(4) == 2\n    assert half(3) == 1\n');
    const first = hook(dir, 'stop', { session_id: 's3', cwd: dir });
    assert.equal(first.decision, 'block');
    assert.match(first.reason, /expectation-changed/);
    const transcript = join(dir, 't.jsonl');
    writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'The user asked for integer halving, so I changed the expectation.' }] } }) + '\n');
    const second = hook(dir, 'stop', { session_id: 's3', cwd: dir, transcript_path: transcript, stop_hook_active: true });
    assert.equal(second.decision, undefined);
    assert.match(second.systemMessage, /expectation-changed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a new turn starts from a fresh baseline', () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, 'tests', 'test_calc.py'), 'from calc import half\n\ndef test_half():\n    assert half(4) == 2\n');
    // The edit happened before this turn began, so it is not this turn's change.
    hook(dir, 'prompt', { session_id: 's4', cwd: dir });
    assert.equal(hook(dir, 'stop', { session_id: 's4', cwd: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('outside a git repo the hooks do nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pg-nogit-'));
  try {
    assert.equal(hook(dir, 'prompt', { session_id: 's5', cwd: dir }), null);
    assert.equal(hook(dir, 'stop', { session_id: 's5', cwd: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a repo outside the session folder is gated when the agent edited files in it', () => {
  const dir = repo();
  const outside = mkdtempSync(join(tmpdir(), 'pg-cwd-'));
  try {
    hook(outside, 'prompt', { session_id: 's6', cwd: outside });
    const target = join(dir, 'tests', 'test_calc.py');
    writeFileSync(target, 'from calc import half\n\ndef test_half():\n    assert half(4) == 2\n');
    const transcript = join(outside, 't.jsonl');
    writeFileSync(transcript, [
      { type: 'user', message: { role: 'user', content: 'tidy the tests' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: { file_path: target, content: '' } }] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    const out = hook(outside, 'stop', { session_id: 's6', cwd: outside, transcript_path: transcript });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /assertions-removed/);
    assert.ok(out.reason.includes(`[${basename(dir)}]`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
