// Turns before/after file contents into line-level changes. Self-contained (Myers diff) so
// the gate runs from a plugin folder with no install step.
import type { FileChange, Line } from './types.ts';

const splitLines = (s: string | null) => (s === null ? [] : s.replace(/\r\n/g, '\n').split('\n'));

type Op = { kind: 'same' | 'del' | 'add'; a: number; b: number }; // a/b: 0-based indexes

/** Myers O(ND) diff of two line arrays, as a sequence of same/del/add operations. */
export function diffLines(x: string[], y: string[]): Op[] {
  // Trim the common prefix and suffix first: most edits are small.
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const a = x.slice(pre, x.length - suf);
  const b = y.slice(pre, y.length - suf);

  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = n === 0 && m === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let i = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
      let j = i - k;
      while (i < n && j < m && a[i] === b[j]) { i++; j++; }
      v[max + k] = i;
      if (i >= n && j >= m) { found = true; break; }
    }
  }
  // Walk the trace backwards to recover the edit script.
  const mid: Op[] = [];
  let i = n, j = m;
  for (let d = trace.length - 1; d >= 0 && (i > 0 || j > 0); d--) {
    const vd = trace[d];
    const k = i - j;
    const prevK = k === -d || (k !== d && vd[max + k - 1] < vd[max + k + 1]) ? k + 1 : k - 1;
    const prevI = vd[max + prevK];
    const prevJ = prevI - prevK;
    while (i > prevI && j > prevJ) { i--; j--; mid.push({ kind: 'same', a: i, b: j }); }
    if (d === 0) break;
    if (i === prevI) { j--; mid.push({ kind: 'add', a: i, b: j }); }
    else { i--; mid.push({ kind: 'del', a: i, b: j }); }
  }
  while (i > 0 && j > 0) { i--; j--; mid.push({ kind: 'same', a: i, b: j }); }
  while (i > 0) { i--; mid.push({ kind: 'del', a: i, b: j }); }
  while (j > 0) { j--; mid.push({ kind: 'add', a: i, b: j }); }
  mid.reverse();

  const ops: Op[] = [];
  for (let p = 0; p < pre; p++) ops.push({ kind: 'same', a: p, b: p });
  for (const op of mid) ops.push({ kind: op.kind, a: op.a + pre, b: op.b + pre });
  for (let s = 0; s < suf; s++) ops.push({ kind: 'same', a: x.length - suf + s, b: y.length - suf + s });
  return ops;
}

export function fileChange(path: string, before: string | null, after: string | null): FileChange {
  const status = before === null ? 'A' : after === null ? 'D' : 'M';
  const x = splitLines(before);
  const y = splitLines(after);
  const added: Line[] = [];
  const removed: Line[] = [];
  const replaced: FileChange['replaced'] = [];
  let run: { removed: Line[]; added: Line[] } | null = null;
  const flush = () => {
    if (run && run.removed.length && run.added.length) replaced.push(run);
    run = null;
  };
  for (const op of diffLines(x, y)) {
    if (op.kind === 'same') { flush(); continue; }
    run ??= { removed: [], added: [] };
    if (op.kind === 'del') {
      // A deletion after additions starts a new hunk.
      if (run.added.length) { flush(); run = { removed: [], added: [] }; }
      const l = { n: op.a + 1, text: x[op.a] };
      removed.push(l);
      run.removed.push(l);
    } else {
      const l = { n: op.b + 1, text: y[op.b] };
      added.push(l);
      run.added.push(l);
    }
  }
  flush();
  return { path, status, before, after, added, removed, replaced };
}

/** Builds changes from two path->content maps. Unchanged files are skipped. */
export function changesFromMaps(before: Map<string, string>, after: Map<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const x = before.get(path) ?? null;
    const y = after.get(path) ?? null;
    if (x !== y) out.push(fileChange(path, x, y));
  }
  return out.sort((p, q) => p.path.localeCompare(q.path));
}
