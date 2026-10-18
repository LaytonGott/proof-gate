// Generates mutants of changed lines: small, behaviour-changing edits (a flipped comparison,
// swapped boolean operator, nudged constant, emptied return value). A mutant the tests do not
// notice marks behaviour the tests do not check. Line-local and textual, with strings and
// comments masked out, so it needs no parser and works on Python and JS/TS alike.
import type { Lang } from '../lang.ts';

export type Mutant = {
  file: string;
  line: number; // 1-based
  op: string;
  before: string; // the original line
  after: string; // the mutated line
};

// In JS a `/` starts a regex literal (not a division) after one of these, or a keyword.
const REGEX_PRECEDES = /(?:[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof|\bcase|\bin|\bof)\s*$/;

/** Per character of `text`: true where it is code, false inside strings, comments and regex literals. */
export function codeMask(text: string, lang: Lang): boolean[] {
  const mask = new Array<boolean>(text.length).fill(true);
  let i = 0;
  const off = (from: number, to: number) => { for (let k = from; k < Math.min(to, text.length); k++) mask[k] = false; };
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    const three = text.slice(i, i + 3);
    if (lang !== 'py' && ch === '/' && two !== '//' && two !== '/*' && REGEX_PRECEDES.test(text.slice(Math.max(0, i - 12), i).replace(/^.*\n/s, '') || '(')) {
      // A regex literal: to the closing unescaped `/` outside a character class, then flags.
      let j = i + 1, inClass = false;
      for (; j < text.length && text[j] !== '\n'; j++) {
        if (text[j] === '\\') { j++; continue; }
        if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        else if (text[j] === '/' && !inClass) break;
      }
      if (text[j] === '/') {
        j++;
        while (j < text.length && /[a-z]/.test(text[j])) j++;
        off(i, j);
        i = j;
        continue;
      }
      i++;
    } else if ((lang === 'py' && ch === '#') || (lang !== 'py' && two === '//')) {
      const end = text.indexOf('\n', i);
      off(i, end === -1 ? text.length : end);
      i = end === -1 ? text.length : end;
    } else if (lang !== 'py' && two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      off(i, stop);
      i = stop;
    } else if (lang === 'py' && (three === '"""' || three === "'''")) {
      const end = text.indexOf(three, i + 3);
      const stop = end === -1 ? text.length : end + 3;
      off(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'" || (lang !== 'py' && ch === '`')) {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j++;
        else if (text[j] === '\n' && ch !== '`') break;
        j++;
      }
      off(i, j + 1);
      i = j + 1;
    } else {
      i++;
    }
  }
  return mask;
}

type Op = { name: string; re: RegExp; to: (m: string) => string | null; langs: Lang[] };
const both: Lang[] = ['py', 'js'];
const OPS: Op[] = [
  { name: '=== -> !==', re: /===/g, to: () => '!==', langs: ['js'] },
  { name: '!== -> ===', re: /!==/g, to: () => '===', langs: ['js'] },
  { name: '== -> !=', re: /(?<![=!<>])==(?!=)/g, to: () => '!=', langs: both },
  { name: '!= -> ==', re: /!=(?!=)/g, to: () => '==', langs: both },
  { name: '<= -> <', re: / <= /g, to: () => ' < ', langs: both },
  { name: '>= -> >', re: / >= /g, to: () => ' > ', langs: both },
  { name: '< -> <=', re: / < /g, to: () => ' <= ', langs: both },
  { name: '> -> >=', re: / > /g, to: () => ' >= ', langs: both },
  { name: '+ -> -', re: / \+ /g, to: () => ' - ', langs: both },
  { name: '- -> +', re: / - /g, to: () => ' + ', langs: both },
  { name: '* -> /', re: / \* /g, to: () => ' / ', langs: both },
  { name: '/ -> *', re: / \/ /g, to: () => ' * ', langs: both },
  { name: 'and -> or', re: /\band\b/g, to: () => 'or', langs: ['py'] },
  { name: 'or -> and', re: /\bor\b/g, to: () => 'and', langs: ['py'] },
  { name: '&& -> ||', re: /&&/g, to: () => '||', langs: ['js'] },
  { name: '|| -> &&', re: /\|\|/g, to: () => '&&', langs: ['js'] },
  { name: 'drop not', re: /\bnot\s+/g, to: () => '', langs: ['py'] },
  { name: 'True -> False', re: /\bTrue\b/g, to: () => 'False', langs: ['py'] },
  { name: 'False -> True', re: /\bFalse\b/g, to: () => 'True', langs: ['py'] },
  { name: 'true -> false', re: /\btrue\b/g, to: () => 'false', langs: ['js'] },
  { name: 'false -> true', re: /\bfalse\b/g, to: () => 'true', langs: ['js'] },
  { name: 'n -> n+1', re: /(?<![\w.])\d+(?![\w.])/g, to: (m) => (m.length > 9 ? null : String(Number(m) + 1)), langs: both },
];

