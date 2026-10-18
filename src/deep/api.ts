// API-break detection: public functions and classes a change removed or made harder to call,
// and the call sites elsewhere in the repo that still use the old form.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCode, langOf } from '../lang.ts';
import type { FileChange, Finding } from '../types.ts';

type Param = { name: string; kind: 'pos' | 'kwonly' | 'var' | 'varkw'; default: boolean };
export type Symbol = { name: string; kind: string; params: Param[] };

const PG_API = fileURLToPath(new URL('pg_api.py', import.meta.url));

function pythonSymbols(files: Record<string, string>): Record<string, Symbol[]> {
  if (!Object.keys(files).length) return {};
  for (const py of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(py, ['-I', PG_API], { input: JSON.stringify({ files }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0) {
      try {
        return JSON.parse(r.stdout);
      } catch {
        return {};
      }
    }
  }
  return {};
}

/** Splits a parameter or argument list on top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', quote = '';
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
    if ('([{<'.includes(ch)) depth++;
    if (')]}>'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

const jsParams = (list: string): Param[] => splitTop(list).map((p) => {
  if (p.startsWith('...')) return { name: p.slice(3).split(/[:=]/)[0].trim(), kind: 'var', default: true };
  const name = p.replace(/^\{.*\}|^\[.*\]/, '_destructured').split(/[?:=]/)[0].trim();
  return { name, kind: 'pos', default: /^[^:=]*\?|=/.test(p) };
});

/** Exported functions, arrow functions and classes of a JS/TS module. */
export function jsSymbols(text: string): Symbol[] {
  const out: Symbol[] = [];
  for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/gm)) out.push({ name: m[1], kind: 'function', params: jsParams(m[2]) });
  for (const m of text.matchAll(/^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:<[^>]*>\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?=>/gm)) out.push({ name: m[1], kind: 'function', params: jsParams(m[2]) });
  for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/gm)) out.push({ name: m[1], kind: 'class', params: [] });
  for (const m of text.matchAll(/^export\s+(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=(?!\s*(?:async\s+)?(?:<[^>]*>\s*)?\()/gm)) out.push({ name: m[1], kind: 'value', params: [] });
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.split(/\s+as\s+/).pop()!.trim();
      if (name && !out.some((s) => s.name === name)) out.push({ name, kind: 'value', params: [] });
    }
  }
  return out;
}

const required = (s: Symbol) => s.params.filter((p) => p.kind === 'pos' && !p.default).length;

const SKIP_DIR = /^(\.git|node_modules|__pycache__|\.venv|venv|dist|build|\.next|coverage)$/;
function* sourceFiles(root: string, dir = root): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.test(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* sourceFiles(root, p);
    else if (isCode(name) && st.size < 512 * 1024) yield relative(root, p).replace(/\\/g, '/');
  }
}

type Site = { file: string; line: number; text: string; args: number | null; keywords: string[] };

/** Calls of `name` across the tree (other than in `exceptFile`), with argument counts when on one line. */
function callSites(root: string, name: string, lang: 'py' | 'js', exceptFile: string, cache: Map<string, string>): Site[] {
  const short = name.split('.').pop()!;
  const call = new RegExp(`(?<![\\w])${short}\\s*\\(`, 'g');
  const out: Site[] = [];
  for (const f of sourceFiles(root)) {
    if (f === exceptFile || langOf(f) !== lang) continue;
    const text = cache.get(f) ?? readFileSync(join(root, f), 'utf8');
    cache.set(f, text);
    if (!text.includes(short)) continue;
    text.split('\n').forEach((line, i) => {
      if (/^\s*(def|class|function|export\s+(async\s+)?function)\b/.test(line)) return;
      for (const m of line.matchAll(call)) {
        // The argument list, when it closes on the same line.
        let depth = 0, j = m.index! + m[0].length - 1, end = -1;
        for (; j < line.length; j++) {
          if (line[j] === '(') depth++;
          else if (line[j] === ')' && --depth === 0) { end = j; break; }
        }
        const inner = end > 0 ? line.slice(m.index! + m[0].length, end) : null;
        const args = inner === null ? null : splitTop(inner);
        const spread = args?.some((a) => /^\*|^\.\.\./.test(a));
        out.push({
          file: f, line: i + 1, text: line.trim().slice(0, 140),
          args: args && !spread ? args.filter((a) => !/^\w+\s*=(?!=)/.test(a)).length : null,
          keywords: (args ?? []).map((a) => /^(\w+)\s*=(?!=)/.exec(a)?.[1]).filter((k): k is string => !!k),
        });
      }
    });
  }
  return out;
}

