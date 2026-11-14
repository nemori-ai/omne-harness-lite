export const COMPATIBILITY_HINTS = [
  'name-differs-from-root',
  'frontmatter-read-by-line',
  'description-over-limit',
  'metadata-not-text-map',
] as const

export type CompatibilityHint = (typeof COMPATIBILITY_HINTS)[number]

export function orderedHints(hints: Iterable<CompatibilityHint>): readonly CompatibilityHint[] {
  const given = new Set(hints)
  return Object.freeze(COMPATIBILITY_HINTS.filter(hint => given.has(hint)))
}
