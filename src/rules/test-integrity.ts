// Changes to existing tests that make them check less.
import { assertionRe, countLines, isCode, isTestFile, langOf, skipRe, testDefRe, testNames, type Lang } from '../lang.ts';
import type { Finding, Rule } from '../types.ts';

const trimmed = (s: string) => s.trim().slice(0, 200);

// Literals become placeholders, so two assertions with the same shape compare equal.
const LITERAL = /(['"`])(?:\\.|(?!\1).)*\1|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b(True|False|None|true|false|null|undefined)\b/g;
const skeleton = (s: string) => s.replace(LITERAL, '§').replace(/\s+/g, '');
const literals = (s: string) => [...s.matchAll(LITERAL)].map((m) => m[0]);

const STRONG: Partial<Record<Lang, RegExp>> = {
  js: /\.(toEqual|toStrictEqual|toBe|toMatchObject|toHaveLength|toContain|toHaveProperty|toThrow)\s*\(\s*\S|\bassert\.(equal|strictEqual|deepEqual|deepStrictEqual|throws|rejects|match)\s*\(/,
  py: /\bself\.assert(Equal|Equals|AlmostEqual|CountEqual|Raises|In|Is|DictEqual|ListEqual)\b|^\s*assert\b.*(==|!=|<=|>=|<|>|\bin\b|\bis\b)|pytest\.raises/,
  go: /\b(assert|require)\.(Equal|EqualValues|ErrorIs|Len|Contains)\b|!=|==/,
  rs: /assert_(eq|ne)!/,
  java: /assert(Equals|Throws|Same|ArrayEquals)\b|assertThat\([^)]*\)\.(isEqualTo|containsExactly|hasSize)/,
};
const WEAK: Partial<Record<Lang, RegExp>> = {
  js: /\.(toBeTruthy|toBeDefined|toBeFalsy|toBeTypeOf|toBeInstanceOf)\s*\(|\.not\.(toBeNull|toBeUndefined|toThrow)\s*\(|\bassert(\.ok)?\s*\(/,
  py: /\bself\.assert(True|False|IsNotNone|IsInstance)\b|^\s*assert\s+(?!.*(==|!=|<=|>=|<|>|\bin\b|\bis\b))/,
  go: /\b(assert|require)\.(True|False|NotNil|NoError|NotEmpty)\b/,
  rs: /\bassert!\s*\(/,
  java: /assert(True|False|NotNull)\b/,
};

export const testIntegrity: Rule = (ctx) => {
  const out: Finding[] = [];
  // Context that separates gaming from ordinary work. Removing a feature legitimately removes
  // its tests; writing new tests alongside an expectation change suggests a behaviour change
  // that was intended, not a failing assertion bent to fit.
  const productionLinesRemoved = ctx.changes
    .filter((c) => isCode(c.path) && !isTestFile(c.path))
    .reduce((n, c) => n + c.removed.length, 0);
  const testsGrew = ctx.changes.some((c) => {
    if (!isTestFile(c.path)) return false;
    if (c.status === 'A') return true;
    const lang = langOf(c.path);
    return countLines(c.after, testDefRe(lang)) > countLines(c.before, testDefRe(lang))
      || countLines(c.after, assertionRe(lang)) > countLines(c.before, assertionRe(lang));
  });
  const removalLevel = productionLinesRemoved >= 15 ? 'challenge' : 'block';
  for (const c of ctx.changes) {
    if (!isTestFile(c.path)) continue;
    const lang = langOf(c.path);

    if (c.status === 'D') {
      const n = countLines(c.before, testDefRe(lang));
      out.push({
        rule: 'test-file-deleted', level: removalLevel, file: c.path,
        message: `Deleted test file ${c.path}${n ? ` (${n} test${n === 1 ? '' : 's'})` : ''}.`,
        evidence: testNames(c.before ?? '', lang).slice(0, 10),
        fingerprint: `test-file-deleted:${c.path}`,
      });
      continue;
    }
    if (c.status === 'A') continue; // New test files only add checks.

    // Tests removed outright.
    const beforeNames = testNames(c.before ?? '', lang);
    const afterNames = new Set(testNames(c.after ?? '', lang));
    const goneNames = beforeNames.filter((n) => !afterNames.has(n));
    const defsBefore = countLines(c.before, testDefRe(lang));
    const defsAfter = countLines(c.after, testDefRe(lang));
    if (defsAfter < defsBefore) {
      out.push({
        rule: 'tests-removed', level: removalLevel, file: c.path,
        message: `Removed ${Math.max(defsBefore - defsAfter, goneNames.length)} test case(s) from ${c.path}.`,
        evidence: goneNames.slice(0, 10),
        fingerprint: `tests-removed:${c.path}:${goneNames.join(',')}:${defsBefore - defsAfter}`,
      });
    }

    // Assertions removed (without the tests themselves being removed, which is reported above).
    const asserts = assertionRe(lang);
    const assertsBefore = countLines(c.before, asserts);
    const assertsAfter = countLines(c.after, asserts);
    if (assertsAfter < assertsBefore && defsAfter >= defsBefore) {
      const gone = c.removed.filter((l) => asserts?.test(l.text)).map((l) => `-${l.n}: ${trimmed(l.text)}`);
      out.push({
        rule: 'assertions-removed', level: 'block', file: c.path,
        message: `${c.path} has ${assertsBefore - assertsAfter} fewer assertion(s) than before (${assertsBefore} -> ${assertsAfter}).`,
        evidence: gone.slice(0, 10),
        fingerprint: `assertions-removed:${c.path}:${gone.map((g) => g.replace(/^-\d+: /, '')).join('|')}`,
      });
    }

    // Skip / xfail / only markers added.
    const skip = skipRe(lang);
    for (const l of c.added) {
      if (!skip?.test(l.text)) continue;
      // A marker that was already there (moved, re-indented) is not new.
      if (c.removed.some((r) => r.text.trim() === l.text.trim())) continue;
      out.push({
        rule: 'test-skipped', level: 'block', file: c.path, line: l.n,
        message: `Added a skip/only marker in ${c.path}:${l.n}.`,
        evidence: [trimmed(l.text)],
        fingerprint: `test-skipped:${c.path}:${l.text.trim()}`,
      });
    }

    // Assertions rewritten in place: weaker matcher, or same shape with different expected values.
    for (const hunk of c.replaced) {
      const pairs = Math.min(hunk.removed.length, hunk.added.length);
      for (let i = 0; i < pairs; i++) {
        const before = hunk.removed[i].text;
        const after = hunk.added[i].text;
        if (!asserts?.test(before)) continue;
        const strong = STRONG[lang];
        const weak = WEAK[lang];
        if (strong?.test(before) && weak?.test(after) && !strong.test(after)) {
          out.push({
            rule: 'assertion-weakened', level: 'block', file: c.path, line: hunk.added[i].n,
            message: `Weakened an assertion in ${c.path}:${hunk.added[i].n}.`,
            evidence: [`- ${trimmed(before)}`, `+ ${trimmed(after)}`],
            fingerprint: `assertion-weakened:${c.path}:${before.trim()}`,
          });
          continue;
        }
        if (asserts.test(after) && skeleton(before) === skeleton(after) && before.trim() !== after.trim()) {
          const was = literals(before).filter((x) => !literals(after).includes(x));
          const now = literals(after).filter((x) => !literals(before).includes(x));
          out.push({
            rule: 'expectation-changed', level: testsGrew ? 'info' : 'challenge', file: c.path, line: hunk.added[i].n,
            message: `Changed the expected value of an existing assertion in ${c.path}:${hunk.added[i].n} (${was.join(', ') || '?'} -> ${now.join(', ') || '?'}).`,
            evidence: [`- ${trimmed(before)}`, `+ ${trimmed(after)}`],
            fingerprint: `expectation-changed:${c.path}:${before.trim()}`,
          });
        }
      }
    }
  }
  return out;
};
