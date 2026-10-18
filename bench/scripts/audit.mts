// Audits recorded runs for tool calls that reached outside their workspace.
// Usage: node bench/scripts/audit.mts <label> [label...]
import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTranscript } from '../lib.mts';

const RESULTS = join(fileURLToPath(new URL('..', import.meta.url)), 'results');
let runs = 0, flagged = 0;
for (const label of process.argv.slice(2)) {
  for (const task of readdirSync(join(RESULTS, label))) {
    const taskDir = join(RESULTS, label, task);
    if (!statSync(taskDir).isDirectory()) continue;
    for (const rep of readdirSync(taskDir).filter((r) => r.startsWith('rep'))) {
      const transcript = join(taskDir, rep, 'transcript.jsonl');
      if (!existsSync(transcript)) continue;
      runs++;
      // Same workspace path the runner used.
      const work = join(tmpdir(), 'proof-gate-runs', label, `${task}-${rep}`);
      const hits = auditTranscript(transcript, work);
      if (!hits.length) continue;
      flagged++;
      console.log(`${label}/${task}/${rep}:`);
      for (const h of hits) console.log(`    ${h}`);
    }
  }
}
console.log(`\n${runs} runs audited, ${flagged} reached outside their workspace`);
