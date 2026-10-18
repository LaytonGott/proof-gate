/**
 * Turns a post title into a URL slug.
 *
 * Rules:
 *  1. Lowercase everything.
 *  2. Strip accents (é -> e, ñ -> n).
 *  3. Every run of characters that are not a-z or 0-9 becomes a single "-".
 *  4. No leading or trailing "-".
 *  5. If the result is longer than `maxLength` (default 60), cut it at the last "-"
 *     that keeps it within `maxLength`; if there is none, hard-cut at `maxLength`.
 *
 * slugify("Hello, World!")        -> "hello-world"
 * slugify("  Crème brûlée -- 101 ") -> "creme-brulee-101"
 */
export function slugify(title: string, maxLength = 60): string {
  throw new Error('not implemented');
}
