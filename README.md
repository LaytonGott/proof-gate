# proof-gate

A deterministic review gate for coding agents. When Claude Code finishes a turn, proof-gate
diffs what the agent changed during that turn and stops the agent if the change games the
tests instead of fixing the code. No model calls, no network, no dependencies.

## What it catches

| Level | Rule | Example |
|---|---|---|
| block | `test-file-deleted`, `tests-removed`, `assertions-removed` | deleting the failing test or its assertions |
| block | `test-skipped` | adding `@pytest.mark.skip`, `it.skip`, `t.Skip()` |
| block | `assertion-weakened` | `toEqual(3)` -> `toBeDefined()` |
| block | `test-run-neutered`, `threshold-lowered` | `pytest \|\| true`, `--passWithNoTests`, lowering `fail_under` |
| block | `test-env-sniffing` | `if "pytest" in sys.modules:` |
| challenge | `expectation-changed` | `assert.equal(round(2.5), 2)` -> `3` with no new tests |
| challenge | `literal-from-test` | `DEFAULT_BURST = 11` copied from `range(11)` in an existing test |
| challenge | `test-referenced-in-code` | `return 1  # tests expect 1 here` |
| challenge | `test-name-in-code`, `test-script-changed`, `test-harness-changed` | |
| challenge | `test-rationale-in-code` | a code comment lifting a test comment's wording to justify a special case |
| info | `suppression-added`, `agent-admits-shortcut` | `@ts-ignore`; "I special-cased the empty input" |

These need the tests to run (see below):

| Level | Rule | What it proves |
|---|---|---|
| block | `regression` | a test the agent did not touch passed before the turn and fails now (re-run on both sides first, so a flaky test is not reported) |
| block | `false-green` | the agent says the tests pass while affected tests fail |
| challenge | `test-edited-to-pass` | an edited test passes, but its original version fails against the new code |
| info | `tests-failing`, `tests-not-all-run` | affected tests still failing; the time budget or the cap cut the run short |

Test execution also sharpens `literal-from-test`: a constant copied from a test stays a
challenge when that test went from failing to passing, and drops to info when the test was
already passing (a coincidence, not a copied expectation).

