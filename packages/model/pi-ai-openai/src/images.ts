// The image token rules of the OpenAI family: patch counts from pixel dimensions. Migrated from the
// sealed `input-meters/openai-images.ts`. The archived images-vision guide (2026-09-28, image-doc.md
// SHA-256 4936284cccfc38f22281d6a698b6f190ccc857849ea8dc533ed68617984b608d) gives the patch rules;
// every count is an estimate of the input that the gateway hosts, never an exact count.

/** The detail modes the patch rules know. A record writes one of the first three on the wire. */
export type ImageDetail = 'low' | 'high' | 'auto' | 'original'

/** One image rule: the estimated tokens of one image, or `null` when the rule does not apply. */
export type ImageRule = (
  input: Readonly<{ width: number; height: number; detail: ImageDetail }>,
) => number | null

const PATCH = 32
const HIGH_PATCH_LIMIT = 2500
const PROCESSED_PATCH_LIMIT = 30000

/**
 * The fitted patch estimate: the larger side fits to `maxDimension` (floor), `high` shrinks to at
 * most 2500 patches, more than 30000 processed patches is `null`, and the tokens are
 * `ceil(patches * 6 / 5)`. The rounding direction of the first fit is this estimator's convention.
 */
function fittedPatchTokens(
  width: number,
  height: number,
  detail: ImageDetail,
  maxDimension: number,
): number | null {
  const pixelScale = Math.min(1, maxDimension / Math.max(width, height))
  let scaledWidth = pixelScale === 1 ? width : Math.floor(width * pixelScale)
  let scaledHeight = pixelScale === 1 ? height : Math.floor(height * pixelScale)
  if (scaledWidth < 1 || scaledHeight < 1) return null
  let patches = Math.ceil(scaledWidth / PATCH) * Math.ceil(scaledHeight / PATCH)
  if (detail === 'high' && patches > HIGH_PATCH_LIMIT) {
    const shrink = Math.sqrt((PATCH * PATCH * HIGH_PATCH_LIMIT) / (scaledWidth * scaledHeight))
    const adjusted =
      shrink *
      Math.min(
        Math.floor((scaledWidth * shrink) / PATCH) / ((scaledWidth * shrink) / PATCH),
        Math.floor((scaledHeight * shrink) / PATCH) / ((scaledHeight * shrink) / PATCH),
      )
    scaledWidth = Math.floor(scaledWidth * adjusted)
    scaledHeight = Math.floor(scaledHeight * adjusted)
    if (scaledWidth < 1 || scaledHeight < 1) return null
    patches = Math.ceil(scaledWidth / PATCH) * Math.ceil(scaledHeight / PATCH)
  }
  if (patches > PROCESSED_PATCH_LIMIT) return null
  return Math.ceil((patches * 6) / 5)
}

function isPixelCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

/** A named patch rule: `low` fits to 512, `high` to `highMaxDimension`, other modes to 65535. */
function patchRule(highMaxDimension: number): ImageRule {
  return ({ width, height, detail }) => {
    if (!isPixelCount(width) || !isPixelCount(height)) return null
    const maxDimension = detail === 'low' ? 512 : detail === 'high' ? highMaxDimension : 65535
    return fittedPatchTokens(width, height, detail, maxDimension)
  }
}

/**
 * The Sol/Luna proxy: native dimensions, `ceil(ceil(w/32) * ceil(h/32) * 6 / 5)`, for `auto` only.
 * It borrows no resize or patch cap; arithmetic beyond safe integers is `null`, not rounded.
 */
const solLunaAutoProxy: ImageRule = ({ width, height, detail }) => {
  if (!isPixelCount(width) || !isPixelCount(height) || detail !== 'auto') return null
  const scaledPatches = Math.ceil(width / PATCH) * Math.ceil(height / PATCH) * 6
  if (!Number.isSafeInteger(scaledPatches)) return null
  return Math.ceil(scaledPatches / 5)
}

/** The image rules by revisioned name. A record names one; a changed rule is a new name. */
export const IMAGE_RULES = {
  'gpt56-patch/1': patchRule(2048),
  'astra-patch/1': patchRule(65535),
  'sol-luna-auto-proxy/1': solLunaAutoProxy,
} as const satisfies Readonly<Record<string, ImageRule>>

export type ImageRuleName = keyof typeof IMAGE_RULES
