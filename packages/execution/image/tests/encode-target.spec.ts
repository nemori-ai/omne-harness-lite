import sharp from 'sharp'
import { expect, it } from 'vitest'
import { imageBudget, open, type OpenImageHandle } from '@omne-harness/image'

const SIDE = 64

async function opened(bytes: Uint8Array): Promise<{ handle: OpenImageHandle; opaque: boolean }> {
  const created = imageBudget({
    formats: ['image/png', 'image/jpeg', 'image/webp'],
    maxWidth: SIDE,
    maxHeight: SIDE,
    maxDecodedBytes: SIDE * SIDE * 4,
    maxConcurrentDecodes: 2,
    maxInFlightBytes: SIDE * SIDE * 4 * 2,
  })
  if (created.kind !== 'budget') throw new Error(created.reason)
  const result = await open({ bytes, budget: created.budget })
  if (result.kind !== 'opened') throw new Error(result.reason)
  return result
}

/** Pixels that do not compress to nothing, so that quality shows in the size. */
function noise(alpha: number): Buffer {
  const raw = Buffer.alloc(SIDE * SIDE * 4)
  let seed = 7
  for (let at = 0; at < raw.length; at += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[at] = seed & 0xff
    raw[at + 1] = (seed >> 8) & 0xff
    raw[at + 2] = (seed >> 16) & 0xff
    raw[at + 3] = alpha
  }
  return raw
}
const png = (alpha: number): Promise<Buffer> =>
  sharp(noise(alpha), { raw: { width: SIDE, height: SIDE, channels: 4 } })
    .png()
    .toBuffer()

it('encodes to a target size no larger than the picture', async () => {
  const { handle } = await opened(await png(255))
  const encoded = await handle.encode({ format: 'jpeg', width: 16, height: 8 })
  expect(encoded.kind).toBe('encoded')
  if (encoded.kind !== 'encoded') return
  const meta = await sharp(encoded.bytes).metadata()
  expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 16, 8])
  await handle.close()
})

it('encodes fewer bytes at a lower quality, for the two lossy formats', async () => {
  const { handle } = await opened(await png(255))
  for (const format of ['jpeg', 'webp'] as const) {
    const high = await handle.encode({ format, quality: 85 })
    const low = await handle.encode({ format, quality: 30 })
    if (high.kind !== 'encoded' || low.kind !== 'encoded') throw new Error(format)
    expect(low.bytes.byteLength).toBeLessThan(high.bytes.byteLength)
  }
  await handle.close()
})

it('refuses a target larger than the picture, or one that is not a whole positive size', async () => {
  const { handle } = await opened(await png(255))
  for (const size of [
    { width: SIDE + 1, height: SIDE },
    { width: SIDE, height: SIDE + 1 },
    { width: 0, height: 8 },
    { width: 8.5, height: 8 },
    { width: 8 },
  ])
    expect(await handle.encode({ format: 'png', ...size })).toEqual({
      kind: 'rejected',
      reason: 'encode',
    })
  for (const quality of [0, 101, 50.5])
    expect(await handle.encode({ format: 'jpeg', quality })).toEqual({
      kind: 'rejected',
      reason: 'encode',
    })
  await handle.close()
})

it('reports whether every pixel is opaque, and a resized webp keeps what is not', async () => {
  expect((await opened(await png(255))).opaque).toBe(true)
  const { handle, opaque } = await opened(await png(128))
  expect(opaque).toBe(false)
  const encoded = await handle.encode({ format: 'webp', width: 16, height: 16, quality: 60 })
  if (encoded.kind !== 'encoded') throw new Error(encoded.reason)
  const { data } = await sharp(encoded.bytes).raw().toBuffer({ resolveWithObject: true })
  const alphas = [...data].filter((_, at) => at % 4 === 3)
  expect(alphas).toHaveLength(16 * 16)
  expect(Math.max(...alphas)).toBeLessThan(255)
  await handle.close()
})
