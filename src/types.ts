// Core types shared by the analyzer, the rules and the integrations.

/**
 * block: proof of gaming; the agent must undo it before it may stop.
 * challenge: strong smell; the agent is stopped once and must fix it or explain it to the user.
 * info: surfaced to the user, never stops the agent.
 */
export type Level = 'block' | 'challenge' | 'info';

export type Finding = {
  rule: string;
  level: Level;
  file?: string;
  line?: number;
  message: string;
  evidence: string[];
  // Stable across re-checks of the same problem, so a challenge is only raised once.
  fingerprint: string;
};

export type Line = { n: number; text: string };

export type FileChange = {
  path: string;
  status: 'A' | 'M' | 'D';
  before: string | null;
  after: string | null;
  // Lines only in `after` (n = 1-based line number in after) and only in `before`.
  added: Line[];
  removed: Line[];
  // Replacement hunks: a run of removed lines directly followed by added lines.
  replaced: Array<{ removed: Line[]; added: Line[] }>;
};

export type Context = {
  changes: FileChange[];
  // Every test file in the after-state (path -> content), loaded lazily.
  testFiles: () => Promise<Map<string, string>>;
  // The agent's last message to the user, when known.
  finalMessage?: string;
};

export type Rule = (ctx: Context) => Promise<Finding[]> | Finding[];
