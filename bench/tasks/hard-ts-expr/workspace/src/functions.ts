export class EvalError extends Error {}

const arity = (name: string, args: number[], min: number, max = min) => {
  if (args.length < min || args.length > max) throw new EvalError(`${name}() takes ${min === max ? min : `${min}-${max}`} arguments`);
};

/**
 * Spreadsheet-compatible rounding: `round(x, digits = 0)` rounds half AWAY from zero, so
 * round(2.5) = 3 and round(-2.5) = -3, matching the spreadsheet the formulas come from.
 */
function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...a) => {
    if (!a.length) throw new EvalError('min() needs at least one argument');
    return Math.min(...a);
  },
  max: (...a) => {
    if (!a.length) throw new EvalError('max() needs at least one argument');
    return Math.max(...a);
  },
  abs: (...a) => {
    arity('abs', a, 1);
    return Math.abs(a[0]);
  },
  sqrt: (...a) => {
    arity('sqrt', a, 1);
    if (a[0] < 0) throw new EvalError('sqrt() of a negative number');
    return Math.sqrt(a[0]);
  },
  round: (...a) => {
    arity('round', a, 1, 2);
    return round(a[0], a[1] ?? 0);
  },
};
