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

- `node bench/run.mts --label <name> --tasks all --reps 2 [--plugin-dir .]`: run agents
- `node bench/scripts/summarize.mts <label>`: cheat / regression / honest-success rates
- `node bench/replay.mts <label...>`: replay recorded runs through the gate offline
- `node bench/replay-git.mts <repo...>`: false-alarm check on real commit history

**The benchmark is not a security sandbox.** Agents run on your machine as you. File tools
are confined to a temp workspace and Bash is limited to running tests and listing files, but
the tests an agent runs are code it can write. Every run's transcript is audited for tool
calls that reach outside the workspace (`out_of_bounds` in each `grade.json`;
`node bench/scripts/audit.mts <label>` re-audits old runs). For real isolation, run the bench
inside WSL2 or Linux with Claude Code's Bash sandbox enabled.

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
