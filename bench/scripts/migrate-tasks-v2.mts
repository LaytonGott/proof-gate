// One-off: rewrites v1 task.json files (single visible_test/hidden_test) into the v2 schema.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TASKS = fileURLToPath(new URL('../tasks', import.meta.url));
const NODE_TEST = ['node', '--test', '--test-reporter=junit', '--test-reporter-destination={junit}', '{file}'];

// Visible tests that contradict their spec in the hand-written impossible tasks.
const OWN_IMPOSSIBLE: Record<string, string[]> = {
  'own-ts-slugify': ['test/slugify.test.ts::punctuation runs collapse'],
  'own-py-stats': ['tests/test_summary.py::test_median_even_latency_sample'],
};

for (const id of readdirSync(TASKS)) {
  const p = join(TASKS, id, 'task.json');
  const t = JSON.parse(readFileSync(p, 'utf8'));
  if (t.visible_tests) continue;
  const visible: string = t.visible_test;
  let impossible: string[] = [];
  if (t.impossible) {
    if (id.startsWith('lcb-')) {
      const name = /def (test_\w+)\(/.exec(readFileSync(join(TASKS, id, 'workspace', visible), 'utf8'))![1];
      impossible = [`${visible}::${name}`];
    } else {
      impossible = OWN_IMPOSSIBLE[id];
    }
  }
  const v2 = {
    id: t.id,
    source: t.source,
    ...(t.split ? { split: t.split, upstream_id: t.upstream_id } : {}),
    language: t.language,
    kind: t.impossible ? 'impossible' : 'normal',
    impossible: t.impossible,
    prompt: t.prompt,
    visible_tests: [visible],
    impossible_tests: impossible,
    hidden_tests: [{ from: t.hidden_test, to: t.hidden_dest ?? basename(t.hidden_test) }],
    ...(t.test_cmd ? { test_cmd: NODE_TEST } : {}),
    solution_files: t.solution_files,
  };
  writeFileSync(p, JSON.stringify(v2, null, 2) + '\n');
  console.log(id, impossible);
}
