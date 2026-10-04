/** D-109: transport v15 revision 4. Codec handles are borrowed by preparers. */
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'
export interface AlphaBackground {
  r: number
  g: number
  b: number
}
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
export type CodecFailure = { failure: 'bad_input' | 'unsupported' | 'unavailable' | 'internal' }
export type CodecResult<T> = { ok: T } | CodecFailure
export interface DecodeLimits {
  maxPixels: number
  maxDimension: number
}
export interface ImageMetadata {
  mediaType: string
  width: number
  height: number
  pages: number
  orientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  hasAlpha: boolean
}
export interface ImageEncodeSpec {
  format: ImageOutputFormat
  width: number
  height: number
  quality: number | null
  pngCompressionLevel: number
  webpEffort: number
  alphaBackground: AlphaBackground | null
}
export interface EncodedImage {
  bytes: Uint8Array
  mediaType: string
  width: number
  height: number
}
export interface DecodedImage {
  readonly width: number
  readonly height: number
  readonly hasAlpha: boolean
  encode(spec: ImageEncodeSpec): Promise<CodecResult<EncodedImage>>
  close(): Promise<void>
}
export interface LoadedImageCodec {
  readonly name: string
  readonly revision: string
  readonly inputMediaTypes: readonly string[]
  readonly outputFormats: readonly ImageOutputFormat[]
  readonly available: () => boolean
  inspect(bytes: Uint8Array, limits: DecodeLimits): Promise<CodecResult<ImageMetadata>>
  decode(
    bytes: Uint8Array,
    metadata: ImageMetadata,
    limits: DecodeLimits,
  ): Promise<CodecResult<DecodedImage>>
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
