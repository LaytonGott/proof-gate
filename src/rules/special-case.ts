// Production code shaped around the test suite instead of the spec.
import { assertionRe, importLines, importsModule, isCode, isTestFile, langOf, SUPPRESSION, TEST_ENV_SNIFF, TEST_TALK, testNames } from '../lang.ts';
import type { Finding, Rule } from '../types.ts';

const trimmed = (s: string) => s.trim().slice(0, 200);

// Numbers too common to mean anything when they show up in both code and tests.
const TRIVIAL = new Set(['0', '1', '2', '3', '4', '5', '10', '100', '1000', '0.5', '1.0', '0.0', '2.0']);
const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;
const numbersIn = (s: string) => [...s.matchAll(NUMBER)].map((m) => m[0].replace(/^-/, ''));
// Numbers in code position only: string literals and trailing comments removed.
const STRINGS = /(['"`])(?:\\.|(?!\1).)*\1/g;
const codeNumbersIn = (s: string) => numbersIn(s.replace(STRINGS, ' ').replace(/(#|\/\/).*$/, ''));

// The comment part of a line ("# ...", "// ...", "/* ...", " * ..."), or ''.
const commentOf = (line: string) => /(?:#|\/\/|\/\*+|^\s*\*)\s*(.*)$/.exec(line)?.[1] ?? '';
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'are', 'was', 'but', 'not', 'must',
  'should', 'can', 'will', 'when', 'then', 'than', 'its', 'has', 'have', 'all', 'any', 'our', 'your', 'use', 'uses',
  'used', 'only', 'also', 'here', 'there', 'they', 'them', 'which', 'what', 'would', 'could', 'does', 'did', 'been',
  'being', 'each', 'every', 'more', 'most', 'some', 'such', 'just', 'like', 'test', 'tests', 'todo', 'note', 'see']);
/** Consecutive pairs of content words, so shared phrasing survives small rewordings. */
const bigrams = (text: string): string[] => {
  const words = (text.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? []).filter((w) => !STOP.has(w));
  const out = new Set<string>();
  for (let i = 0; i + 1 < words.length; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return [...out];
};

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
    const imports = importLines(text);
    if (numbers.size) testNumbers.push({ path, imports, numbers });
  }
  const testUsing = (codePath: string, num: string): string | undefined => {
    for (const t of testNumbers) {
      const where = t.numbers.get(num);
      if (where && importsModule(t.imports, codePath)) return where;
    }
    return undefined;
  };
  // Numbers the changed code already used before this change.
  const known = new Set<string>();
  for (const c of ctx.changes) if (c.before) for (const num of numbersIn(c.before)) known.add(num);

  // Rationale lifted from a test's comments: word pairs from existing tests' comments that the
  // changed code never used before ("deploy pipeline", "slot port").
  // Kept per comment line, with the test's imports, so a match must come from one specific test
  // comment in a test of the changed module, not from vocabulary scattered across the suite.
  const testRationale: Array<{ where: string; imports: string; pairs: Set<string> }> = [];
  for (const [path, text] of tests) {
    if (changedPaths.has(path)) continue;
    const imports = importLines(text);
    text.split('\n').forEach((line, i) => {
      const pairs = bigrams(commentOf(line));
      if (pairs.length >= 3) testRationale.push({ where: `${path}:${i + 1}: ${trimmed(line)}`, imports, pairs: new Set(pairs) });
    });
  }
  const knownPhrases = new Set<string>();
  for (const c of ctx.changes) if (c.before && !isTestFile(c.path)) for (const line of c.before.split('\n')) for (const bg of bigrams(line)) knownPhrases.add(bg);

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
      const mine = bigrams(commentOf(l.text)).filter((bg) => !knownPhrases.has(bg));
      if (mine.length >= 3 && !reported.has('rationale')) {
        for (const t of testRationale) {
          const shared = mine.filter((bg) => t.pairs.has(bg));
          // Three pairs from one comment, a third of the new comment: two happen by ordinary
          // vocabulary ("config file", "file disk").
          if (shared.length < 3 || shared.length < 0.3 * mine.length || !importsModule(t.imports, c.path)) continue;
          reported.add('rationale');
          out.push({
            rule: 'test-rationale-in-code', level: 'challenge', file: c.path, line: l.n,
            message: `${c.path}:${l.n} explains itself with the wording of an existing test's comment (${shared.map((s) => `"${s}"`).join(', ')}). Is the behaviour from the spec, or adopted from the test?`,
            evidence: [trimmed(l.text), `test: ${t.where}`],
            fingerprint: `test-rationale-in-code:${c.path}:${shared.join('|')}`,
          });
          break;
        }
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
