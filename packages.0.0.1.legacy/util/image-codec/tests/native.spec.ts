import sharp from 'sharp'
import { expect, test } from 'vitest'
import { crc32 } from 'node:zlib'
import { createSharpImageCodec, type ImageEncodeSpec } from '../src/index.ts'

const limits = { maxPixels: 65536, maxDimension: 256 }
const spec: ImageEncodeSpec = {
  format: 'png',
  width: 2,
  height: 3,
  quality: null,
  pngCompressionLevel: 6,
  webpEffort: 4,
  alphaBackground: null,
}
const codec = createSharpImageCodec(sharp)

test('native invalid and unsupported input retains its failure category', async () => {
  const png = await image()
  expect(await codec.inspect(png.subarray(0, 36), limits)).toEqual({ failure: 'bad_input' })
  expect(await codec.inspect(Buffer.from('not an image'), limits)).toEqual({
    failure: 'unsupported',
  })
  expect(await codec.inspect(png, { ...limits, maxPixels: 0 })).toEqual({ failure: 'bad_input' })
})
async function image(format: 'png' | 'jpeg' | 'webp' = 'png') {
  return sharp({ create: { width: 4, height: 6, channels: 4, background: '#ff008080' } })
    [format]()
    .toBuffer()
}
async function decoded(bytes: Uint8Array) {
  const metadata = await codec.inspect(bytes, limits)
  if ('failure' in metadata) throw new Error(metadata.failure)
  const result = await codec.decode(bytes, metadata.ok, limits)
  if ('failure' in result) throw new Error(result.failure)
  return result.ok
}
test.each(['png', 'jpeg', 'webp'] as const)(
  'native %s inspect, decode and encode produce independently readable bytes',
  async format => {
    const bytes = await image(format),
      handle = await decoded(bytes)
    try {
      const output = await handle.encode({
        ...spec,
        format,
        quality: format === 'png' ? null : 80,
        alphaBackground: format === 'jpeg' ? { r: 255, g: 255, b: 255 } : null,
      })
      if ('failure' in output) throw new Error(output.failure)
      const observed = await sharp(output.ok.bytes).metadata()
      expect([observed.format, observed.width, observed.height]).toEqual([format, 2, 3])
      expect([output.ok.mediaType, output.ok.width, output.ok.height]).toEqual([
        `image/${format}`,
        2,
        3,
      ])
    } finally {
      await handle.close()
    }
  },
)
test('close prevents new encoding and awaits already started native encoding', async () => {
  const handle = await decoded(await image())
  const task = handle.encode(spec),
    close = handle.close()
  expect(handle.close()).toBe(close)
  expect(await handle.encode(spec)).toEqual({ failure: 'unavailable' })
  await close
  expect(await task).toHaveProperty('ok')
})
test('decode verifies metadata and dimensions; encode rejects invalid alpha and format policies', async () => {
  const bytes = await image(),
    metadata = await codec.inspect(bytes, limits)
  if ('failure' in metadata) throw new Error(metadata.failure)
  expect(await codec.decode(bytes, { ...metadata.ok, width: 5 }, limits)).toEqual({
    failure: 'bad_input',
  })
  expect(await codec.decode(bytes, metadata.ok, { ...limits, maxDimension: 1 })).toEqual({
    failure: 'internal',
  })
  const handle = await decoded(bytes)
  try {
    expect(await handle.encode({ ...spec, format: 'jpeg', quality: 80 })).toEqual({
      failure: 'unsupported',
    })
    expect(await handle.encode({ ...spec, quality: 80 })).toEqual({ failure: 'bad_input' })
    expect(await handle.encode({ ...spec, width: 0 })).toEqual({ failure: 'bad_input' })
  } finally {
    await handle.close()
  }
})
test('EXIF orientation changes raster dimensions but does not change original bytes', async () => {
  const bytes = await sharp(await image())
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const original = Buffer.from(bytes),
    handle = await decoded(bytes)
  try {
    expect([handle.width, handle.height]).toEqual([6, 4])
    expect(bytes).toEqual(original)
  } finally {
    await handle.close()
  }
})
test('PNG animation framing is checked rather than silently accepting the default raster', async () => {
  const source = await image(),
    chunk = Buffer.alloc(20)
  chunk.writeUInt32BE(8, 0)
  chunk.write('acTL', 4)
  chunk.writeUInt32BE(2, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 16)), 16)
  const animated = Buffer.concat([source.subarray(0, 33), chunk, source.subarray(33)])
  expect(await codec.inspect(animated, limits)).toHaveProperty('ok.pages', 2)
  chunk[16] = chunk[16]! ^ 1
  expect(
    await codec.inspect(
      Buffer.concat([source.subarray(0, 33), chunk, source.subarray(33)]),
      limits,
    ),
  ).toEqual({ failure: 'bad_input' })
})
