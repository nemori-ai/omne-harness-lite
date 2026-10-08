import sharp from 'sharp'
import { expect, test } from 'vitest'
import { createSharpImageCodec, validateCodec, bytesSchema, dataOnly } from '../src/index.ts'
const limits = { maxPixels: 1024, maxDimension: 32 }
test('shared codec validates and owns decoded handle without changing original bytes', async () => {
  const bytes = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#f004' } })
    .png()
    .toBuffer()
  const original = Buffer.from(bytes),
    codec = createSharpImageCodec(sharp)
  validateCodec(codec)
  const observed = await codec.inspect(bytes, limits)
  if ('failure' in observed) throw new Error(observed.failure)
  const result = await codec.decode(bytes, observed.ok, limits)
  if ('failure' in result) throw new Error(result.failure)
  expect([result.ok.width, result.ok.height]).toEqual([3, 4])
  expect(bytes).toEqual(original)
  await result.ok.close()
  await result.ok.close()
  expect(
    await result.ok.encode({
      format: 'png',
      width: 3,
      height: 4,
      quality: null,
      pngCompressionLevel: 6,
      webpEffort: 4,
      alphaBackground: null,
    }),
  ).toEqual({ failure: 'unavailable' })
})
test('descriptor guards reject proxies, getters and shared buffers without invoking getters', () => {
  let called = 0
  const hostile = Object.defineProperty({}, 'maxPixels', {
    get() {
      called++
      return 1024
    },
  })
  expect(dataOnly(hostile)).toBe(false)
  expect(called).toBe(0)
  expect(bytesSchema.safeParse(new Uint8Array(new SharedArrayBuffer(4))).success).toBe(false)
  expect(bytesSchema.safeParse(new Proxy(new Uint8Array(4), {})).success).toBe(false)
})
