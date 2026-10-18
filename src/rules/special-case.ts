// Production code shaped around the test suite instead of the spec.
import { assertionRe, isCode, isTestFile, langOf, SUPPRESSION, TEST_ENV_SNIFF, TEST_TALK, testNames } from '../lang.ts';
import type { Finding, Rule } from '../types.ts';

const trimmed = (s: string) => s.trim().slice(0, 200);

// Numbers too common to mean anything when they show up in both code and tests.
const TRIVIAL = new Set(['0', '1', '2', '3', '4', '5', '10', '100', '1000', '0.5', '1.0', '0.0', '2.0']);
const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;
const numbersIn = (s: string) => [...s.matchAll(NUMBER)].map((m) => m[0].replace(/^-/, ''));
// Numbers in code position only: string literals and trailing comments removed.
const STRINGS = /(['"`])(?:\\.|(?!\1).)*\1/g;
const codeNumbersIn = (s: string) => numbersIn(s.replace(STRINGS, ' ').replace(/(#|\/\/).*$/, ''));

export const specialCase: Rule = async (ctx) => {
  const out: Finding[] = [];
  const code = ctx.changes.filter((c) => isCode(c.path) && !isTestFile(c.path) && c.status !== 'D');
  if (!code.length) return out;
  const tests = await ctx.testFiles();

  // Every test name, and every number a pre-existing test uses in code position. Tests written
  // in this same change are left out: code and tests written together legitimately share values;
  // the gaming pattern is code bent to fit an expectation that was already there.
  // Only assertion lines count, and only in tests that import the changed module, so a value
  // shared by coincidence with an unrelated test is not mistaken for a copied expectation.
  // A value asserted all over the suite (a schema version, a common threshold) is shared by
  // design; a copied expectation is specific to one or two assertions.
  const changedPaths = new Set(ctx.changes.map((c) => c.path));
  const names = new Set<string>();
  const testNumbers: Array<{ path: string; imports: string; numbers: Map<string, string> }> = [];
  const uses = new Map<string, number>();
  for (const [path, text] of tests) {
    const lang = langOf(path);
    // Test function identifiers only (test_launch_burst, TestParse); prose titles of JS tests
    // collide with ordinary text too easily.
    for (const n of testNames(text, lang)) if (n.length >= 8 && /^(test|Test)\w+$/.test(n)) names.add(n);
    const asserts = assertionRe(lang);
    const numbers = new Map<string, string>();
    text.split('\n').forEach((line, i) => {
      if (!asserts?.test(line)) return;
      for (const num of codeNumbersIn(line)) {
        uses.set(num, (uses.get(num) ?? 0) + 1);
        if (!numbers.has(num)) numbers.set(num, `${path}:${i + 1}: ${trimmed(line)}`);
      }
    });
    if (changedPaths.has(path)) continue;
    const imports = text.split('\n').filter((l) => /^\s*(import|from)\b|\brequire\s*\(|\buse\s/.test(l)).join('\n');
    if (numbers.size) testNumbers.push({ path, imports, numbers });
  }
  const GENERIC = new Set(['src', 'lib', 'app', 'index', 'main', 'utils', 'util', 'common', 'core', 'pkg', 'internal', 'test', 'tests']);
  const testUsing = (codePath: string, num: string): string | undefined => {
    const parts = codePath.replace(/\.[^./]+$/, '').split('/').filter((p) => p.length >= 3 && !GENERIC.has(p.toLowerCase()));
    for (const t of testNumbers) {
      const where = t.numbers.get(num);
      if (where && parts.some((p) => new RegExp(`\\b${p.replace(/[^\w]/g, '\\$&')}\\b`).test(t.imports))) return where;
    }
    return undefined;
  };
  // Numbers the changed code already used before this change.
  const known = new Set<string>();
  for (const c of ctx.changes) if (c.before) for (const num of numbersIn(c.before)) known.add(num);

  for (const c of code) {
    const reported = new Set<string>();
    for (const l of c.added) {
      if (TEST_ENV_SNIFF.test(l.text)) {
        out.push({
          rule: 'test-env-sniffing', level: 'block', file: c.path, line: l.n,
          message: `${c.path}:${l.n} changes behaviour when it detects a test runner.`,
          evidence: [trimmed(l.text)],
          fingerprint: `test-env-sniffing:${c.path}:${l.text.trim()}`,
        });
        continue;
      }
      if (TEST_TALK.test(l.text)) {
        out.push({
          rule: 'test-referenced-in-code', level: 'challenge', file: c.path, line: l.n,
          message: `${c.path}:${l.n} justifies production code by what the tests expect.`,
          evidence: [trimmed(l.text)],
          fingerprint: `test-referenced-in-code:${c.path}:${l.text.trim()}`,
        });
      }
      for (const name of names) {
        if (!l.text.includes(name) || reported.has(`name:${name}`)) continue;
        reported.add(`name:${name}`);
        out.push({
          rule: 'test-name-in-code', level: 'challenge', file: c.path, line: l.n,
          message: `${c.path}:${l.n} mentions the test "${name}".`,
          evidence: [trimmed(l.text)],
          fingerprint: `test-name-in-code:${c.path}:${name}`,
        });
      }
      for (const num of codeNumbersIn(l.text)) {
        if (TRIVIAL.has(num) || known.has(num) || reported.has(`num:${num}`) || (uses.get(num) ?? 0) > 2) continue;
        const where = testUsing(c.path, num);
        if (!where) continue;
        reported.add(`num:${num}`);
        out.push({
          rule: 'literal-from-test', level: 'challenge', file: c.path, line: l.n,
          message: `${c.path}:${l.n} introduces the constant ${num}, which also appears in the tests. Is it derived from the spec, or copied from a test's expectation?`,
          evidence: [trimmed(l.text), `test: ${where}`],
          fingerprint: `literal-from-test:${c.path}:${num}`,
        });
      }
      if (SUPPRESSION.test(l.text) && !c.removed.some((r) => r.text.trim() === l.text.trim())) {
        out.push({
          rule: 'suppression-added', level: 'info', file: c.path, line: l.n,
          message: `${c.path}:${l.n} silences a checker.`,
          evidence: [trimmed(l.text)],
          fingerprint: `suppression-added:${c.path}:${l.text.trim()}`,
        });
      }
    }
  }
  return out;
};
