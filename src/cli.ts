#!/usr/bin/env node
// proof-gate CLI.
//
//   proof-gate check [--base <tree-ish>] [--json]   analyze the working tree against a base (default HEAD)
//   proof-gate snapshot                             print the tree id of the working tree right now
//   proof-gate hook prompt                          Claude Code UserPromptSubmit hook: remember the turn's start
//   proof-gate hook stop                            Claude Code Stop hook: gate the agent's changes
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { analyze, formatFindings } from './analyze.ts';
import { decide, type TurnState } from './gate.ts';
import { changesBetween, EMPTY_TREE, findRepo, headTree, snapshot, testFilesIn, type Repo } from './git.ts';
import { filesEditedThisTurn, lastAssistantText } from './transcript.ts';
import type { Finding } from './types.ts';

type HookInput = { session_id?: string; cwd?: string; transcript_path?: string; stop_hook_active?: boolean };

const readStdin = (): string => {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};

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

async function check(repo: Repo, base: string, finalMessage?: string) {
  const now = snapshot(repo);
  if (now === base) return { now, findings: [] as Finding[] };
  const findings = await analyze({
    changes: changesBetween(repo, base, now),
    testFiles: async () => testFilesIn(repo, now),
    finalMessage,
  });
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

async function hookPrompt(input: HookInput) {
  if (!input.session_id) return;
  const prev = loadState(input.session_id);
  const state = freshState();
  // Re-baseline the session's repo and every repo an earlier turn touched.
  for (const repo of reposFor({ ...input, transcript_path: undefined }, prev)) state.bases[repo.root] = snapshot(repo);
  saveState(input.session_id, state);
}

async function hookStop(input: HookInput) {
  if (!input.session_id) return;
  const state = loadState(input.session_id) ?? freshState();
  const finalMessage = lastAssistantText(input.transcript_path);
  const cwdRoot = findRepo(input.cwd ?? process.cwd())?.root;
  const findings: Finding[] = [];
  for (const repo of reposFor(input, state)) {
    // A repo first seen this turn has no snapshot from the turn's start; its last commit is
    // the best available baseline.
    const base = state.bases[repo.root] ?? headTree(repo) ?? EMPTY_TREE;
    state.bases[repo.root] = base;
    const { findings: fs } = await check(repo, base, finalMessage);
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

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  if (cmd === 'hook') {
    // A hook must never break the session: any failure lets the agent stop normally.
    try {
      const input = JSON.parse(readStdin() || '{}') as HookInput;
      if (sub === 'prompt') await hookPrompt(input);
      else if (sub === 'stop') await hookStop(input);
    } catch (err) {
      process.stderr.write(`proof-gate: ${(err as Error).message}\n`);
    }
    return;
  }

  const repo = findRepo(process.cwd());
  if (!repo) {
    console.error('proof-gate: not inside a git repository');
    process.exit(2);
  }
  if (cmd === 'snapshot') {
    console.log(snapshot(repo));
    return;
  }
  if (cmd === 'check') {
    const args = [sub, ...rest].filter(Boolean);
    const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;
    const base = baseArg ? (baseArg.length === 40 ? baseArg : `${baseArg}^{tree}`) : headTree(repo) ?? EMPTY_TREE;
    const { findings } = await check(repo, base);
    if (args.includes('--json')) console.log(JSON.stringify(findings, null, 2));
    else console.log(findings.length ? formatFindings(findings) : 'proof-gate: no findings');
    process.exit(findings.some((f) => f.level !== 'info') ? 1 : 0);
  }
  console.error('usage: proof-gate check [--base <tree-ish>] [--json] | snapshot | hook prompt|stop');
  process.exit(2);
}

await main();
