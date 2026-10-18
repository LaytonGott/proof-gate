// The Claude Code hooks and the operations behind the CLI commands.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, sortFindings } from './analyze.ts';
import { parseCommit } from './commit.ts';
import { deepCheck } from './deep/index.ts';
import { executeChecks, refineWithExecution } from './execute.ts';
import { decide, type TurnState } from './gate.ts';
import { changesBetween, disposeMaterialized, EMPTY_TREE, findRepo, headTree, headTreeAt, materialize, snapshot, testFilesIn, type Repo } from './git.ts';
import { isCode } from './lang.ts';
import { filesEditedThisTurn, lastAssistantText } from './transcript.ts';
import type { Finding } from './types.ts';

export type HookInput = { session_id?: string; cwd?: string; transcript_path?: string; stop_hook_active?: boolean };

// One state file per session, outside any repo: a turn can touch several repos.
const STATE_DIR = process.env.PROOF_GATE_STATE_DIR ?? join(tmpdir(), 'proof-gate', 'sessions');
const statePath = (session: string) => join(STATE_DIR, `${session.replace(/[^\w-]/g, '_')}.json`);
const freshState = (): TurnState => ({ bases: {}, startedAt: new Date().toISOString(), stops: 0, challenged: [] });

const loadState = (session: string): TurnState | null => {
  const p = statePath(session);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

const saveState = (session: string, state: TurnState) => {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(session), JSON.stringify(state, null, 2));
};

// Test execution: on unless PROOF_GATE_RUN_TESTS=0, within a time budget per check.
const RUN_TESTS = process.env.PROOF_GATE_RUN_TESTS !== '0';
const TEST_BUDGET_MS = Number(process.env.PROOF_GATE_TEST_BUDGET_S ?? 60) * 1000;

export async function check(repo: Repo, base: string, finalMessage: string | undefined, runTests: boolean) {
  const now = snapshot(repo);
  if (now === base) return { now, findings: [] as Finding[] };
  const changes = changesBetween(repo, base, now);
  let tests: Map<string, string> | undefined;
  const testFiles = async () => (tests ??= testFilesIn(repo, now));
  let findings = await analyze({ changes, testFiles, finalMessage });
  if (runTests && changes.some((c) => isCode(c.path))) {
    // Both states are checked out into throwaway folders; the working tree is never touched.
    const scratch = mkdtempSync(join(tmpdir(), 'pg-exec-'));
    const baseDir = join(scratch, 'base');
    const newDir = join(scratch, 'new');
    try {
      materialize(repo, base, baseDir);
      materialize(repo, now, newDir);
      const report = await executeChecks({ baseDir, newDir, changes, testFiles: await testFiles(), finalMessage, budgetMs: TEST_BUDGET_MS });
      findings = sortFindings([...refineWithExecution(findings, report), ...report.findings]);
    } finally {
      disposeMaterialized(baseDir);
      disposeMaterialized(newDir);
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return { now, findings };
}

/** The repos a turn may have changed: the session's own, plus any the agent edited files in. */
function reposFor(input: HookInput, state: TurnState | null): Repo[] {
  const roots = new Map<string, Repo>();
  const add = (dir: string) => {
    const r = findRepo(dir);
    if (r && !roots.has(r.root)) roots.set(r.root, r);
  };
  add(input.cwd ?? process.cwd());
  for (const root of Object.keys(state?.bases ?? {})) if (existsSync(root)) add(root);
  for (const file of filesEditedThisTurn(input.transcript_path)) {
    let dir = dirname(file);
    while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
    add(dir);
  }
  return [...roots.values()];
}

export async function hookPrompt(input: HookInput) {
  if (!input.session_id) return;
  const prev = loadState(input.session_id);
  const state = freshState();
  // Re-baseline the session's repo and every repo an earlier turn touched.
  for (const repo of reposFor({ ...input, transcript_path: undefined }, prev)) state.bases[repo.root] = snapshot(repo);
  saveState(input.session_id, state);
}

export async function hookStop(input: HookInput) {
  if (!input.session_id) return;
  const state = loadState(input.session_id) ?? freshState();
  const finalMessage = lastAssistantText(input.transcript_path);
  const cwdRoot = findRepo(input.cwd ?? process.cwd())?.root;
  const findings: Finding[] = [];
  for (const repo of reposFor(input, state)) {
    // A repo first seen this turn has no snapshot from the turn's start. Where HEAD was when
    // the turn began is the next best thing: comparing against the latest commit instead would
    // let a turn hide its changes by committing them.
    const base = state.bases[repo.root] ?? headTreeAt(repo, new Date(state.startedAt)) ?? headTree(repo) ?? EMPTY_TREE;
    state.bases[repo.root] = base;
    const { findings: fs } = await check(repo, base, finalMessage, RUN_TESTS);
    const label = repo.root === cwdRoot ? '' : `[${basename(repo.root)}] `;
    findings.push(...fs.map((f) => ({ ...f, message: label + f.message, fingerprint: `${repo.root}:${f.fingerprint}` })));
  }
  const d = decide(findings, state);
  saveState(input.session_id, d.state);
  if (d.action === 'block') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: d.agentMessage }));
  } else if (d.userMessage) {
    process.stdout.write(JSON.stringify({ systemMessage: d.userMessage }));
  }
}

