// Runs the commit-time deep tier on a repo's recent commits, as if each were being committed
// now, and reports what it would say and how long it takes.
// Usage: node bench/replay-deep-git.mts <repo> [--max 6] [--budget-s 180] [--verbose]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { deepCheck } from '../src/deep/index.ts';
import { EMPTY_TREE, type Repo } from '../src/git.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { max: { type: 'string', default: '6' }, 'budget-s': { type: 'string', default: '180' }, verbose: { type: 'boolean' } } });
const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();

const rules = new Map<string, number>();
let commits = 0, stopped = 0, totalMs = 0;
for (const root of positionals) {
  const gitDir = git(root, 'rev-parse', '--absolute-git-dir');
  const repo: Repo = { root, gitDir, stateDir: join(gitDir, 'proof-gate') };
  for (const sha of git(root, 'rev-list', '--no-merges', `--max-count=${values.max}`, 'HEAD').split('\n').filter(Boolean)) {
    const tree = git(root, 'rev-parse', `${sha}^{tree}`);
    const parent = git(root, 'rev-parse', '--verify', '--quiet', `${sha}^^{tree}`) || EMPTY_TREE;
    const t0 = Date.now();
    const { findings, quality } = await deepCheck(repo, parent, tree, { budgetMs: Number(values['budget-s']) * 1000, maxMutants: 20 });
    const ms = Date.now() - t0;
    totalMs += ms;
    commits++;
    const stop = findings.filter((f) => f.level !== 'info');
    if (stop.length) stopped++;
    for (const f of findings) rules.set(`${f.level} ${f.rule}`, (rules.get(`${f.level} ${f.rule}`) ?? 0) + 1);
    console.log(`\n${root.split(/[\\/]/).pop()} ${sha.slice(0, 8)} ${git(root, 'log', '-1', '--format=%s', sha).slice(0, 70)}  (${Math.round(ms / 1000)}s${quality?.mutants ? `, mutants ${quality.killed}/${quality.mutants}` : ''})`);
    for (const f of findings) {
      if (f.level === 'info' && !values.verbose) continue;
      console.log(`   ${f.level}: ${f.rule}: ${f.message}`);
      if (values.verbose) for (const e of f.evidence.slice(0, 4)) console.log(`        ${e}`);
    }
  }
}
console.log(`\n${commits} commits, ${stopped} would be stopped at commit, ${Math.round(totalMs / 1000 / Math.max(1, commits))}s each on average`);
for (const [k, v] of [...rules].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
