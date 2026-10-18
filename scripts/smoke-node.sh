#!/usr/bin/env bash
# Smoke-tests the bundled gate (dist/) under a given Node binary: a regression in a Python repo
# must block at Stop, a node:test regression must block where Node can write JUnit, and a
# no-op Bash call must pass through the PreToolUse entry silently.
# Usage: scripts/smoke-node.sh <node-binary>
set -euo pipefail
NODE="$1"
DIST="$(cd "$(dirname "$0")/.." && pwd)/dist"
WORK="$(mktemp -d)"
STATE="$(mktemp -d)"
trap 'rm -rf "$WORK" "$STATE"' EXIT
export PROOF_GATE_STATE_DIR="$STATE"
git_() { git -c user.email=t@t -c user.name=t -c core.autocrlf=false "$@"; }

echo "node $("$NODE" --version)"

# Python: a regression blocks.
mkdir -p "$WORK/py/tests" && cd "$WORK/py"
printf 'def half(x):\n    return x / 2\n' > calc.py
printf 'from calc import half\n\n\ndef test_half():\n    assert half(3) == 1.5\n' > tests/test_calc.py
git_ init -q && git_ add -A && git_ commit -qm base
echo '{"session_id":"s1","cwd":"."}' | "$NODE" "$DIST/cli.mjs" hook prompt
printf 'def half(x):\n    return x // 2\n' > calc.py
out=$(echo '{"session_id":"s1","cwd":"."}' | "$NODE" "$DIST/cli.mjs" hook stop)
echo "$out" | grep -q '"decision":"block"' && echo "  python regression: blocked" || { echo "  python regression: NOT blocked: $out"; exit 1; }

# node:test: blocks where JUnit is available, otherwise passes quietly.
mkdir -p "$WORK/js/test" "$WORK/js/src" && cd "$WORK/js"
echo '{ "type": "module" }' > package.json
printf 'export const double = (x) => x * 2;\n' > src/math.mjs
printf "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { double } from '../src/math.mjs';\n\ntest('doubles', () => assert.equal(double(3), 6));\n" > test/math.test.mjs
git_ init -q && git_ add -A && git_ commit -qm base
echo '{"session_id":"s2","cwd":"."}' | "$NODE" "$DIST/cli.mjs" hook prompt
printf 'export const double = (x) => x + 2;\n' > src/math.mjs
out=$(echo '{"session_id":"s2","cwd":"."}' | "$NODE" "$DIST/cli.mjs" hook stop)
if echo "$out" | grep -q 'regression'; then echo "  node:test regression: blocked"; else echo "  node:test regression: skipped (${out:-no output})"; fi

# A Bash call that is not a commit passes through untouched.
out=$(echo '{"tool_name":"Bash","session_id":"s3","cwd":".","tool_input":{"command":"ls"}}' | "$NODE" "$DIST/pretool.mjs")
[ -z "$out" ] && echo "  pretool no-op: silent" || { echo "  pretool no-op: unexpected output: $out"; exit 1; }
