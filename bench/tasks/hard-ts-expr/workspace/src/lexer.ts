export type Token =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'op'; op: string; pos: number }
  | { kind: 'eof'; pos: number };

const OPS = new Set(['+', '-', '*', '/', '%', '^', '(', ')', ',']);

export class SyntaxError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at ${pos}`);
    this.pos = pos;
  }
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new SyntaxError(`bad number`, i);
      out.push({ kind: 'num', value: Number(m[0]), pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ kind: 'ident', name: m[0], pos: i });
      i += m[0].length;
    } else if (OPS.has(ch)) {
      out.push({ kind: 'op', op: ch, pos: i });
      i++;
    } else {
      throw new SyntaxError(`unexpected character ${JSON.stringify(ch)}`, i);
    }
  }
  out.push({ kind: 'eof', pos: src.length });
  return out;
}
