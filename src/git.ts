// Git plumbing: snapshot the working tree (tracked + untracked, honouring .gitignore) as a
// tree object without touching the user's index, and read file contents back out of trees.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileChange } from './changes.ts';
import { isTestFile } from './lang.ts';
import type { FileChange } from './types.ts';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TEST_BYTES = 32 * 1024 * 1024;

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout;
}

export type Repo = { root: string; gitDir: string; stateDir: string };

export function findRepo(cwd: string): Repo | null {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel', '--absolute-git-dir'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [root, gitDir] = r.stdout.trim().split('\n');
  return { root, gitDir, stateDir: join(gitDir, 'proof-gate') };
}

/** Tree id of the working tree as it is right now. Leaves the real index untouched. */
export function snapshot(repo: Repo): string {
  mkdirSync(repo.stateDir, { recursive: true });
  const index = join(repo.stateDir, `index-${process.pid}`);
  const real = join(repo.gitDir, 'index');
  try {
    // Start from the real index so unchanged files are not re-hashed.
    if (existsSync(real)) copyFileSync(real, index);
    const env = { GIT_INDEX_FILE: index };
    git(repo.root, ['add', '-A', '--', '.'], env);
    return git(repo.root, ['write-tree'], env).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

export function headTree(repo: Repo): string | null {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD^{tree}'], { cwd: repo.root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// git's well-known empty tree, for repos with no commits yet.
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * The tree HEAD pointed at, at an earlier moment, from the reflog. A turn that commits its
 * work moves HEAD, so "the last commit" is no baseline for a repo first seen at the end of a
 * turn; where HEAD was when the turn began is. Null when the reflog cannot say.
 */
export function headTreeAt(repo: Repo, when: Date): string | null {
  // git's approxidate reads "YYYY-MM-DD HH:MM:SS +0000".
  const stamp = when.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' +0000');
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `HEAD@{${stamp}}^{tree}`], { cwd: repo.root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Writes the files of `tree` into `dir` (which must not exist yet), without touching the
 * repo's index or working tree. Links the repo's node_modules in, so JS test runners resolve.
 */
/**
 * Removes the node_modules link from a materialized folder before the folder is deleted, so a
 * recursive delete can never walk into the repo's real node_modules.
 */
export function disposeMaterialized(dir: string): void {
  const link = join(dir, 'node_modules');
  try {
    if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
  } catch {
    // Not there: nothing to unlink.
  }
}

export function materialize(repo: Repo, tree: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  mkdirSync(repo.stateDir, { recursive: true });
  const index = join(repo.stateDir, `index-mat-${process.pid}-${Date.now()}`);
  try {
    const env = { GIT_INDEX_FILE: index };
    git(repo.root, ['read-tree', tree], env);
    git(repo.root, ['checkout-index', '-a', '-f', `--prefix=${dir.replace(/\\/g, '/').replace(/\/?$/, '/')}`], env);
  } finally {
    rmSync(index, { force: true });
  }
  const modules = join(repo.root, 'node_modules');
  if (existsSync(modules) && !existsSync(join(dir, 'node_modules'))) {
    symlinkSync(modules, join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  }
}

function readBlobs(repo: Repo, specs: string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (!specs.length) return out;
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: repo.root, input: specs.join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024 });
  const buf = r.stdout;
  let pos = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(10, pos);
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    const m = /^\S+ (\w+) (\d+)$/.exec(header);
    if (!m) { out.set(spec, null); continue; } // "<spec> missing"
    const size = Number(m[2]);
    const body = buf.subarray(pos, pos + size);
    pos += size + 1;
    // Skip binaries and huge files: no rule reads them.
    out.set(spec, size > MAX_FILE_BYTES || body.includes(0) ? null : body.toString('utf8'));
  }
  return out;
}

/** Line-level changes from tree `a` to tree `b`. Binary and huge files are skipped. */
export function changesBetween(repo: Repo, a: string, b: string): FileChange[] {
  const lines = git(repo.root, ['diff-tree', '-r', '--no-renames', '--name-status', '-z', a, b]).split('\0').filter(Boolean);
  const entries: Array<{ status: string; path: string }> = [];
  for (let i = 0; i < lines.length; i += 2) entries.push({ status: lines[i], path: lines[i + 1] });
  const specs: string[] = [];
  for (const e of entries) {
    if (e.status !== 'A') specs.push(`${a}:${e.path}`);
    if (e.status !== 'D') specs.push(`${b}:${e.path}`);
  }
  const blobs = readBlobs(repo, specs);
  const out: FileChange[] = [];
  for (const e of entries) {
    const before = e.status === 'A' ? null : blobs.get(`${a}:${e.path}`) ?? null;
    const after = e.status === 'D' ? null : blobs.get(`${b}:${e.path}`) ?? null;
    if ((e.status !== 'A' && before === null) || (e.status !== 'D' && after === null)) continue;
    out.push(fileChange(e.path, before, after));
  }
  return out;
}

/** Every test file in a tree, path -> content. */
export function testFilesIn(repo: Repo, tree: string): Map<string, string> {
  const paths = git(repo.root, ['ls-tree', '-r', '--name-only', '-z', tree]).split('\0').filter((p) => p && isTestFile(p));
  const blobs = readBlobs(repo, paths.map((p) => `${tree}:${p}`));
  const out = new Map<string, string>();
  let total = 0;
  for (const p of paths) {
    const text = blobs.get(`${tree}:${p}`);
    if (text == null) continue;
    total += text.length;
    if (total > MAX_TEST_BYTES) break;
    out.set(p, text);
  }
  return out;
}
