import type { ImagePreparePolicy } from './types.ts'

/** Explicit, replaceable D-109 local policy; these are not upstream limits. */
export const modelImageBalancedV1: Readonly<ImagePreparePolicy> = Object.freeze({
  sourceMaxBytes: 16 * 1024 * 1024,
  decodedMaxPixels: 16_000_000,
  decodedMaxDimension: 8192,
  maxConcurrent: 2,
  maxInFlightBytes: 256 * 1024 * 1024,
  candidateMaxBytes: 16 * 1024 * 1024,
  maxAttemptsPerImage: 35,
  maxCacheBytes: 64 * 1024 * 1024,
  maxCacheEntries: 128,
  minWidth: 32,
  minHeight: 32,
  maxWidth: 2048,
  maxHeight: 2048,
  qualitySteps: Object.freeze([85, 70, 55]),
  sizeScaleSteps: Object.freeze([1, 0.75, 0.5, 0.25, 0.125]),
  outputFormats: Object.freeze([
    'png',
    'jpeg',
    'webp',
  ] satisfies ImagePreparePolicy['outputFormats']),
  alphaBackground: null,
})
export const IMAGE_PREPARATION_ALGORITHM_REVISION = 'model-image-finite-search/1'
