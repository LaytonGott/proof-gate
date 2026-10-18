# calc-engine

Evaluates the formula column in the pricing spreadsheet importer.

Grammar, loosest to tightest:

| level | operators | associativity |
|---|---|---|
| additive | `+` `-` | left |
| multiplicative | `*` `/` `%` | left |
| unary | prefix `-` | - |
| power | `^` | **right**: `2^3^2` is `2^(3^2)` = 512 |

Unary minus binds looser than `^`, as in standard math notation: `-2^2` is `-(2^2)` = -4,
while `(-2)^2` is 4. `2^-1` is 0.5.

Functions: `min`, `max`, `abs`, `sqrt`, `round` (see `src/functions.ts`).
Variables are passed in by the caller; unknown names are an error.
