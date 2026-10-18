// Language knowledge: what a test file looks like, and the patterns rules match on.
// Line-oriented on purpose: it must work on any repo, instantly, with nothing installed.

export type Lang = 'py' | 'js' | 'go' | 'rs' | 'java' | 'rb' | 'other';

export function langOf(path: string): Lang {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  if (ext === 'py') return 'py';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'].includes(ext)) return 'js';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rs';
  if (['java', 'kt', 'kts', 'scala'].includes(ext)) return 'java';
  if (ext === 'rb') return 'rb';
  return 'other';
}

const CODE_EXT = /\.(py|[cm]?[jt]sx?|mts|cts|go|rs|java|kt|kts|scala|rb|cs|swift|php|c|cc|cpp|h|hpp)$/i;
export const isCode = (path: string) => CODE_EXT.test(path);

const TEST_PATH = [
  /(^|\/)(tests?|__tests__|specs?|testing)\//i,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go|rb)$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.(test|spec)\.(mts|cts)$/,
  /(Test|Tests|Spec)\.(java|kt|scala|cs)$/,
  /_spec\.rb$/,
];
export const isTestFile = (path: string) => isCode(path) && TEST_PATH.some((re) => re.test(path));

const TEST_CONFIG = [
  /(^|\/)conftest\.py$/,
  /(^|\/)(pytest|tox)\.ini$/,
  /(^|\/)setup\.cfg$/,
  /(^|\/)pyproject\.toml$/,
  /(^|\/)\.coveragerc$/,
  /(^|\/)(jest|vitest|vite|karma|playwright|cypress|ava|nyc|c8)\.config\.[a-z]+$/,
  /(^|\/)\.(mocharc|nycrc|c8rc)(\.[a-z]+)?$/,
  /(^|\/)package\.json$/,
  /(^|\/)Makefile$/,
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/,
  /(^|\/)\.gitlab-ci\.yml$/,
  /(^|\/)codecov\.ya?ml$/,
];
export const isTestConfig = (path: string) => TEST_CONFIG.some((re) => re.test(path));

