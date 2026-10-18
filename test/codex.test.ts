// Codex: its hook input, its transcript format, and installing into its hooks.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchedFiles } from '../src/transcript.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const STATE = mkdtempSync(join(tmpdir(), 'pg-codex-state-'));
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const hook = (cwd: string, sub: string, input: object) => {
  const r = spawnSync(process.execPath, [CLI, 'hook', sub], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PROOF_GATE_STATE_DIR: STATE } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
};

test('apply_patch file names, plain and JSON-escaped', () => {
  const plain = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** Add File: tests/test_b.py\n*** Delete File: old.py\n*** Move to: src/c.ts\n*** End Patch';
  assert.deepEqual(patchedFiles(plain), ['src/a.ts', 'tests/test_b.py', 'old.py', 'src/c.ts']);
  const escaped = JSON.stringify({ payload: { input: '*** Begin Patch\n*** Update File: C:\\Users\\me\\repo\\calc.py\n@@\n*** End Patch' } });
  assert.deepEqual(patchedFiles(escaped), ['C:\\Users\\me\\repo\\calc.py']);
});

test('a Codex turn: last_assistant_message and apply_patch edits in another repo', () => {
  const repo = mkdtempSync(join(tmpdir(), 'pg-codex-repo-'));
  const cwd = mkdtempSync(join(tmpdir(), 'pg-codex-cwd-'));
  try {
    mkdirSync(join(repo, 'tests'));
    writeFileSync(join(repo, 'calc.py'), 'def half(x):\n    return x / 2\n');
    writeFileSync(join(repo, 'tests', 'test_calc.py'), 'from calc import half\n\n\ndef test_half():\n    assert half(3) == 1.5\n');
    git(repo, 'init', '-q');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'base');
    hook(cwd, 'prompt', { session_id: 'codex1', cwd, hook_event_name: 'UserPromptSubmit' });
    writeFileSync(join(repo, 'calc.py'), 'def half(x):\n    return x // 2\n');
    // Roughly how a Codex rollout records the edit.
    const rollout = join(cwd, 'rollout.jsonl');
    writeFileSync(rollout, `${JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: `*** Begin Patch\n*** Update File: ${join(repo, 'calc.py')}\n@@\n-    return x / 2\n+    return x // 2\n*** End Patch` } })}\n`);
    const out = hook(cwd, 'stop', {
      session_id: 'codex1', cwd, hook_event_name: 'Stop', turn_id: 't1', stop_hook_active: false,
      transcript_path: rollout, last_assistant_message: 'All tests pass now.',
    });
    assert.equal(out?.decision, 'block');
    assert.ok(out.reason.includes(`[${basename(repo)}]`));
    assert.match(out.reason, /regression/);
    assert.match(out.reason, /false-green/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('install-codex merges into an existing hooks.json, reinstalls cleanly, and removes only its own hooks', () => {
  const repo = mkdtempSync(join(tmpdir(), 'pg-codex-install-'));
  try {
    git(repo, 'init', '-q');
    mkdirSync(join(repo, '.codex'));
    const path = join(repo, '.codex', 'hooks.json');
    const theirs = { type: 'command', command: 'python3 my_audit.py', timeout: 5 };
    writeFileSync(path, JSON.stringify({ hooks: { Stop: [{ hooks: [theirs] }] } }));
    const run = (...args: string[]) => spawnSync(process.execPath, [CLI, 'install-codex', '--project', ...args], { cwd: repo, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run().status, 0); // twice: still one copy of each
    const config = JSON.parse(readFileSync(path, 'utf8'));
    const commands = (event: string) => (config.hooks[event] ?? []).flatMap((g: { hooks: Array<{ command: string }> }) => g.hooks.map((h) => h.command));
    assert.deepEqual(commands('Stop').filter((c: string) => c.includes('proof-gate')).length, 1);
    assert.ok(commands('Stop').includes('python3 my_audit.py'));
    assert.match(commands('UserPromptSubmit')[0], /cli\.(ts|mjs)" hook prompt$/);
    assert.equal(config.hooks.PreToolUse[0].matcher, 'Bash');
    assert.match(commands('PreToolUse')[0], /pretool\.mjs"$/);
    assert.equal(run('--remove').status, 0);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { hooks: { Stop: [{ hooks: [theirs] }] } });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
