// Reads what the gate needs out of a Claude Code transcript (JSONL): the agent's last message
// to the user, and the files it edited during the current turn.
import { existsSync, readFileSync } from 'node:fs';

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
type Entry = { type?: string; message?: { role?: string; content?: unknown } };

const readEntries = (transcriptPath: string | undefined): Entry[] => {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  const out: Entry[] = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // A partially written last line.
    }
  }
  return out;
};

const blocks = (content: unknown): Block[] => (Array.isArray(content) ? content.filter((b) => b && typeof b === 'object') : []);
const isAssistant = (e: Entry) => e.type === 'assistant' || e.message?.role === 'assistant';
// A prompt the person typed, as opposed to a tool result fed back to the model.
const isPrompt = (e: Entry) =>
  (e.type === 'user' || e.message?.role === 'user') &&
  (typeof e.message?.content === 'string' || blocks(e.message?.content).some((b) => b.type === 'text'));

export function lastAssistantText(transcriptPath: string | undefined): string | undefined {
  const entries = readEntries(transcriptPath);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!isAssistant(e)) continue;
    const content = e.message?.content;
    const text = (typeof content === 'string' ? content : blocks(content).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')).trim();
    if (text) return text;
  }
  return undefined;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Absolute paths the agent edited with file tools since the person's last prompt. */
export function filesEditedThisTurn(transcriptPath: string | undefined): string[] {
  const entries = readEntries(transcriptPath);
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) if (isPrompt(entries[i])) { start = i; break; }
  const out = new Set<string>();
  for (const e of entries.slice(start)) {
    if (!isAssistant(e)) continue;
    for (const b of blocks(e.message?.content)) {
      if (b.type !== 'tool_use' || !EDIT_TOOLS.has(b.name ?? '')) continue;
      const p = b.input?.file_path ?? b.input?.notebook_path;
      if (typeof p === 'string') out.add(p);
    }
  }
  return [...out];
}
