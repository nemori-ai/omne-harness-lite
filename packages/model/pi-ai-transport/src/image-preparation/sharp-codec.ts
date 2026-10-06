import type sharp from 'sharp'
import type { Metadata, OutputInfo } from 'sharp'
import { crc32 } from 'node:zlib'
import { bytesSchema, dataOnly, encodeSchema, limitsSchema, metadataSchema } from './validation.ts'
import type {
  CodecResult,
  DecodeLimits,
  DecodedImage,
  ImageEncodeSpec,
  ImageMetadata,
  ImageOutputFormat,
  LoadedImageCodec,
} from '@omne-harness-lite/model-request-runtime'

function failure(error: unknown): { failure: 'bad_input' | 'unsupported' | 'internal' } {
  if (!(error instanceof Error)) return { failure: 'internal' }
  if (/unsupported image format|no decode delegate/i.test(error.message))
    return { failure: 'unsupported' }
  if (
    /corrupt|truncated|invalid|premature|bad (header|input)|unexpected end|not enough|read error|input buffer/i.test(
      error.message,
    )
  )
    return { failure: 'bad_input' }
  return { failure: 'internal' }
}
const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
// libvips's PNG loader can expose only the default raster of APNG. Read the
// animation declaration from validated chunk framing before any raster decode.
function pngPages(bytes: Uint8Array): number | undefined {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pages = 1
  for (let offset = 8; offset + 12 <= view.length;) {
    const size = view.readUInt32BE(offset)
    const end = offset + 12 + size
    if (end > view.length) return undefined
    const type = view.toString('ascii', offset + 4, offset + 8)
    if (type === 'acTL') {
      if (size !== 8 || crc32(view.subarray(offset + 4, end - 4)) !== view.readUInt32BE(end - 4))
        return undefined
      pages = view.readUInt32BE(offset + 8)
      if (pages === 0) return undefined
    }
    if (type === 'IEND') return pages
    offset = end
  }
  return undefined
}
function mediaType(format: string | undefined): string | undefined {
  switch (format) {
    case 'png':
      return mime.png
    case 'jpeg':
      return mime.jpeg
    case 'webp':
      return mime.webp
    case 'gif':
      return mime.gif
    default:
      return undefined
  }
}
function orientation(value: number | undefined): ImageMetadata['orientation'] | undefined {
  if (value === undefined) return 1
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      return value
    default:
      return undefined
  }
}

