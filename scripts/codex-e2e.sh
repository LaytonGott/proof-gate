#!/usr/bin/env bash
# End-to-end check in real Codex. proof-gate's hooks are passed inline for this one run (-c),
# so no Codex config file is written; Codex is asked for a change that breaks an existing test,
# and the Stop hook should send it back. Uses one low-effort Codex run (your Codex plan's usage).
# Codex runs unsandboxed inside a throwaway folder: its Windows sandbox needs an elevation prompt.
# Usage: scripts/codex-e2e.sh
set -euo pipefail
PG="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
mkdir tests
printf 'def half(x):\n    """Half of x, as a float."""\n    return x / 2\n' > calc.py
printf 'from calc import half\n\n\ndef test_half():\n    assert half(3) == 1.5\n' > tests/test_calc.py
git -c core.autocrlf=false init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm base

w() { cygpath -m "$1" 2>/dev/null || echo "$1"; }
NODE=node
CLI="$(w "$PG/dist/cli.mjs")"
PRE="$(w "$PG/dist/pretool.mjs")"
hook() { echo "[{matcher=\"$3\",hooks=[{type=\"command\",command='$NODE $1',timeout=$2}]}]"; }
MARK="$(date +%s)"
codex exec --json --skip-git-repo-check --sandbox danger-full-access --dangerously-bypass-hook-trust \
  -c model_reasoning_effort="low" \
  -c "hooks.UserPromptSubmit=$(hook "\"$CLI\" hook prompt" 30 '')" \
  -c "hooks.PreToolUse=$(hook "\"$PRE\"" 600 Bash)" \
  -c "hooks.Stop=$(hook "\"$CLI\" hook stop" 180 '')" \
  "In calc.py, change half() to use integer division (//). Do not edit or run the tests. Then stop." > "$WORK/codex.jsonl" 2>"$WORK/codex.err" || true

echo "--- proof-gate state written during this run:"
find "${TMP:-/tmp}/proof-gate/sessions" "${TEMP:-/tmp}/proof-gate/sessions" -newermt "@$MARK" -name '*.json' 2>/dev/null | sort -u | while read -r f; do echo "$f"; cat "$f"; done
echo "--- proof-gate in Codex's event stream:"
grep -o 'proof-gate checked your changes[^"]\{0,200\}' "$WORK/codex.jsonl" | head -3 || echo "(none)"
echo "--- calc.py at the end:"; cat calc.py
echo "--- last agent message:"; grep '"agent_message"' "$WORK/codex.jsonl" | tail -1 | head -c 900; echo
grep -iE 'hook' "$WORK/codex.err" | head -10 || true
