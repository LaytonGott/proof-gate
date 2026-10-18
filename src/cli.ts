#!/usr/bin/env node
// proof-gate CLI.
//
//   proof-gate check [--base <tree-ish>] [--run-tests] [--json]
//                                                   analyze the working tree against a base (default HEAD)
//   proof-gate snapshot                             print the tree id of the working tree right now
//   proof-gate hook prompt                          Claude Code UserPromptSubmit hook: remember the turn's start
//   proof-gate hook stop                            Claude Code Stop hook: gate the agent's changes
//   proof-gate hook pretool                         Claude Code PreToolUse hook: deep check before the agent commits
//   proof-gate deep [--base <rev>] [--staged] [--hook] [--json]
//                                                   the deep tier (coverage, mutation, API breaks) on the working tree or index
//   proof-gate install-hook [--force]               git pre-commit hook running the deep tier
//   proof-gate install-codex [--project] [--remove] add (or remove) the hooks in Codex's hooks.json
import { readFileSync } from 'node:fs';
import { formatFindings } from './analyze.ts';
import { deepCheck } from './deep/index.ts';
import { EMPTY_TREE, findRepo, headTree, snapshot } from './git.ts';
import { check, commitTarget, DEEP_BUDGET_MS, hookPreTool, hookPrompt, hookStop, installCodex, installHook, treeOf, type HookInput, type PreToolInput } from './hooks.ts';

const readStdin = (): string => {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  if (cmd === 'hook') {
    // A hook must never break the session: any failure lets the agent stop normally.
    try {
      const input = JSON.parse(readStdin() || '{}') as HookInput;
      if (sub === 'prompt') await hookPrompt(input);
      else if (sub === 'stop') await hookStop(input);
      else if (sub === 'pretool') await hookPreTool(input as PreToolInput);
    } catch (err) {
      process.stderr.write(`proof-gate: ${(err as Error).message}\n`);
    }
    return;
  }

  if (cmd === 'install-codex') {
    const args = [sub, ...rest];
    const project = args.includes('--project') ? findRepo(process.cwd()) : undefined;
    if (args.includes('--project') && !project) {
      console.error('proof-gate: --project needs to run inside a git repository');
      process.exit(2);
    }
    const remove = args.includes('--remove');
    const path = installCodex({ project: project ?? undefined, remove });
    console.log(remove
      ? `proof-gate: removed its hooks from ${path}`
      : `proof-gate: added its hooks to ${path}\nIn Codex, run /hooks and trust them: Codex skips new or changed hooks until you do.`);
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
    const { findings } = await check(repo, base, undefined, args.includes('--run-tests'));
    if (args.includes('--json')) console.log(JSON.stringify(findings, null, 2));
    else console.log(findings.length ? formatFindings(findings) : 'proof-gate: no findings');
    process.exit(findings.some((f) => f.level !== 'info') ? 1 : 0);
  }
  if (cmd === 'deep') {
    const args = [sub, ...rest].filter(Boolean);
    const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD';
    const base = treeOf(repo, baseArg) ?? EMPTY_TREE;
    const target = args.includes('--staged') ? commitTarget(repo, false) : snapshot(repo);
    const { findings, quality } = await deepCheck(repo, base, target, { budgetMs: DEEP_BUDGET_MS });
    if (args.includes('--json')) console.log(JSON.stringify({ findings, quality }, null, 2));
    else console.log(findings.length ? formatFindings(findings) : 'proof-gate: no findings');
    // As a git hook, only proof stops the commit; standalone, anything worth a look fails.
    const failing = args.includes('--hook') ? findings.some((f) => f.level === 'block') : findings.some((f) => f.level !== 'info');
    process.exit(failing ? 1 : 0);
  }
  if (cmd === 'install-hook') {
    installHook(repo, [sub, ...rest].includes('--force'));
    return;
  }
  console.error('usage: proof-gate check [--base <tree-ish>] [--run-tests] [--json] | deep [--base <rev>] [--staged] [--hook] [--json] | install-hook [--force] | install-codex [--project] [--remove] | snapshot | hook prompt|stop|pretool');
  process.exit(2);
}

await main();
