// Changes to how tests are run or counted, rather than to the tests themselves.
import { isTestConfig } from '../lang.ts';
import type { Finding, Rule } from '../types.ts';

const trimmed = (s: string) => s.trim().slice(0, 200);

// Added lines that make a test or CI step unable to fail, or that drop tests from the run.
// `checkStep`: only counts when the command it applies to runs tests or checks; `|| true` on
// a release upload or a curl ping is ordinary scripting.
const NEUTERING = [
  { re: /\|\|\s*(true|:|exit\s+0)\b/, what: 'forces the command to succeed', checkStep: true },
  { re: /--passWithNoTests\b/, what: 'lets an empty test run pass', checkStep: false },
  { re: /\bcontinue-on-error:\s*true\b/, what: 'lets a CI step fail silently', checkStep: true },
  { re: /\b(testPathIgnorePatterns|modulePathIgnorePatterns|coveragePathIgnorePatterns|collect_ignore(_glob)?|norecursedirs)\b/, what: 'excludes files from the test run or coverage', checkStep: false },
  { re: /--(deselect|ignore-glob|ignore)(=|\s)|\baddopts\b.*(\s-k\s|--deselect|--ignore|-p\s*no:)/, what: 'deselects tests', checkStep: true },
  { re: /\bpytest_collection_modifyitems\b|\bpytest_ignore_collect\b/, what: 'rewrites which tests are collected', checkStep: false },
  { re: /\bomit\s*=|\bexclude_lines\b/, what: 'excludes code from coverage', checkStep: false },
];
const CHECK_COMMAND = /\b(test|tests|pytest|jest|vitest|mocha|ava|tap|tsc|typecheck|lint|eslint|ruff|mypy|pyright|flake8|coverage|cov|check|verify|cargo test|go test|go vet|clippy|tox|nox)\b/i;

/** Whether line n (1-based) of a file belongs to a command or CI step that runs tests or checks. */
const inCheckStep = (lines: string[], n: number): boolean => {
  if (CHECK_COMMAND.test(lines[n - 1] ?? '')) return true;
  // YAML step: look back to the start of the step ("- name:" / "- run:").
  for (let i = n - 2; i >= Math.max(0, n - 8); i--) {
    if (CHECK_COMMAND.test(lines[i])) return true;
    if (/^\s*-\s/.test(lines[i])) break;
  }
  return false;
};

const THRESHOLD = /\b(fail_under|fail-under|cov-fail-under|coverageThreshold|branches|lines|functions|statements|threshold|minimum_coverage|min-coverage)\b\D{0,12}(\d+(?:\.\d+)?)/i;

const testScript = (text: string | null): string | undefined => {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text)?.scripts?.test;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
};

export const testConfig: Rule = (ctx) => {
  const out: Finding[] = [];
  for (const c of ctx.changes) {
    if (!isTestConfig(c.path)) continue;

    const afterLines = (c.after ?? '').split('\n');
    for (const l of c.added) {
      for (const { re, what, checkStep } of NEUTERING) {
        if (!re.test(l.text) || c.removed.some((r) => r.text.trim() === l.text.trim())) continue;
        if (checkStep && !inCheckStep(afterLines, l.n)) continue;
        out.push({
          rule: 'test-run-neutered', level: 'block', file: c.path, line: l.n,
          message: `${c.path}:${l.n} ${what}.`,
          evidence: [trimmed(l.text)],
          fingerprint: `test-run-neutered:${c.path}:${l.text.trim()}`,
        });
        break;
      }
    }

    // A threshold whose number went down.
    for (const hunk of c.replaced) {
      for (const r of hunk.removed) {
        const was = THRESHOLD.exec(r.text);
        if (!was) continue;
        const now = hunk.added.map((a) => THRESHOLD.exec(a.text)).find((m) => m && m[1].toLowerCase() === was[1].toLowerCase());
        if (now && Number(now[2]) < Number(was[2])) {
          out.push({
            rule: 'threshold-lowered', level: 'block', file: c.path,
            message: `Lowered ${was[1]} in ${c.path} from ${was[2]} to ${now[2]}.`,
            evidence: [`- ${trimmed(r.text)}`],
            fingerprint: `threshold-lowered:${c.path}:${was[1]}:${was[2]}->${now[2]}`,
          });
        }
      }
    }

    if (/(^|\/)package\.json$/.test(c.path)) {
      const was = testScript(c.before);
      const now = testScript(c.after);
      // Appending test files to the command only widens what runs: not worth stopping for.
      const onlyAddsTests = was !== undefined && now !== undefined && now.startsWith(was)
        && /^(\s+[\w./\\-]*\.(test|spec)\.[cm]?[jt]sx?|\s+[\w./\\-]*test_[\w-]*\.py|\s+[\w./\\-]*_test\.(py|go))+\s*$/.test(now.slice(was.length));
      if (was !== undefined && was !== now && !onlyAddsTests) {
        out.push({
          rule: 'test-script-changed', level: 'challenge', file: c.path,
          message: `Changed the "test" script in ${c.path}.`,
          evidence: [`- ${was}`, `+ ${now ?? '(removed)'}`],
          fingerprint: `test-script-changed:${c.path}:${was}->${now}`,
        });
      }
    }

    if (/(^|\/)conftest\.py$/.test(c.path) && !out.some((f) => f.file === c.path)) {
      out.push({
        rule: 'test-harness-changed', level: 'challenge', file: c.path,
        message: c.status === 'A' ? `Added a pytest conftest at ${c.path}.` : `Changed the pytest conftest ${c.path}.`,
        evidence: c.added.slice(0, 6).map((l) => `+${l.n}: ${trimmed(l.text)}`),
        fingerprint: `test-harness-changed:${c.path}:${c.added.map((l) => l.text.trim()).join('|')}`,
      });
    }
  }
  return out;
};