// Whole-line rewrites.
const RETURN_PY = /^(\s*)return\s+(?!None\s*$)(\S.*)$/;
const RETURN_JS = /^(\s*)return\s+(?!undefined\b|null\b)([^;]+);?\s*$/;
// Lines not worth mutating: imports, decorators, definitions' own lines, log calls.
const SKIP = /^\s*(import\b|from\s+\S+\s+import\b|export\s+\*|@|(async\s+)?def\s|class\s|(export\s+)?(default\s+)?(async\s+)?function\b|console\.|print\(|logger?\.|log\.)/;

/** Mutants of the given lines of `text`, at most `perLine` per line. */
export function mutantsFor(file: string, text: string, lang: Lang, lineNumbers: number[], perLine = 4): Mutant[] {
  if (lang !== 'py' && lang !== 'js') return [];
  const mask = codeMask(text, lang);
  const lines = text.split('\n');
  const starts: number[] = [];
  let o = 0;
  for (const l of lines) { starts.push(o); o += l.length + 1; }
  const out: Mutant[] = [];
  for (const n of [...new Set(lineNumbers)].sort((a, b) => a - b)) {
    const line = lines[n - 1];
    if (line === undefined || !line.trim() || SKIP.test(line)) continue;
    const isCode = (from: number, len: number) => { for (let k = 0; k < len; k++) if (!mask[starts[n - 1] + from + k]) return false; return true; };
    const found: Mutant[] = [];
    // The line without a trailing comment, for the whole-line rewrites.
    let codeEnd = line.length;
    for (let k = 0; k < line.length; k++) {
      if (!mask[starts[n - 1] + k] && (line.startsWith('#', k) || line.startsWith('//', k))) { codeEnd = k; break; }
    }
    const code = line.slice(0, codeEnd).trimEnd();
    const ret = (lang === 'py' ? RETURN_PY : RETURN_JS).exec(code);
    if (ret && isCode(ret[1].length, 6)) found.push({ file, line: n, op: 'empty return', before: line, after: `${ret[1]}return ${lang === 'py' ? 'None' : 'undefined;'}` });
    for (const op of OPS) {
      if (!op.langs.includes(lang)) continue;
      for (const m of line.matchAll(op.re)) {
        if (!isCode(m.index!, m[0].length)) continue;
        const rep = op.to(m[0]);
        if (rep === null) continue;
        found.push({ file, line: n, op: op.name, before: line, after: line.slice(0, m.index) + rep + line.slice(m.index! + m[0].length) });
      }
    }
    out.push(...found.slice(0, perLine));
  }
  return out;
}

/** At most `cap` mutants, spread across lines round-robin so every changed line gets a turn. */
export function spread(mutants: Mutant[], cap: number): Mutant[] {
  const byLine = new Map<string, Mutant[]>();
  for (const m of mutants) {
    const k = `${m.file}:${m.line}`;
    byLine.set(k, [...(byLine.get(k) ?? []), m]);
  }
  const queues = [...byLine.values()];
  const out: Mutant[] = [];
  for (let round = 0; out.length < cap && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && out.length < cap) out.push(q[round]);
  }
  return out;
}
