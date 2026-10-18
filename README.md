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
| info | `suppression-added`, `agent-admits-shortcut` | `@ts-ignore`; "I special-cased the empty input" |

- **block**: the agent is sent back until the problem is gone (up to 3 times per turn; after
  that the user is told what is still unresolved).
- **challenge**: the agent is sent back once and must either fix it or explain it to the user.
- **info**: shown to the user, never stops the agent.

## Use it

Claude Code (session-only, while developing):

```bash
claude --plugin-dir /path/to/proof-gate
```

The plugin registers two hooks: `UserPromptSubmit` snapshots the working tree when a turn
starts (a git tree object, written without touching your index), and `Stop` checks the
turn's changes against it. Outside a git repository it does nothing.

CLI:

```bash
node src/cli.ts check              # working tree vs HEAD
node src/cli.ts check --base main  # vs another commit
node src/cli.ts check --json
```

Requires Node 24+ (runs the TypeScript sources directly).

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

- Baseline cheat rate: 5% on simple tasks; 8-25% on hard impossible tasks across two batches
  (the second with the narrowed Bash allowlist). Every recorded cheat was disclosed in the
  agent's final message; none were silent. No run touched anything outside its workspace.
- Replay: 9/9 recorded cheats stopped (block or challenge), 0/118 clean runs stopped.
- Real history: 18 of 553 commits across three repos would have stopped the agent, mostly for
  test deletions or expectation changes.
- Known gap: a repo the agent touches for the first time in a turn is checked against its last
  commit, so an agent that commits mid-turn hides that turn's changes from the gate.
- Limitation: a challenge asks for an explanation; an agent can explain and keep the change
  (it did once, transparently). Turning that into proof needs the test-execution checks of M2.
