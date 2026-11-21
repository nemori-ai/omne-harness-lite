import sharp from 'sharp'

type ImageFormat = 'png' | 'jpeg' | 'webp'

const encoders = {
  png: (pipeline: ReturnType<typeof sharp>) => pipeline.png(),
  jpeg: (pipeline: ReturnType<typeof sharp>, quality?: number) =>
    pipeline.jpeg(quality === undefined ? {} : { quality }),
  webp: (pipeline: ReturnType<typeof sharp>, quality?: number) =>
    pipeline.webp(quality === undefined ? {} : { quality }),
} as const

export type RasterTarget = {
  readonly width: number
  readonly height: number
  readonly quality: number | undefined
}

export async function decodeRaster(
  bytes: Uint8Array,
  width: number,
  height: number,
  estimate: number,
): Promise<Buffer | undefined> {
  try {
    const decoded = await sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: width * height,
    })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (
      decoded.info.width !== width ||
      decoded.info.height !== height ||
      decoded.data.length !== estimate
    ) {
      return undefined
    }
    return decoded.data
  } catch {
    return undefined
  }
}

export async function encodeRaster(
  pixels: Buffer,
  width: number,
  height: number,
  format: ImageFormat,
  target: RasterTarget,
): Promise<
  { readonly bytes: Buffer; readonly orientation: undefined; readonly exif: undefined } | undefined
> {
  try {
    const source = sharp(pixels, { raw: { width, height, channels: 4 } })
    const sized =
      target.width === width && target.height === height
        ? source
        : source.resize(target.width, target.height, { fit: 'fill' })
    const encoded = await encoders[format](sized, target.quality).toBuffer()
    const meta = await sharp(encoded).metadata()
    if (meta.orientation !== undefined || meta.exif !== undefined) return undefined
    if (meta.width !== target.width || meta.height !== target.height) return undefined
    return { bytes: encoded, orientation: undefined, exif: undefined }
  } catch {
    return undefined
  }
}
