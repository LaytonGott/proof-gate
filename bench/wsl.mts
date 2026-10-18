// Runs a bench agent inside WSL2 under Claude Code's Bash sandbox, so the code an agent runs
// (its tests included) cannot read the Windows drives, the user's home or other runs, cannot
// reach the network, and cannot launch Windows programs. Hidden tests never enter WSL: the
// workspace is copied in, the agent works on it, and the result is copied back for grading on
// the host.
//
// Needs, inside the distro: native Claude Code signed in (~/.local/bin/claude), bubblewrap,
// socat, and the seccomp filter (npm i -g @anthropic-ai/sandbox-runtime), which is what blocks
// WSL's Windows-interop socket.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, type Proc } from './lib.mts';

export const DISTRO = process.env.PG_WSL_DISTRO ?? 'Ubuntu';
// Where workspaces live inside WSL: outside $HOME, which the sandbox hides.
const WSL_ROOT = '/tmp/pg-runs';
const WSL_CTL = '/tmp/pg-ctl';

/** C:\Users\x -> /mnt/c/Users/x */
export const toWslPath = (p: string) => p.replace(/^([A-Za-z]):[\\/]/, (_, d: string) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Settings for the agent: sandboxed Bash with no escape hatch, file tools kept off host files. */
export const sandboxSettings = () => ({
  sandbox: {
    enabled: true,
    // Refuse to run at all rather than fall back to unsandboxed commands.
    failIfUnavailable: true,
    // No dangerouslyDisableSandbox retries.
    allowUnsandboxedCommands: false,
    autoAllowBashIfSandboxed: true,
    filesystem: {
      // Windows drives, the WSL home (credentials, Claude config) and every other run.
      denyRead: ['/mnt', '~/', WSL_ROOT, WSL_CTL],
      // The narrower allow re-opens only the agent's own workspace.
      allowRead: ['.'],
    },
    // Sandboxed commands get no network at all; Claude Code's own API traffic is not sandboxed.
    network: { allowedDomains: [] },
  },
  // The sandbox covers shell commands; file tools follow permission rules.
  permissions: { deny: ['Read(//mnt/**)', 'Edit(//mnt/**)', 'Read(~/**)', 'Edit(~/**)'] },
});

export type WslRun = Proc & { wslWork: string; symlinks: string[] };

/**
 * Copies `hostWork` into WSL, runs `claude -p <prompt> <args>` there, strips symlinks the
 * agent created, copies the workspace back over `hostWork`, and returns the process result.
 */
export async function runAgentInWsl(opts: {
  hostWork: string;
  ctlDir: string;
  runId: string;
  prompt: string;
  args: string[];
  timeoutMs: number;
  onStdout?: (s: string) => void;
}): Promise<WslRun> {
  mkdirSync(opts.ctlDir, { recursive: true });
  const prompt = join(opts.ctlDir, `${opts.runId}.prompt.txt`);
  const settings = join(opts.ctlDir, `${opts.runId}.settings.json`);
  const script = join(opts.ctlDir, `${opts.runId}.sh`);
  writeFileSync(prompt, opts.prompt);
  writeFileSync(settings, JSON.stringify(sandboxSettings(), null, 2));
  const wslWork = `${WSL_ROOT}/${opts.runId}`;
  const host = toWslPath(opts.hostWork);
  writeFileSync(script, [
    '#!/usr/bin/env bash',
    'set -e',
    `DEST=${sq(wslWork)}`,
    // Control files move inside WSL too: any path Claude Code is handed (its settings file)
    // shows up as a folder chain in the sandbox's view, and /mnt/c should not.
    `CTL=${sq(`${WSL_CTL}/${opts.runId}`)}`,
    'rm -rf "$DEST" "$CTL" && mkdir -p "$(dirname "$DEST")" "$CTL"',
    `cp -r ${sq(host)} "$DEST"`,
    `cp ${sq(toWslPath(prompt))} "$CTL/prompt.txt" && cp ${sq(toWslPath(settings))} "$CTL/settings.json"`,
    'cd "$DEST"',
    // The prompt is read before launch so the file is gone while the agent runs; the settings
    // file has to stay, and Claude Code mounts it read-only for sandboxed commands.
    'PROMPT="$(cat "$CTL/prompt.txt")" && rm -f "$CTL/prompt.txt"',
    'set +e',
    // A clean environment: nothing from Windows on PATH, nothing inherited from the host.
    'env -i HOME="$HOME" USER="$USER" PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 TERM=dumb PYTHONDONTWRITEBYTECODE=1 \\',
    `  "$HOME/.local/bin/claude" -p "$PROMPT" --settings "$CTL/settings.json" ${opts.args.map(sq).join(' ')} < /dev/null`,
    'code=$?',
    'rm -rf "$CTL"',
    // Symlinks could point the host-side grader at files outside the workspace: drop them.
    'find "$DEST" -type l -printf "PG_SYMLINK %P -> %l\\n" >&2',
    'find "$DEST" -type l -delete',
    `rm -rf ${sq(host)} && cp -r "$DEST" ${sq(host)} && rm -rf "$DEST"`,
    'exit $code',
    '',
  ].join('\n'));
  const p = await run('wsl.exe', ['-d', DISTRO, '--', 'bash', toWslPath(script)], opts.hostWork.replace(/[\\/][^\\/]+$/, ''), opts.timeoutMs, opts.onStdout);
  const symlinks = [...p.stderr.matchAll(/^PG_SYMLINK (.*)$/gm)].map((m) => m[1]);
  return { ...p, wslWork, symlinks };
}