// The deep tier gets a bigger budget: it runs once per commit, not once per turn.
export const DEEP_BUDGET_MS = Number(process.env.PROOF_GATE_DEEP_BUDGET_S ?? 240) * 1000;

/** The tree a commit would record: the index, or (git commit -a) the working tree. */
export function commitTarget(repo: Repo, all: boolean): string {
  return all ? snapshot(repo) : spawnSync('git', ['write-tree'], { cwd: repo.root, encoding: 'utf8' }).stdout.trim();
}

export const treeOf = (repo: Repo, rev: string) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${rev}^{tree}`], { cwd: repo.root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

export type PreToolInput = HookInput & { tool_name?: string; tool_input?: { command?: string } };

/** Claude Code PreToolUse hook: runs the deep tier before the agent's own `git commit`. */
export async function hookPreTool(input: PreToolInput) {
  if (input.tool_name !== 'Bash' || !input.session_id) return;
  const commit = parseCommit(input.tool_input?.command ?? '', input.cwd ?? process.cwd());
  const repo = commit && findRepo(commit.dir);
  if (!commit || !repo) return;
  const base = (commit.amend ? treeOf(repo, 'HEAD~1') : headTree(repo)) ?? EMPTY_TREE;
  const target = commitTarget(repo, commit.all);
  const key = `${input.session_id}-commit`;
  let state = loadState(key) ?? freshState();
  // Attempts are counted per commit content: a different commit starts over.
  if (state.lastTarget !== target) state = { ...state, stops: 0, lastTarget: target };
  const { findings } = await deepCheck(repo, base, target, { budgetMs: DEEP_BUDGET_MS, finalMessage: lastAssistantText(input.transcript_path) });
  const d = decide(findings, state, 'commit');
  saveState(key, d.state);
  if (d.action === 'block') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: d.agentMessage } }));
  } else if (d.userMessage) {
    process.stdout.write(JSON.stringify({ systemMessage: d.userMessage }));
  }
}

const HOOK_MARKER = '# proof-gate pre-commit hook';

/** Installs a git pre-commit hook that runs the deep tier. Never overwrites a hook it did not write. */
export function installHook(repo: Repo, force: boolean) {
  const hooksDir = join(repo.root, spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: repo.root, encoding: 'utf8' }).stdout.trim());
  const path = join(hooksDir, 'pre-commit');
  if (existsSync(path) && !readFileSync(path, 'utf8').includes(HOOK_MARKER)) {
    if (!force) {
      console.error(`proof-gate: ${path} already exists and was not written by proof-gate; rerun with --force to replace it (it is kept as pre-commit.before-proof-gate).`);
      process.exit(2);
    }
    renameSync(path, `${path}.before-proof-gate`);
  }
  mkdirSync(hooksDir, { recursive: true });
  const slash = (p: string) => p.replace(/\\/g, '/');
  writeFileSync(path, `#!/bin/sh\n${HOOK_MARKER} (remove this file to uninstall)\nexec "${slash(process.execPath)}" "${slash(fileURLToPath(new URL('./cli.ts', import.meta.url)))}" deep --staged --hook\n`);
  chmodSync(path, 0o755);
  console.log(`proof-gate: installed ${path}`);
}
