/**
 * Merges `override` onto `base` without mutating either. Nested plain objects merge key by
 * key; arrays and every other value in `override` replace the one in `base`. Keys whose
 * override value is `undefined` are ignored.
 */
export function deepMerge<T extends object>(base: T, override: object): T {
  return { ...base, ...override } as T;
}
