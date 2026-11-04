// The compatibility hints of an inspection: what a package does beyond the native format that
// `parseSkillPackage` accepts anyway, because community Skills and the main hosts accept it. A
// hint is data of the result, not a log line; the order of the set is the order in a result.

/** The closed set of compatibility hints, in the order in which a result lists them. */
export const COMPATIBILITY_HINTS = [
  'frontmatter-read-by-line',
  'description-over-limit',
  'metadata-not-text-map',
] as const

export type CompatibilityHint = (typeof COMPATIBILITY_HINTS)[number]

/** `hints` without repeats, in the order of the set. */
export function orderedHints(hints: Iterable<CompatibilityHint>): readonly CompatibilityHint[] {
  const given = new Set(hints)
  return Object.freeze(COMPATIBILITY_HINTS.filter(hint => given.has(hint)))
}
