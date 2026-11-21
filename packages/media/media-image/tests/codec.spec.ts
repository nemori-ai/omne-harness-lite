import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { VariantTarget } from '@omne-harness/media-contract'
import { createImageCodec } from '@omne-harness/media-image'

const codec = createImageCodec({
  maxWidth: 256,
  maxHeight: 256,
  maxDecodedBytes: 256 * 256 * 4,
  concurrency: 2,
})

/** Pixels that do not compress to nothing, so that quality shows in the size. */
function noise(width: number, height: number, alpha = 255) {
  const raw = Buffer.alloc(width * height * 4)
  let seed = 7
  for (let at = 0; at < raw.length; at += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[at] = seed & 0xff
    raw[at + 1] = (seed >> 8) & 0xff
    raw[at + 2] = (seed >> 16) & 0xff
    raw[at + 3] = alpha
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
}
const flat = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } } })
const target = (extra: Partial<VariantTarget> = {}): VariantTarget => ({
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 1 << 20,
  maxWidth: 256,
  maxHeight: 256,
  ...extra,
})
async function fitted(bytes: Uint8Array, to: VariantTarget) {
  const answer = await codec.fit(bytes, to)
  if ('failure' in answer) throw new Error(answer.failure.kind)
  const meta = await sharp(answer.ok.bytes).metadata()
  expect([`image/${meta.format}`, meta.width, meta.height]).toEqual([
    answer.ok.mediaType,
    answer.ok.widthPixels,
    answer.ok.heightPixels,
  ])
  return answer.ok
}

describe('probe', () => {
  it('answers the type and the size of a png, a jpeg and a webp', async () => {
    for (const format of ['png', 'jpeg', 'webp'] as const)
      expect(await codec.probe(await flat(40, 20).toFormat(format).toBuffer())).toEqual({
        ok: { mediaType: `image/${format}`, widthPixels: 40, heightPixels: 20 },
      })
  })

  it('answers the size as it is shown when the picture carries a rotation', async () => {
    const turned = await flat(40, 20).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    expect(await codec.probe(turned)).toMatchObject({ ok: { widthPixels: 20, heightPixels: 40 } })
  })

  it('answers not-image for bytes that are no picture, and for a picture cut short', async () => {
    const png = await flat(40, 20).png().toBuffer()
    for (const bytes of [
      new Uint8Array(0),
      Buffer.from('%PDF-1.7 not a picture'),
      png.subarray(0, 40),
    ])
      expect(await codec.probe(bytes)).toEqual({ failure: { kind: 'not-image' } })
  })

  it('answers unsupported for a picture of several frames', async () => {
    const png = await flat(8, 8).png().toBuffer()
    const header = 8 + 12 + png.readUInt32BE(8)
    const body = Buffer.concat([Buffer.from('acTL'), Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])])
    const sized = Buffer.alloc(4)
    sized.writeUInt32BE(8)
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(body) >>> 0)
    const animated = Buffer.concat([
      png.subarray(0, header),
      sized,
      body,
      sum,
      png.subarray(header),
    ])
    expect(await codec.probe(animated)).toEqual({ failure: { kind: 'unsupported' } })
  })

  it('answers over-budget for a picture larger than the codec may decode', async () => {
    expect(await codec.probe(await flat(257, 8).png().toBuffer())).toEqual({
      failure: { kind: 'over-budget' },
    })
  })
})

describe('fit', () => {
  it('scales into both limits and keeps the proportions', async () => {
    const wide = await flat(200, 100).png().toBuffer()
    expect(await fitted(wide, target({ maxWidth: 50, maxHeight: 80 }))).toMatchObject({
      mediaType: 'image/png',
      widthPixels: 50,
      heightPixels: 25,
    })
    expect(await fitted(wide, target({ maxWidth: 150, maxHeight: 30 }))).toMatchObject({
      widthPixels: 60,
      heightPixels: 30,
    })
    expect(
      await fitted(await flat(200, 1).png().toBuffer(), target({ maxWidth: 10 })),
    ).toMatchObject({
      widthPixels: 10,
      heightPixels: 1,
    })
  })

  it('goes down the quality ladder until the bytes fit, and stops at the first step that does', async () => {
    const picture = await noise(64, 64).png().toBuffer()
    const sizeAt = async (quality: number) =>
      (await noise(64, 64).jpeg({ quality }).toBuffer()).byteLength
    const [high, middle, low] = [await sizeAt(85), await sizeAt(75), await sizeAt(60)]
    expect(high).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(low)
    const only = { mediaTypes: ['image/jpeg'] }
    expect((await fitted(picture, target({ ...only, maxBytes: high }))).bytes.byteLength).toBe(high)
    expect((await fitted(picture, target({ ...only, maxBytes: high - 1 }))).bytes.byteLength).toBe(
      middle,
    )
    expect(
      (await fitted(picture, target({ ...only, maxBytes: middle - 1 }))).bytes.byteLength,
    ).toBe(low)
    expect(await codec.fit(picture, target({ ...only, maxBytes: low - 1 }))).toEqual({
      failure: { kind: 'cannot-fit' },
    })
  })

  it('keeps the type of the picture when it is allowed and fits; otherwise an opaque picture becomes a jpeg', async () => {
    const png = await noise(64, 64).png().toBuffer()
    expect((await fitted(png, target({ maxWidth: 32 }))).mediaType).toBe('image/png')
    expect(
      (await fitted(png, target({ mediaTypes: ['image/webp', 'image/jpeg'] }))).mediaType,
    ).toBe('image/jpeg')
    const lossless = (await noise(32, 32).png().toBuffer()).byteLength
    const answer = await fitted(png, target({ maxWidth: 32, maxBytes: lossless - 1 }))
    expect(answer.mediaType).toBe('image/jpeg')
    expect(answer.bytes.byteLength).toBeLessThan(lossless)
  })

  it('never drops what shows through: a webp or a png, or it cannot fit', async () => {
    const glass = await noise(64, 64, 128).png().toBuffer()
    const webp = await fitted(glass, target({ mediaTypes: ['image/jpeg', 'image/webp'] }))
    expect(webp.mediaType).toBe('image/webp')
    const { data } = await sharp(webp.bytes).raw().toBuffer({ resolveWithObject: true })
    expect(Math.max(...[...data].filter((_, at) => at % 4 === 3))).toBeLessThan(255)
    expect(await codec.fit(glass, target({ mediaTypes: ['image/jpeg'] }))).toEqual({
      failure: { kind: 'cannot-fit' },
    })
  })

  it('answers not-image for bytes that are no picture and cannot-fit for one it may not decode', async () => {
    expect(await codec.fit(Buffer.from('plain text'), target())).toEqual({
      failure: { kind: 'not-image' },
    })
    expect(await codec.fit(await flat(257, 8).png().toBuffer(), target({ maxWidth: 16 }))).toEqual({
      failure: { kind: 'cannot-fit' },
    })
  })

  it('makes every version when more are asked at once than it decodes at once', async () => {
    const picture = await flat(64, 64).png().toBuffer()
    const answers = await Promise.all(
      Array.from({ length: 9 }, (_, at) => codec.fit(picture, target({ maxWidth: 8 + at }))),
    )
    expect(
      answers.map(answer => ('ok' in answer ? answer.ok.widthPixels : answer.failure.kind)),
    ).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16])
  })
})
