// Claude Code PreToolUse entry point. It runs before every Bash call, so it is plain JS (the
// common case skips the TypeScript loader) and loads the gate only when the command could be
// a `git commit`.
import { readFileSync } from 'node:fs';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  // No input: nothing to check.
}
if (/\bgit\b[^\n]*\bcommit\b/.test(raw)) {
  try {
    const { hookPreTool } = await import('./hooks.ts');
    await hookPreTool(JSON.parse(raw));
  } catch (err) {
    // A hook must never break the session.
    process.stderr.write(`proof-gate: ${err?.message ?? err}\n`);
  }
}
