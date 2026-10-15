import sharp from 'sharp'

type ImageFormat = 'png' | 'jpeg' | 'webp'

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
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.data.length !== estimate) {
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
): Promise<{ readonly bytes: Buffer; readonly orientation: undefined; readonly exif: undefined } | undefined> {
  try {
    let pipeline = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (format === 'png') pipeline = pipeline.png()
    if (format === 'jpeg') pipeline = pipeline.jpeg()
    if (format === 'webp') pipeline = pipeline.webp()
    const encoded = await pipeline.toBuffer()
    const meta = await sharp(encoded).metadata()
    if (meta.orientation !== undefined || meta.exif !== undefined) return undefined
    if (meta.width !== width || meta.height !== height) return undefined
    return { bytes: encoded, orientation: undefined, exif: undefined }
  } catch {
    return undefined
  }
}