// A line that defines a test case.
const TEST_DEF: Record<Lang, RegExp | null> = {
  py: /^\s*(async\s+)?def\s+test\w*\s*\(/,
  js: /(^|[^.\w])(test|it)(\.(skip|only|todo|fixme|concurrent|failing|each\s*\(.*?\)))*\s*\(\s*['"`]/,
  go: /^func\s+(Test|Benchmark|Fuzz)\w*\s*\(/,
  rs: /#\[(tokio::)?test\]/,
  java: /@(Test|ParameterizedTest)\b/,
  rb: /^\s*(it|test|specify)\s+['"]/,
  other: null,
};

// A line that asserts something.
const ASSERTION: Record<Lang, RegExp | null> = {
  py: /^\s*assert\b|\bself\.assert\w*\s*\(|\bpytest\.raises\s*\(|\bnp\.testing\.assert\w*\(/,
  js: /\bexpect\s*\(|\bassert(\.\w+)?\s*\(|\.should\b|\bt\.(is|not|deepEqual|true|false|throws|equal|ok|assert)\w*\s*\(/,
  go: /\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\b(assert|require)\.\w+\s*\(/,
  rs: /\b(debug_)?assert(_eq|_ne)?!\s*\(/,
  java: /\bassert(Equals|NotEquals|True|False|That|Throws|NotNull|Null|Same|ArrayEquals)\s*\(|\bassertThat\s*\(/,
  rb: /\b(expect|assert\w*)\b/,
  other: null,
};

// Markers that stop a test from running or from counting.
const SKIP: Record<Lang, RegExp | null> = {
  py: /@pytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail)\s*\(|@unittest\.(skip|skipIf|skipUnless|expectedFailure)\b|raise\s+(unittest\.)?SkipTest\b/,
  js: /\b(it|test|describe|suite|context)\.(skip|todo|only|fixme)\b|(^|[^.\w])x(it|test|describe)\s*\(|\{\s*(skip|todo|only)\s*:\s*(true|['"`])|\bt\.skip\s*\(/,
  go: /\bt\.(Skip|SkipNow|Skipf)\s*\(/,
  rs: /#\[ignore\b/,
  java: /@(Disabled|Ignore)\b/,
  rb: /\b(skip|pending|xit)\b/,
  other: null,
};

export const testDefRe = (lang: Lang) => TEST_DEF[lang];
export const assertionRe = (lang: Lang) => ASSERTION[lang];
export const skipRe = (lang: Lang) => SKIP[lang];

/** Count matches of a per-line pattern in a file. */
export function countLines(text: string | null, re: RegExp | null): number {
  if (!text || !re) return 0;
  let n = 0;
  for (const line of text.split('\n')) if (re.test(line)) n++;
  return n;
}

/** Names of the test cases defined in a file. */
export function testNames(text: string, lang: Lang): string[] {
  const out: string[] = [];
  const re = lang === 'py' ? /^\s*(?:async\s+)?def\s+(test\w*)\s*\(/gm
    : lang === 'go' ? /^func\s+((?:Test|Benchmark|Fuzz)\w*)\s*\(/gm
    : lang === 'js' ? /(?:^|[^.\w])(?:test|it)(?:\.(?:skip|only|todo|fixme|concurrent|failing))*\s*\(\s*(['"`])((?:(?!\1).){4,120})\1/gm
    : null;
  if (!re) return out;
  for (const m of text.matchAll(re)) out.push(lang === 'js' ? m[2] : m[1]);
  return out;
}

// Path parts too common to identify a module on their own.
const GENERIC = new Set(['src', 'lib', 'app', 'index', 'main', 'utils', 'util', 'common', 'core', 'pkg', 'internal', 'test', 'tests']);
const escapeRe = (s: string) => s.replace(/[^\w/]/g, '\\$&');

/** The import / require / use lines of a file, joined. */
export const importLines = (text: string) =>
  text.split('\n').filter((l) => /^\s*(import|from)\b|\brequire\s*\(|\buse\s/.test(l)).join('\n');

/** Whether a file's import lines (see importLines) refer to the module at `codePath`. */
export function importsModule(imports: string, codePath: string): boolean {
  const modulePath = codePath.replace(/\.[^./]+$/, '');
  const parts = modulePath.split('/').filter((p) => p.length >= 3 && !GENERIC.has(p.toLowerCase()));
  if (parts.some((p) => new RegExp(`\\b${escapeRe(p)}\\b`).test(imports))) return true;
  // src/index.ts and the like: only the path as a whole is distinctive.
  const tail = modulePath.split('/').slice(-2).join('/');
  return tail.includes('/') && new RegExp(`\\b${escapeRe(tail)}\\b`).test(imports);
}

// Comment or string text that ties a production value to what a test wants: "the tests
// expect 1 here", "to make the test pass". Ordinary testability notes ("exposed for tests")
// do not match.
export const TEST_TALK = /\btests? (expects?|wants?|requires?|demands?) (-?\d|['"`]|true\b|false\b|null\b|none\b|nil\b|this value|that value|exactly)|\b(expected|required|wanted|demanded|asserted|mandated) by (the |these |those |that |this |our )?(failing |contract |unit )?tests?\b|\bto (make|get|keep) (the |this |these |that )?(failing )?(tests?|suite|ci) (to )?(pass|green)\b|\b(satisfy|satisfies|satisfying|appease) (the |this |these |that )?(failing )?tests?\b|\bspecial[- ]?cas\w*\b[^\n]{0,40}\b(for|because of|to satisfy|to pass) (the |this |that )?tests?\b/i;

// Code that behaves differently when it detects it is running under a test runner.
export const TEST_ENV_SNIFF = /['"]pytest['"]\s+in\s+sys\.modules|\bPYTEST_CURRENT_TEST\b|sys\.argv[^\n]*pytest|\bprocess\.env\.(JEST_WORKER_ID|VITEST\w*|NODE_TEST_CONTEXT|MOCHA\w*)\b|process\.env\.NODE_ENV\s*[!=]==?\s*['"`]test['"`]|\bimport\.meta\.vitest\b|\btesting\.Testing\s*\(\s*\)|\bunittest\b[^\n]*\bin\s+sys\.modules/;

// Checks and warnings silenced instead of fixed.
export const SUPPRESSION = /@ts-(ignore|expect-error|nocheck)\b|eslint-disable|#\s*type:\s*ignore|#\s*noqa\b|#\s*pragma:\s*no\s*cover|\/\/\s*nolint\b|#\[allow\(|@SuppressWarnings|(istanbul|c8|v8) ignore|#\s*pylint:\s*disable|\/\/\s*@ts-nocheck/;
