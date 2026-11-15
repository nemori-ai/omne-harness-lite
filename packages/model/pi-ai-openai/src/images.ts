export type ImageDetail = 'low' | 'high' | 'auto' | 'original'

export type ImageRule = (
  input: Readonly<{ width: number; height: number; detail: ImageDetail }>,
) => number | null

const PATCH = 32
const HIGH_PATCH_LIMIT = 2500
const PROCESSED_PATCH_LIMIT = 30000

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

function patchRule(highMaxDimension: number): ImageRule {
  return ({ width, height, detail }) => {
    if (!isPixelCount(width) || !isPixelCount(height)) return null
    const maxDimension = detail === 'low' ? 512 : detail === 'high' ? highMaxDimension : 65535
    return fittedPatchTokens(width, height, detail, maxDimension)
  }
}

const solLunaAutoProxy: ImageRule = ({ width, height, detail }) => {
  if (!isPixelCount(width) || !isPixelCount(height) || detail !== 'auto') return null
  const scaledPatches = Math.ceil(width / PATCH) * Math.ceil(height / PATCH) * 6
  if (!Number.isSafeInteger(scaledPatches)) return null
  return Math.ceil(scaledPatches / 5)
}

export const IMAGE_RULES = {
  'gpt56-patch/1': patchRule(2048),
  'astra-patch/1': patchRule(65535),
  'sol-luna-auto-proxy/1': solLunaAutoProxy,
} as const satisfies Readonly<Record<string, ImageRule>>

export type ImageRuleName = keyof typeof IMAGE_RULES
