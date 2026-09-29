import { imageSize } from 'image-size'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'

export type ImageRule = 'gpt56-patch' | 'astra-patch' | 'unknown'
type ImageDetail = 'low' | 'high' | 'original' | 'auto'
const dataUrl =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==))$/u
function expectedImageType(mime: string): string | undefined {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return undefined
  }
}

// OpenAI's vision input list permits GIF only when it has one frame. image-size
// reads GIF dimensions from the header, so inspect the block chain as well.
function singleFrameGif(bytes: Buffer): boolean {
  const version = bytes.toString('ascii', 0, 6)
  if (bytes.length < 14 || (version !== 'GIF87a' && version !== 'GIF89a')) return false
  let offset = 13
  const screenFlags = bytes[10]
  if (screenFlags === undefined) return false
  if (screenFlags & 0x80) offset += 3 * 2 ** ((screenFlags & 0x07) + 1)
  let frames = 0
  function skipSubBlocks(): boolean {
    while (offset < bytes.length) {
      const size = bytes[offset++]
      if (size === undefined) return false
      if (size === 0) return true
      offset += size
      if (offset > bytes.length) return false
    }
    return false
  }
  while (offset < bytes.length) {
    const marker = bytes[offset++]
    if (marker === 0x3b) return frames === 1 && offset === bytes.length
    if (marker === 0x21) {
      if (offset >= bytes.length) return false
      offset++ // extension label; all extension payloads are sub-block chains
      if (!skipSubBlocks()) return false
      continue
    }
    if (marker !== 0x2c || ++frames > 1 || offset + 9 > bytes.length) return false
    const imageFlags = bytes[offset + 8]
    if (imageFlags === undefined) return false
    offset += 9
    if (imageFlags & 0x80) offset += 3 * 2 ** ((imageFlags & 0x07) + 1)
    if (offset >= bytes.length) return false
    offset++ // LZW minimum code size
    if (!skipSubBlocks()) return false
  }
  return false
}

// Archived images-vision guide (2026-09-28), image-doc.md SHA256
// 4936284cccfc38f22281d6a698b6f190ccc857849ea8dc533ed68617984b608d.
// Preserve the existing GPT-5.6 source-dimension support boundary; Astra's
// new binding also applies the documented fit for larger source dimensions.
const patchRules = {
  'gpt56-patch': { highMaxDimension: 2048, maxSourceDimension: 65535 },
  'astra-patch': { highMaxDimension: 65535, maxSourceDimension: Number.MAX_SAFE_INTEGER },
} as const

/** Named patch sizing is still an estimate of the OpenRouter-hosted input. */
export function patchImageTokens(
  width: number,
  height: number,
  detail: ImageDetail,
  rule: Exclude<ImageRule, 'unknown'>,
): number | undefined {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > patchRules[rule].maxSourceDimension ||
    height > patchRules[rule].maxSourceDimension
  )
    return undefined

  const maxDimension =
    detail === 'low' ? 512 : detail === 'high' ? patchRules[rule].highMaxDimension : 65535
  const pixelScale = Math.min(1, maxDimension / Math.max(width, height))
  // The guide says to round the first fit to whole pixels without specifying
  // a direction. Floor is this estimator's convention, not an upstream-exact claim.
  let scaledWidth = pixelScale === 1 ? width : Math.floor(width * pixelScale)
  let scaledHeight = pixelScale === 1 ? height : Math.floor(height * pixelScale)
  if (scaledWidth < 1 || scaledHeight < 1) return undefined

  let patches = Math.ceil(scaledWidth / 32) * Math.ceil(scaledHeight / 32)
  if (detail === 'high' && patches > 2500) {
    const shrink = Math.sqrt((32 * 32 * 2500) / (scaledWidth * scaledHeight))
    const adjusted =
      shrink *
      Math.min(
        Math.floor((scaledWidth * shrink) / 32) / ((scaledWidth * shrink) / 32),
        Math.floor((scaledHeight * shrink) / 32) / ((scaledHeight * shrink) / 32),
      )
    scaledWidth = Math.floor(scaledWidth * adjusted)
    scaledHeight = Math.floor(scaledHeight * adjusted)
    if (scaledWidth < 1 || scaledHeight < 1) return undefined
    patches = Math.ceil(scaledWidth / 32) * Math.ceil(scaledHeight / 32)
  }
  if (patches > 30000) return undefined
  return Math.ceil((patches * 6) / 5)
}

export function imageTokens(part: JsonObject, rule: ImageRule): number | undefined {
  if (rule === 'unknown') return undefined
  if (Object.keys(part).some(key => key !== 'type' && key !== 'image_url')) return undefined
  const image = part.image_url
  if (!object(image) || Object.keys(image).some(key => key !== 'url' && key !== 'detail'))
    return undefined
  if (
    image.detail !== undefined &&
    image.detail !== 'auto' &&
    image.detail !== 'original' &&
    image.detail !== 'low' &&
    image.detail !== 'high'
  )
    return undefined
  const match = typeof image.url === 'string' ? dataUrl.exec(image.url) : null
  if (!match?.[1] || !match[2]) return undefined
  const decoded = Buffer.from(match[2], 'base64')
  if (!decoded.length || decoded.toString('base64') !== match[2]) return undefined
  if (match[1] === 'image/gif' && !singleFrameGif(decoded)) return undefined
  try {
    const dimensions = imageSize(decoded)
    if (dimensions.type !== expectedImageType(match[1])) return undefined
    return patchImageTokens(dimensions.width, dimensions.height, image.detail ?? 'auto', rule)
  } catch {
    return undefined
  }
}
