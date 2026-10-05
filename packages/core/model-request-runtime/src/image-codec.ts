/** D-109: transport v15 revision 4. Codec handles are borrowed by preparers. */
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'
export interface AlphaBackground {
  r: number
  g: number
  b: number
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
