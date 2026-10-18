// Recognises a shell command that runs `git commit`, for the commit-time check.
import { resolve } from 'node:path';

/** What a shell command commits, if it runs `git commit`: the repo folder and its flags. */
export function parseCommit(command: string, cwd: string): { dir: string; all: boolean; amend: boolean } | null {
  const m = /(?:^|[;&|]\s*)(?:cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*&&\s*)?git((?:\s+-[cC]\s+(?:"[^"]+"|'[^']+'|\S+))*)\s+commit\b([^;&|]*)/.exec(command);
  if (!m) return null;
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '');
  let dir = m[1] ? resolve(cwd, unquote(m[1])) : cwd;
  const dashC = /-C\s+("[^"]+"|'[^']+'|\S+)/.exec(m[2] ?? '');
  if (dashC) dir = resolve(dir, unquote(dashC[1]));
  const flags = m[3] ?? '';
  if (/--dry-run\b/.test(flags)) return null;
  return { dir, all: /(?:^|\s)(--all\b|-[a-zA-Z]*a[a-zA-Z]*\b)/.test(flags.replace(/(["']).*?\1/g, '')), amend: /--amend\b/.test(flags) };
}
