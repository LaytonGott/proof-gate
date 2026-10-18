// Reads JUnit XML (as written by pytest, node --test, vitest, jest-junit) into per-test results.
import { isAbsolute, relative } from 'node:path';

export type TestStatus = 'pass' | 'fail' | 'skip';

const unescape = (v: string) =>
  v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? unescape(m[1]) : undefined;
};

/**
 * One entry per <testcase>, keyed "<file>::<name>" (pytest class methods: "<file>::<Class>::<name>").
 * `fallbackFile` names the file when the report does not; `root` makes reported paths relative.
 */
export function parseJunit(xml: string, opts: { fallbackFile?: string; root?: string } = {}): Record<string, TestStatus> {
  const out: Record<string, TestStatus> = {};
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1];
    const name = attr(attrs, 'name');
    if (name === undefined) continue;
    let file = attr(attrs, 'file') ?? opts.fallbackFile ?? '';
    if (file && opts.root && isAbsolute(file)) file = relative(opts.root, file);
    file = file.replace(/\\/g, '/');
    // pytest: classname "tests.test_x.TestK" for a method of class TestK in tests/test_x.py.
    const classname = attr(attrs, 'classname') ?? '';
    const moduleDotted = file.replace(/\.py$/, '').replace(/\//g, '.');
    const cls = classname.startsWith(`${moduleDotted}.`) ? `${classname.slice(moduleDotted.length + 1)}::` : '';
    const body = m[3] ?? '';
    const failed = /<(failure|error)\b/.test(body) || /\b(failure|error)="/.test(attrs);
    out[`${file}::${cls}${name}`] = failed ? 'fail' : /<skipped\b/.test(body) || /\bskipped="/.test(attrs) ? 'skip' : 'pass';
  }
  return out;
}