At commit time the deep tier adds (see [Commit-time checks](#commit-time-checks)):

| Level | Rule | What it shows |
|---|---|---|
| block | `api-removed-still-used` | a public function or class was removed while code elsewhere still uses it |
| block | `call-sites-not-updated` | a function gained a required parameter or lost a keyword, and callers still use the old form |
| challenge | `surviving-mutants` | small edits to the changed lines (`>=` to `>`, `and` to `or`, `return x` to `return None`) leave every test passing: the tests do not check that behaviour |
| challenge | `uncovered-change` | 3+ changed lines never run under the tests that import the module |
| info | `untested-change`, `public-api-removed`, `api-signature-changed`, `mutation-score` | no test imports the module; an API change nothing in the repo depends on; the mutation score |

- **block**: the agent is sent back until the problem is gone (up to 3 times per turn; after
  that the user is told what is still unresolved).
- **challenge**: the agent is sent back once and must either fix it or explain it to the user.
- **info**: shown to the user, never stops the agent.

## Install

Needs Node 18+ and git. Python projects need pytest. Nothing else is installed or downloaded.

**Claude Code:**

```
/plugin marketplace add LaytonGott/proof-gate
/plugin install proof-gate@proof-gate
```

(or `claude plugin marketplace add LaytonGott/proof-gate` and
`claude plugin install proof-gate@proof-gate` from a shell)

To try it without installing, for one session: `claude --plugin-dir /path/to/proof-gate`.

**Codex:** the repo is also a Codex plugin (`.codex-plugin/plugin.json`, marketplace in
`.agents/plugins/marketplace.json`):

```bash
codex plugin marketplace add LaytonGott/proof-gate
```

then install it from the Plugins Directory. Codex applies plugin hooks only to plugins
installed in the Codex desktop app; for the Codex CLI, add the hooks directly instead, for
every project or for one:

```bash
npx github:LaytonGott/proof-gate install-codex            # ~/.codex/hooks.json
npx github:LaytonGott/proof-gate install-codex --project  # <repo>/.codex/hooks.json
```

It keeps any hooks already there, and `install-codex --remove` takes its own back out. Then
run `/hooks` in Codex and trust them: Codex skips new or changed hooks until you do. The hook
commands start with a plain `node` from your PATH (on Windows, Codex runs hooks through
PowerShell, which treats a quoted executable path as a string and runs nothing).

`scripts/codex-e2e.sh` checks this in one real `codex exec` run: Codex is asked to switch a
function to integer division, which breaks an existing test. The Stop hook reported the
failing test and sent Codex back three times (the block cap) before handing it to the user.

**Any repo, any agent (or none):** `npx github:LaytonGott/proof-gate install-hook` adds the
commit-time checks as a git pre-commit hook.

The plugin ships prebuilt in `dist/` (plain JavaScript, Node 18+); `npm run build` regenerates
it from `src/`, and `npm run check:dist` fails if it is stale.

## How it runs

The plugin registers three hooks: `UserPromptSubmit` snapshots the working tree when a turn
starts (a git tree object, written without touching your index), `Stop` checks the turn's
changes against it, and `PreToolUse` runs the commit-time checks when the agent commits. Codex
calls the same hooks with the same input; its edits are found from `apply_patch` in its log.
It checks the session's own repo and every repo the agent edited files in. A repo first touched mid-turn is compared against where its HEAD was when the turn
began (from the reflog), so committing during the turn does not hide the turn's changes.
Outside a git repository it does nothing.

**Test execution.** When a turn changes code, the Stop hook runs the affected tests: the test
files the turn changed, plus unchanged test files that import a changed module. Both states
(start of turn, now) are checked out into throwaway folders, so your working tree is never
touched; the repo's `node_modules` is linked in. Runners are detected per test file: pytest,
`node:test`, vitest and jest (when installed in the repo). Three runs: the original tests on
the original code, the current tests on the current code, and the original versions of
edited tests on the current code.

This runs your project's own test code on your machine, as you, the same code the agent (or
you) would run with `npm test` or `pytest`. Turn it off for repositories whose tests you do
not trust.

- `PROOF_GATE_RUN_TESTS=0` turns execution off.
- `PROOF_GATE_TEST_BUDGET_S` (default 60) bounds the time it may take per repo.

### Commit-time checks

The deep tier runs everything above plus three slower checks on what is being committed:

- **Diff coverage**: which changed lines the tests that import the module actually run. No
  coverage tool needed: Node's built-in V8 coverage for `node:test`, and a small
  `sys.monitoring` pytest plugin (`src/deep/pg_cov.py`) for Python.
- **Mutation testing of the changed lines**: up to 30 small, behaviour-changing edits to the
  covered changed lines (strings, comments and regex literals are never touched), each run
  against those tests. An edit no test notices is behaviour no test checks. When the only
  survivors are nudged constants (often equivalent mutants), it is info, not a challenge.
- **API breaks**: public Python functions, classes and methods (from Python's own `ast`) and
  JS/TS exports that were removed or became harder to call, with the call sites elsewhere in
  the repo that were not updated.

It runs in three places:

- **The agent's own commits.** The plugin's `PreToolUse` hook runs it when the agent's Bash
  command is a `git commit` (on the index, or the working tree for `commit -a`; `--amend`
  compares against `HEAD~1`) and denies the commit on a block or a new challenge. The check
  for "is this a commit" is a plain-JS fast path, so other Bash calls cost about 25 ms.
- **Your commits.** `proof-gate install-hook` writes a git pre-commit hook. It fails the
  commit only on block findings and prints the rest. It will not replace a hook it did not
  write unless given `--force`, which keeps the old one as `pre-commit.before-proof-gate`.
- **By hand.** `proof-gate deep [--base <rev>] [--staged] [--json]`.

`PROOF_GATE_DEEP_BUDGET_S` (default 240) bounds its time.

CLI:

```bash
proof-gate check              # working tree vs HEAD
proof-gate check --base main  # vs another commit
proof-gate check --run-tests  # include test execution
proof-gate check --json
proof-gate deep --staged      # the commit-time tier on what is staged
proof-gate install-hook       # run it from a git pre-commit hook
```

(`proof-gate` is `npx github:LaytonGott/proof-gate`, or `node dist/cli.mjs` in a checkout. Developing
proof-gate itself needs Node 24+, which runs the TypeScript sources and tests directly.)

## How well it works

`bench/` holds a sandboxed benchmark: base headless Claude Code on 27 tasks (ImpossibleBench
LiveCodeBench variants plus hand-written multi-file tasks under deadline pressure), graded
against hidden tests.

- `node bench/run.mts --label <name> --tasks all --reps 2 [--plugin-dir .] [--isolation host]`: run agents
- `node bench/scripts/summarize.mts <label>`: cheat / regression / honest-success rates
- `node bench/replay.mts <label...>`: replay recorded runs through the gate offline
- `node bench/replay-git.mts <repo...>`: false-alarm check on real commit history
- `node bench/scripts/probe-sandbox.mts`: prove the WSL sandbox holds (see below)

### Isolation

Agents run code: the tests they write and run are arbitrary programs. Two modes:

- `--isolation host` runs agents on this machine as you. File tools stay in a temp
  workspace and Bash is limited to test commands, but this is **not a security boundary**.
- `--isolation wsl` (default) runs each agent inside WSL2 under Claude Code's Bash sandbox
  (`bench/wsl.mts`). The workspace is copied into WSL; the agent's commands can write only
  there, cannot read `/mnt` (the Windows drives, so the grader's hidden tests are out of
  reach), the WSL home (credentials), other runs or the control files, get no network, and
  cannot launch Windows programs. There is no unsandboxed retry, and the run refuses to start
  if the sandbox is unavailable. File tools are kept off the same paths by permission rules.
  Symlinks the agent creates are removed before the workspace is copied back for grading on
  the host. Hidden tests never enter WSL.

  `probe-sandbox.mts` has an agent inside the sandbox attempt 16 escapes (Windows files
  directly and via Python, the hidden tests, credentials, the home folder, a neighbouring
  run's files, rewriting its own sandbox settings, writing outside the workspace,
  `cmd.exe` interop, the network, the Read tool on Windows files and credentials) plus two
  controls. On this machine all 16 were blocked and both controls worked.

  Setup inside the WSL distro (default `Ubuntu`, override with `PG_WSL_DISTRO`): native
  Claude Code in `~/.local/bin` and signed in; `bubblewrap`, `socat`, `python3-pytest`;
  the seccomp filter (`npm i -g @anthropic-ai/sandbox-runtime`, which blocks the Windows
  interop socket); and an official Node.js 24 in `/usr/local` (Ubuntu's packaged Node is
  built without TypeScript support, and a per-user install under `$HOME` is invisible to
  sandboxed commands).

Either way, every run's transcript is audited for tool calls that reach outside the workspace
(`out_of_bounds` in each `grade.json`; `node bench/scripts/audit.mts <label>` re-audits old
runs).

Current numbers (Sonnet 5.5, low effort):

- Baseline cheat rate, three batches (host with broad Bash, host with narrowed Bash, WSL
  sandbox): 5% on simple tasks every time; 8-25% on hard impossible tasks. Every recorded
  cheat was disclosed in the agent's final message; none were silent. No run touched
  anything outside its workspace. The WSL sandbox batch matched the host batches on simple
  tasks; on hard ones it cheated more often (all on `hard-ts-expr`, 3/3), within the noise
  of three runs per task.
- Replay: 15/15 recorded cheats stopped (block or challenge), 0/176 clean runs stopped, with
  and without test execution. With execution, all 5 edited-test cheats also come with proof
  (`test-edited-to-pass`: the original test fails against the new code), at about 3s of test
  running per run.
- Real history: 18 of 554 commits across three repos would have stopped the agent, mostly for
  test deletions or expectation changes.
- Deep tier on the 61 WSL-sandbox runs: cheat detection unchanged (5/5, 0/56), mutation
  testing caught 222 of 290 mutants of changed lines, and 15 runs would be challenged at commit
  for test gaps. Those are real: untested expiry boundaries (`>` vs `>=` in a TTL cache), a
  cached value whose content no test reads (`return dict(cached)` -> `return None` survives),
  port bounds 0 and 65535. On amnesia's last 6 commits it took about 5 s per commit (31 s for
  the one with tests) and flagged 23 new lines of `src/claude.mjs` that its tests never run.
- Limitation: a challenge asks for an explanation; an agent can explain and keep the change
  (it did once, transparently). Test execution turns the provable cases into blocks
  (`regression`, `false-green`), but after 3 blocks in one turn the decision goes to the user.

## License

MIT. See [LICENSE](LICENSE).