/** Explicit assembly boundary: never imports the native implementation itself. */
export function createSharpImageCodec(loadedSharp: typeof sharp): LoadedImageCodec {
  if (typeof loadedSharp !== 'function' || loadedSharp.versions.sharp !== '0.35.3')
    throw new TypeError('Expected explicitly loaded sharp 0.35.3')
  const inputMediaTypes = [
    { mediaType: 'image/png', available: loadedSharp.format.png.input.buffer },
    { mediaType: 'image/jpeg', available: loadedSharp.format.jpeg.input.buffer },
    { mediaType: 'image/webp', available: loadedSharp.format.webp.input.buffer },
    { mediaType: 'image/gif', available: loadedSharp.format.gif.input.buffer },
  ]
    .filter(format => format.available)
    .map(format => format.mediaType)
  const desiredOutputs: ImageOutputFormat[] = ['png', 'jpeg', 'webp']
  const outputFormats = desiredOutputs.filter(format => loadedSharp.format[format].output.buffer)
  if (!inputMediaTypes.length || !outputFormats.length)
    throw new TypeError('Loaded sharp has no supported buffer codec')
  const revision = `sharp-rgba8-srgb-exif/1:${JSON.stringify([Object.entries(loadedSharp.versions).sort(([a], [b]) => a.localeCompare(b)), process.platform, process.arch, inputMediaTypes, outputFormats])}`
  return {
    name: 'sharp',
    revision,
    inputMediaTypes,
    outputFormats,
    available: () => true,
    async inspect(bytes, limits) {
      if (
        !bytesSchema.safeParse(bytes).success ||
        !dataOnly(limits) ||
        !limitsSchema.safeParse(limits).success
      )
        return { failure: 'bad_input' }
      try {
        // Header inspection must expose over-limit dimensions for the helper's
        // resource classification. No raster is decoded here; decode below
        // applies the caller's finite native pixel guard before allocation.
        const metadata = await loadedSharp(bytes, {
          limitInputPixels: Number.MAX_SAFE_INTEGER,
          failOn: 'warning',
          animated: true,
        }).metadata()
        const type = mediaType(metadata.format)
        const direction = orientation(metadata.orientation)
        if (!type || !direction || !metadata.width || !metadata.height)
          return { failure: 'unsupported' }
        const pages = metadata.format === 'png' ? pngPages(bytes) : (metadata.pages ?? 1)
        if (pages === undefined) return { failure: 'bad_input' }
        return {
          ok: {
            mediaType: type,
            width: metadata.width,
            height: metadata.pageHeight ?? metadata.height,
            pages,
            orientation: direction,
            hasAlpha: metadata.hasAlpha,
          },
        }
      } catch (error) {
        return failure(error)
      }
    },
    async decode(bytes, metadata, limits) {
      if (!validDecodeInput(bytes, metadata, limits)) return { failure: 'bad_input' }
      try {
        const actual = await loadedSharp(bytes, {
          limitInputPixels: limits.maxPixels,
          failOn: 'warning',
          animated: true,
        }).metadata()
        if (!matchesMetadata(actual, metadata)) return { failure: 'bad_input' }
        const { data, info } = await loadedSharp(bytes, {
          limitInputPixels: limits.maxPixels,
          failOn: 'warning',
        })
          .autoOrient()
          .toColourspace('srgb')
          .ensureAlpha()
          .raw({ depth: 'uchar' })
          .toBuffer({ resolveWithObject: true })
        if (!matchesRaster(info, metadata, limits)) return { failure: 'internal' }
        let pixels: Buffer | undefined = data
        let closed = false
        let closing: Promise<void> | undefined
        const active = new Set<
          Promise<CodecResult<import('@omne-harness-lite/model-request-runtime').EncodedImage>>
        >()
        async function encode(
          spec: ImageEncodeSpec,
        ): Promise<CodecResult<import('@omne-harness-lite/model-request-runtime').EncodedImage>> {
          const source = pixels
          if (closed || !source) return { failure: 'unavailable' }
          if (!dataOnly(spec)) return { failure: 'bad_input' }
          const validated = encodeSchema.safeParse(spec)
          if (
            !validated.success ||
            (validated.data.format === 'png') !== (validated.data.quality === null)
          )
            return { failure: 'bad_input' }
          spec = validated.data
          const task = encodePixels()
          active.add(task)
          try {
            return await task
          } finally {
            active.delete(task)
          }

          async function encodePixels(): Promise<
            CodecResult<import('@omne-harness-lite/model-request-runtime').EncodedImage>
          > {
            try {
              let image = loadedSharp(source, {
                raw: { width: info.width, height: info.height, channels: 4 },
              }).resize({
                width: spec.width,
                height: spec.height,
                fit: 'inside',
                withoutEnlargement: true,
              })
              if (spec.alphaBackground) image = image.flatten({ background: spec.alphaBackground })
              if (spec.format === 'jpeg') {
                if (metadata.hasAlpha && !spec.alphaBackground)
                  return { failure: 'unsupported' } satisfies CodecResult<never>
                if (spec.quality === null)
                  return { failure: 'internal' } satisfies CodecResult<never>
                image = image.jpeg({ quality: spec.quality })
              } else if (spec.format === 'webp') {
                if (spec.quality === null)
                  return { failure: 'internal' } satisfies CodecResult<never>
                image = image.webp({ quality: spec.quality, effort: spec.webpEffort })
              } else image = image.png({ compressionLevel: spec.pngCompressionLevel })
              const output = await image.toBuffer({ resolveWithObject: true })
              if (output.info.format !== spec.format)
                return { failure: 'internal' } satisfies CodecResult<never>
              return {
                ok: {
                  bytes: output.data,
                  mediaType: mime[spec.format],
                  width: output.info.width,
                  height: output.info.height,
                },
              }
            } catch (error) {
              return failure(error)
            }
          }
        }
        const decoded: DecodedImage = {
          width: info.width,
          height: info.height,
          hasAlpha: metadata.hasAlpha,
          encode,
          close() {
            closed = true
            closing ??= (async () => {
              await Promise.all(active)
              pixels = undefined
            })()
            return closing
          },
        }
        return { ok: decoded }
      } catch (error) {
        return failure(error)
      }
    },
  }
}

function validDecodeInput(
  bytes: Uint8Array,
  metadata: ImageMetadata,
  limits: DecodeLimits,
): boolean {
  if (
    !bytesSchema.safeParse(bytes).success ||
    !dataOnly(metadata) ||
    !metadataSchema.safeParse(metadata).success ||
    !dataOnly(limits) ||
    !limitsSchema.safeParse(limits).success
  )
    return false
  return true
}

function matchesMetadata(actual: Metadata, metadata: ImageMetadata): boolean {
  if (
    mediaType(actual.format) !== metadata.mediaType ||
    actual.width !== metadata.width ||
    (actual.pageHeight ?? actual.height) !== metadata.height ||
    (actual.pages ?? 1) !== metadata.pages ||
    orientation(actual.orientation) !== metadata.orientation ||
    actual.hasAlpha !== metadata.hasAlpha ||
    metadata.pages !== 1
  )
    return false
  return true
}

function matchesRaster(info: OutputInfo, metadata: ImageMetadata, limits: DecodeLimits): boolean {
  const swapped = metadata.orientation >= 5
  if (
    info.width !== (swapped ? metadata.height : metadata.width) ||
    info.height !== (swapped ? metadata.width : metadata.height) ||
    info.channels !== 4 ||
    info.width > limits.maxDimension ||
    info.height > limits.maxDimension
  )
    return false
  return true
}
