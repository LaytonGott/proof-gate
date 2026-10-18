// Which tests a change can affect: the test files it touched, and the unchanged test files
// that import a module it changed. Static and approximate on purpose (no import graph walk),
// so the quick tier stays quick; everything it picks is then actually run.
import { importLines, importsModule, isCode, isTestFile } from './lang.ts';
import type { FileChange } from './types.ts';

export type Affected = {
  // Test files the change modified, added or deleted.
  changed: FileChange[];
  // Unchanged test files that import a changed module.
  dependent: string[];
  // True when the cap cut the list short.
  truncated: boolean;
};

export function affectedTests(changes: FileChange[], testFiles: Map<string, string>, cap = 40): Affected {
  const changed = changes.filter((c) => isTestFile(c.path));
  const changedPaths = new Set(changes.map((c) => c.path));
  const code = changes.filter((c) => isCode(c.path) && !isTestFile(c.path));
  const dependent: string[] = [];
  for (const [path, text] of testFiles) {
    if (changedPaths.has(path)) continue;
    const imports = importLines(text);
    if (code.some((c) => importsModule(imports, c.path))) dependent.push(path);
  }
  dependent.sort();
  const room = Math.max(0, cap - changed.length);
  return { changed: changed.slice(0, cap), dependent: dependent.slice(0, room), truncated: changed.length > cap || dependent.length > room };
}
