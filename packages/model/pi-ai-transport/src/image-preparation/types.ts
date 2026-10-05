import {
  type ImageOutputFormat,
  type EncodedImage,
  type AlphaBackground,
} from '@omne-harness-lite/model-request-runtime'

export interface ImagePreparePolicy {
  sourceMaxBytes: number
  decodedMaxPixels: number
  decodedMaxDimension: number
  maxConcurrent: number
  maxInFlightBytes: number
  candidateMaxBytes: number
  maxAttemptsPerImage: number
  maxCacheBytes: number
  maxCacheEntries: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  qualitySteps: readonly number[]
  sizeScaleSteps: readonly number[]
  outputFormats: readonly ImageOutputFormat[]
  alphaBackground: AlphaBackground | null
}
export interface ImagePrepareInput {
  position: string
  bytes: Uint8Array
  mediaType: string
  targetMaxBytes: number
}
export interface PrepareRequestImagesInput {
  images: readonly ImagePrepareInput[]
  maxRequestBytes: number | null
  nonImageWireBytes: number
  signal: AbortSignal
}
export interface PreparedImage extends EncodedImage {
  sourceDigest: string
  targetDigest: string
  transformRevision: string
  policyDigest: string
  changed: boolean
  candidateOrdinal: number
}
export type ImagePrepareRejection =
  | { reason: 'malformed_input'; field: string }
  | {
      reason:
        | 'malformed_image'
        | 'decode_failed'
        | 'unsupported_encoding'
        | 'animated_input'
        | 'source_resource_limit'
      imageIndex: number
    }
  | { reason: 'no_candidate'; stage: 'per_image'; imageIndex: number }
  | { reason: 'no_candidate'; stage: 'request_total' }
  | { reason: 'aborted' }
  | {
      reason: 'provider_unavailable'
      cause: 'closed' | 'codec_unavailable' | 'busy' | 'codec_failure'
    }
  | { reason: 'exact_request_limit_exceeded'; actualBytes: number; limitBytes: number }
export type ImagePrepareResult =
  | { prepared: { images: PreparedImage[]; exploredThrough: number[] } }
  | { rejected: ImagePrepareRejection }
export interface ImagePreparer {
  readonly algorithmRevision: string
  readonly codecRevision: string
  readonly policyDigest: string
  prepareRequestImages(
    input: PrepareRequestImagesInput,
    reuseScope?: object,
  ): Promise<ImagePrepareResult>
  clearScope(scope: object): void
  close(): Promise<void>
}
export type ImagePreparerResult = { ready: ImagePreparer } | { unavailable: true }
