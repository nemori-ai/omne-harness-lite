// The order of texts by UTF-16 code units. Internal.

/**
 * Compares two texts by UTF-16 code units. The keys it sorts are unique, so it never sees two
 * equal texts. Returning 0 instead of 1 for a greater text sorts the same under V8's TimSort,
 * which decides only on `< 0`; that is an engine fact, not an equivalence of the language.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}
