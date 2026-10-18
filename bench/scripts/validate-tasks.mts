// Checks every task. The untouched workspace must have at least one failing visible test.
// Where bench/reference/<task> exists, the reference applied on top must pass every visible
// test except the declared impossible ones (which must still fail), and every hidden test.
// Usage: node bench/scripts/validate-tasks.mts [task-id ...]
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite, type Task } from '../lib.mts';

const BENCH = fileURLToPath(new URL('..', import.meta.url));
const only = process.argv.slice(2);

let bad = 0;
for (const id of readdirSync(join(BENCH, 'tasks'))) {
  if (only.length && !only.includes(id)) continue;
  const taskDir = join(BENCH, 'tasks', id);
  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')) as Task;
  const junit = mkdtempSync(join(tmpdir(), 'pg-junit-'));
  const problems: string[] = [];

  const start = mkdtempSync(join(tmpdir(), 'pg-validate-'));
  cpSync(join(taskDir, 'workspace'), start, { recursive: true });
  const startSuite = await runSuite(task, start, task.visible_tests, junit);
  rmSync(start, { recursive: true, force: true });
  const startFailing = Object.entries(startSuite.tests).filter(([, s]) => s !== 'pass').map(([t]) => t);
  if (!startFailing.length) problems.push('nothing fails at start');
  for (const t of task.impossible_tests) if (!(t in startSuite.tests)) problems.push(`impossible test id not found: ${t}`);

  let detail = `start: ${Object.keys(startSuite.tests).length} tests, ${startFailing.length} failing, ${startSuite.proc.ms}ms`;
  const ref = join(BENCH, 'reference', id);
  if (existsSync(ref)) {
    const work = mkdtempSync(join(tmpdir(), 'pg-validate-'));
    cpSync(join(taskDir, 'workspace'), work, { recursive: true });
    cpSync(ref, work, { recursive: true });
    const end = await runSuite(task, work, task.visible_tests, junit);
    for (const h of task.hidden_tests) cpSync(join(taskDir, h.from), join(work, h.to));
    const hidden = await runSuite(task, work, task.hidden_tests.map((h) => h.to), junit);
    rmSync(work, { recursive: true, force: true });
    for (const [t, s] of Object.entries(end.tests)) {
      const shouldFail = task.impossible_tests.includes(t);
      if (shouldFail && s === 'pass') problems.push(`reference passes impossible test ${t}`);
      if (!shouldFail && s !== 'pass') problems.push(`reference fails visible ${t}`);
    }
    for (const [t, s] of Object.entries(hidden.tests)) if (s !== 'pass') problems.push(`reference fails hidden ${t}`);
    if (!Object.keys(hidden.tests).length) problems.push('no hidden tests ran');
    detail += `; reference: visible ${end.proc.ms}ms, hidden ${Object.keys(hidden.tests).length} tests ${hidden.proc.ms}ms`;
  }
  rmSync(junit, { recursive: true, force: true });
  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${id}: ${detail}${problems.length ? `\n       ${problems.join('\n       ')}` : ''}`);
}
process.exit(bad ? 1 : 0);
