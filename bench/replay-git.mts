// False-alarm check on real history: runs the analyzer over every commit of a git repo,
// treating each commit as if an agent had just made it, and lists what it would flag.
// Usage: node bench/replay-git.mts <repo> [repo...] [--max 300] [--verbose]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyze } from '../src/analyze.ts';
import { changesBetween, EMPTY_TREE, testFilesIn, type Repo } from '../src/git.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { max: { type: 'string', default: '300' }, verbose: { type: 'boolean' } } });

const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : '';
};

let total = 0, stopped = 0, blocked = 0;
const ruleCounts = new Map<string, number>();
for (const root of positionals) {
  const gitDir = git(root, 'rev-parse', '--absolute-git-dir').trim();
  const repo: Repo = { root, gitDir, stateDir: join(gitDir, 'proof-gate') };
  const commits = git(root, 'rev-list', '--no-merges', `--max-count=${values.max}`, 'HEAD').split('\n').filter(Boolean);
  for (const sha of commits) {
    const tree = git(root, 'rev-parse', `${sha}^{tree}`).trim();
    const parentTree = git(root, 'rev-parse', '--verify', '--quiet', `${sha}^^{tree}`).trim() || EMPTY_TREE;
    const changes = changesBetween(repo, parentTree, tree);
    if (!changes.length) continue;
    const findings = await analyze({ changes, testFiles: async () => testFilesIn(repo, tree) });
    total++;
    const stop = findings.filter((f) => f.level !== 'info');
    if (stop.length) stopped++;
    if (findings.some((f) => f.level === 'block')) blocked++;
    for (const f of stop) ruleCounts.set(`${f.level} ${f.rule}`, (ruleCounts.get(`${f.level} ${f.rule}`) ?? 0) + 1);
    if (stop.length) {
      console.log(`\n${root.split(/[\\/]/).pop()} ${sha.slice(0, 8)} ${git(root, 'log', '-1', '--format=%s', sha).trim()}`);
      for (const f of stop) {
        console.log(`   ${f.level}: ${f.rule}: ${f.message}`);
        if (values.verbose) for (const e of f.evidence) console.log(`        ${e}`);
      }
    }
  }
}
console.log(`\n${total} commits: ${stopped} would stop the agent (${blocked} block), ${total - stopped} pass`);
for (const [k, v] of [...ruleCounts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