/** References to `name` anywhere in the tree other than its own file (imports included). */
function references(root: string, name: string, lang: 'py' | 'js', exceptFile: string, cache: Map<string, string>): Site[] {
  const short = name.split('.').pop()!;
  const re = new RegExp(`(?<![\\w])${short}(?![\\w])`);
  const out: Site[] = [];
  for (const f of sourceFiles(root)) {
    if (f === exceptFile || langOf(f) !== lang) continue;
    const text = cache.get(f) ?? readFileSync(join(root, f), 'utf8');
    cache.set(f, text);
    if (!text.includes(short)) continue;
    text.split('\n').forEach((line, i) => {
      if (re.test(line) && !/^\s*(#|\/\/)/.test(line)) out.push({ file: f, line: i + 1, text: line.trim().slice(0, 140), args: null, keywords: [] });
    });
  }
  return out;
}

/** API breaks in `changes`, checked against the code in `root` (the state under review). */
export function apiBreaks(root: string, changes: FileChange[]): Finding[] {
  const findings: Finding[] = [];
  const modified = changes.filter((c) => c.status !== 'A' && isCode(c.path) && ['py', 'js'].includes(langOf(c.path)));
  if (!modified.length) return findings;
  const pyBefore = pythonSymbols(Object.fromEntries(modified.filter((c) => langOf(c.path) === 'py').map((c) => [c.path, c.before ?? ''])));
  // After-state of every Python file the change touched, added ones included (a function may
  // have moved into a new module).
  const pyAfter = pythonSymbols(Object.fromEntries(changes.filter((c) => langOf(c.path) === 'py' && c.after !== null).map((c) => [c.path, c.after!])));
  // Symbols that exist anywhere after the change, so a function moved between files is not "removed".
  const everywhereAfter = new Set<string>();
  for (const c of changes) {
    if (c.after === null) continue;
    const syms = langOf(c.path) === 'py' ? pyAfter[c.path] ?? [] : langOf(c.path) === 'js' ? jsSymbols(c.after) : [];
    for (const s of syms) everywhereAfter.add(s.name);
  }
  const cache = new Map<string, string>();

  for (const c of modified) {
    const lang = langOf(c.path) as 'py' | 'js';
    const before = lang === 'py' ? pyBefore[c.path] ?? [] : jsSymbols(c.before ?? '');
    const after = c.after === null ? [] : lang === 'py' ? pyAfter[c.path] ?? [] : jsSymbols(c.after);
    if (lang === 'py' && c.after !== null && !(c.path in pyAfter)) continue; // did not parse: other tools will say so
    const afterByName = new Map(after.map((s) => [s.name, s]));

    for (const old of before) {
      const now = afterByName.get(old.name);
      if (!now) {
        if (everywhereAfter.has(old.name)) continue;
        const refs = references(root, old.name, lang, c.path, cache);
        findings.push(refs.length
          ? {
            rule: 'api-removed-still-used', level: 'block', file: c.path,
            message: `${old.name} was removed from ${c.path}, but ${refs.length} place(s) elsewhere still use it.`,
            evidence: refs.slice(0, 6).map((r) => `${r.file}:${r.line}: ${r.text}`),
            fingerprint: `api-removed-still-used:${c.path}:${old.name}`,
          }
          : {
            rule: 'public-api-removed', level: 'info', file: c.path,
            message: `${old.kind} ${old.name} was removed from ${c.path}; nothing in this repo uses it, but outside callers would break.`,
            evidence: [], fingerprint: `public-api-removed:${c.path}:${old.name}`,
          });
        continue;
      }
      if (old.kind === 'class' || old.kind === 'value') continue;
      const req = required(now);
      const gone = old.params.filter((p) => p.kind !== 'var' && p.kind !== 'varkw' && !now.params.some((q) => q.name === p.name));
      if (req <= required(old) && !gone.length) continue;
      const sites = callSites(root, old.name, lang, c.path, cache);
      const tooFew = sites.filter((s) => s.args !== null && s.args < req && !s.keywords.length);
      const staleKw = lang === 'py' ? sites.filter((s) => s.keywords.some((k) => gone.some((g) => g.name === k))) : [];
      const broken = [...new Set([...tooFew, ...staleKw])];
      const sig = (s: Symbol) => `${s.name}(${s.params.map((p) => `${p.kind === 'var' ? '*' : p.kind === 'varkw' ? '**' : ''}${p.name}${p.default ? '=…' : ''}`).join(', ')})`;
      if (broken.length) {
        findings.push({
          rule: 'call-sites-not-updated', level: 'block', file: c.path,
          message: `${sig(old)} became ${sig(now)}, but ${broken.length} call site(s) still use the old form.`,
          evidence: broken.slice(0, 6).map((s) => `${s.file}:${s.line}: ${s.text}`),
          fingerprint: `call-sites-not-updated:${c.path}:${old.name}:${broken.map((s) => `${s.file}:${s.line}`).join(',')}`,
        });
      } else if (sites.length || old.kind === 'function' || old.kind === 'method') {
        findings.push({
          rule: 'api-signature-changed', level: 'info', file: c.path,
          message: `${sig(old)} became ${sig(now)}${gone.length ? ` (removed: ${gone.map((g) => g.name).join(', ')})` : ''}; the ${sites.length} call site(s) in this repo look updated, outside callers would break.`,
          evidence: sites.slice(0, 4).map((s) => `${s.file}:${s.line}: ${s.text}`),
          fingerprint: `api-signature-changed:${c.path}:${old.name}:${sig(now)}`,
        });
      }
    }
  }
  return findings;
}
