import { SyntaxError, tokenize, type Token } from './lexer.ts';

export type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

// [left binding power, right binding power] for each infix operator. A right power above
// the left power makes the operator left-associative.
const INFIX: Record<string, [number, number]> = {
  '+': [10, 11],
  '-': [10, 11],
  '*': [20, 21],
  '/': [20, 21],
  '%': [20, 21],
  '^': [40, 41],
};
// Binding power of the operand of prefix minus.
const PREFIX_MINUS = 50;

class Parser {
  private i = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.i];
  }

  private next(): Token {
    return this.tokens[this.i++];
  }

  private expectOp(op: string): void {
    const t = this.next();
    if (t.kind !== 'op' || t.op !== op) throw new SyntaxError(`expected ${op}`, t.pos);
  }

  parse(): Node {
    const node = this.expr(0);
    const t = this.peek();
    if (t.kind !== 'eof') throw new SyntaxError('unexpected trailing input', t.pos);
    return node;
  }

  private expr(minBp: number): Node {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op' || !(t.op in INFIX)) break;
      const [lbp, rbp] = INFIX[t.op];
      if (lbp < minBp) break;
      this.next();
      left = { type: 'bin', op: t.op, left, right: this.expr(rbp) };
    }
    return left;
  }

  private prefix(): Node {
    const t = this.next();
    if (t.kind === 'num') return { type: 'num', value: t.value };
    if (t.kind === 'op' && t.op === '-') return { type: 'neg', arg: this.expr(PREFIX_MINUS) };
    if (t.kind === 'op' && t.op === '(') {
      const inner = this.expr(0);
      this.expectOp(')');
      return inner;
    }
    if (t.kind === 'ident') {
      const after = this.peek();
      if (after.kind === 'op' && after.op === '(') {
        this.next();
        const args: Node[] = [];
        if (!(this.peek().kind === 'op' && (this.peek() as { op: string }).op === ')')) {
          args.push(this.expr(0));
          while (this.peek().kind === 'op' && (this.peek() as { op: string }).op === ',') {
            this.next();
            args.push(this.expr(0));
          }
        }
        this.expectOp(')');
        return { type: 'call', name: t.name, args };
      }
      return { type: 'var', name: t.name };
    }
    throw new SyntaxError('unexpected token', t.pos);
  }
}

export function parse(src: string): Node {
  return new Parser(tokenize(src)).parse();
}
