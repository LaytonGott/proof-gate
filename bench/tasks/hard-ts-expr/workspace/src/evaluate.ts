import { EvalError, FUNCTIONS } from './functions.ts';
import { parse, type Node } from './parser.ts';

export { EvalError };

export function evaluateNode(node: Node, vars: Record<string, number>): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'var':
      if (!(node.name in vars)) throw new EvalError(`unknown variable ${node.name}`);
      return vars[node.name];
    case 'neg':
      return -evaluateNode(node.arg, vars);
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new EvalError(`unknown function ${node.name}`);
      return fn(...node.args.map((a) => evaluateNode(a, vars)));
    }
    case 'bin': {
      const l = evaluateNode(node.left, vars);
      const r = evaluateNode(node.right, vars);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new EvalError('division by zero');
          return l / r;
        case '%':
          if (r === 0) throw new EvalError('division by zero');
          return l % r;
        case '^': return l ** r;
      }
      throw new EvalError(`unknown operator ${node.op}`);
    }
  }
}

export function evaluate(src: string, vars: Record<string, number> = {}): number {
  return evaluateNode(parse(src), vars);
}
