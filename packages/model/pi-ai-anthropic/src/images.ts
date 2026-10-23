// The image token rule of the Anthropic family: visual tokens from pixel dimensions. Migrated from
// the sealed `input-meters/anthropic.ts`. Anthropic Vision documents 28-pixel patches, a
// 2576-pixel edge and a 4784-token ceiling for its high-resolution models; the private image
// preprocessing of the provider and the conversion of the gateway still make every count an
// estimate, never an exact count.

/** The media types the rule knows. A record writes only these on the wire. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

/** One image rule: the estimated tokens of one image, or `null` when the rule does not apply. */
export type ImageRule = (input: Readonly<{ width: number; height: number }>) => number | null

const PATCH = 28
const MAX_EDGE = 2576
const MAX_PATCHES = 4784

function isPixelCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function patches(width: number, height: number): number {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/** Both edges within the edge limit and the patch count within the ceiling. */
function fits(width: number, height: number): boolean {
  return (
    Math.ceil(width / PATCH) * PATCH <= MAX_EDGE &&
    Math.ceil(height / PATCH) * PATCH <= MAX_EDGE &&
    patches(width, height) <= MAX_PATCHES
  )
}

/**
 * `ceil(w/28) * ceil(h/28)` when the image fits. Otherwise the published resize reference: a
 * binary search for the largest long edge whose aspect-preserving size fits, the short edge
 * rounded and at least 1. Dimensions that are not positive safe integers are `null`.
 */
const claudePatch28: ImageRule = ({ width, height }) => {
  if (!isPixelCount(width) || !isPixelCount(height)) return null
  if (fits(width, height)) return patches(width, height)
  const longEdge = Math.max(width, height)
  const aspect = longEdge / Math.min(width, height)
  const shortOf = (long: number): number => Math.max(Math.round(long / aspect), 1)
  let low = 1
  let high = longEdge
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (fits(middle, shortOf(middle))) low = middle
    else high = middle
  }
  return patches(low, shortOf(low))
}

/** The image rules by revisioned name. A record names one; a changed rule is a new name. */
export const IMAGE_RULES = {
  'claude-patch-28/1': claudePatch28,
} as const satisfies Readonly<Record<string, ImageRule>>

export type ImageRuleName = keyof typeof IMAGE_RULES
