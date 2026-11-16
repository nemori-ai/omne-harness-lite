export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

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

function fits(width: number, height: number): boolean {
  return (
    Math.ceil(width / PATCH) * PATCH <= MAX_EDGE &&
    Math.ceil(height / PATCH) * PATCH <= MAX_EDGE &&
    patches(width, height) <= MAX_PATCHES
  )
}

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

export const IMAGE_RULES = {
  'claude-patch-28/1': claudePatch28,
} as const satisfies Readonly<Record<string, ImageRule>>

export type ImageRuleName = keyof typeof IMAGE_RULES
