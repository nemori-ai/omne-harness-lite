import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { imageBudget, open, type BudgetInput, type ImageBudget, type ImageFormat } from '@omne-harness/image'

const allFormats = ['image/png', 'image/jpeg', 'image/webp'] as const

function budget(overrides: Partial<BudgetInput> = {}): ImageBudget {
  const created = imageBudget({
    formats: allFormats,
    maxWidth: 64,
    maxHeight: 64,
    maxDecodedBytes: 64 * 64 * 4,
    maxConcurrentDecodes: 2,
    maxInFlightBytes: 64 * 64 * 4 * 2,
    ...overrides,
  })
  if (created.kind !== 'budget') throw new Error(created.reason)
  return created.budget
}

async function pixels(format: ImageFormat, width: number, height: number, orientation?: number): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
  if (orientation !== undefined) pipeline = pipeline.withMetadata({ orientation })
  if (format === 'png') pipeline = pipeline.png()
  if (format === 'jpeg') pipeline = pipeline.jpeg()
  if (format === 'webp') pipeline = pipeline.webp()
  return pipeline.toBuffer()
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

function withActl(png: Buffer, frames: number): Buffer {
  const size = png.readUInt32BE(8)
  const split = 8 + 12 + size
  const data = Buffer.alloc(8)
  data.writeUInt32BE(frames)
  return Buffer.concat([png.subarray(0, split), chunk('acTL', data), png.subarray(split)])
}

function corruptIdat(png: Buffer): Buffer {
  const copy = Buffer.from(png)
  let offset = 8
  while (offset + 12 <= copy.length) {
    const size = copy.readUInt32BE(offset)
    const type = copy.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT' && size > 0) {
      copy[offset + 8] = copy[offset + 8]! ^ 0xff
      const body = copy.subarray(offset + 4, offset + 8 + size)
      copy.writeUInt32BE(crc32(body) >>> 0, offset + 8 + size)
      return copy
    }
    offset += 12 + size
  }
  throw new Error('fixture has no IDAT')
}

function declaredPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IEND', Buffer.alloc(0))])
}

function animatedWebp(): Buffer {
  const payload = Buffer.alloc(10)
  payload[0] = 0x02
  payload.writeUIntLE(7, 4, 3)
  payload.writeUIntLE(3, 7, 3)
  const piece = Buffer.concat([Buffer.from('VP8X'), Buffer.alloc(4), payload])
  piece.writeUInt32LE(payload.length, 4)
  const riff = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), piece])
  riff.writeUInt32LE(4 + piece.length, 4)
  return riff
}

it('rejects a small png that declares a large frame before a raster exists', async () => {
  const bytes = declaredPng(4096, 4096)
  const gate = budget({
    maxWidth: 4096,
    maxHeight: 4096,
    maxDecodedBytes: 1024,
    maxInFlightBytes: 4096 * 4096 * 4,
  })
  const pending = open({ bytes, budget: gate })
  expect(bytes.byteLength).toBeLessThan(100)
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  expect(await pending).toEqual({ kind: 'rejected', reason: 'decoded-bytes' })
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it('rejects an illegal budget and starts a legal one at zero', async () => {
  expect(imageBudget({ ...budgetInput(), formats: [] })).toEqual({ kind: 'rejected', reason: 'formats' })
  expect(imageBudget({ ...budgetInput(), formats: ['image/png', 'image/png'] })).toEqual({
    kind: 'rejected',
    reason: 'formats',
  })
  expect(imageBudget({ ...budgetInput(), formats: ['image/gif'] as unknown as BudgetInput['formats'] })).toEqual({
    kind: 'rejected',
    reason: 'formats',
  })
  expect(imageBudget({ ...budgetInput(), maxWidth: 0 })).toEqual({ kind: 'rejected', reason: 'max-width' })
  expect(imageBudget({ ...budgetInput(), maxHeight: Number.NaN })).toEqual({
    kind: 'rejected',
    reason: 'max-height',
  })
  expect(imageBudget({ ...budgetInput(), maxDecodedBytes: Number.POSITIVE_INFINITY })).toEqual({
    kind: 'rejected',
    reason: 'max-decoded-bytes',
  })
  expect(imageBudget({ ...budgetInput(), maxConcurrentDecodes: -1 })).toEqual({
    kind: 'rejected',
    reason: 'max-concurrent',
  })
  expect(imageBudget({ ...budgetInput(), maxInFlightBytes: 0 })).toEqual({
    kind: 'rejected',
    reason: 'max-in-flight-bytes',
  })
  expect(
    imageBudget({
      maxWidth: 1,
      maxHeight: 1,
      maxDecodedBytes: 4,
      maxConcurrentDecodes: 1,
      maxInFlightBytes: 4,
    } as BudgetInput),
  ).toEqual({ kind: 'rejected', reason: 'formats' })

  const formats = ['image/png'] as ['image/png']
  const owned = imageBudget({ ...budgetInput(), formats })
  formats[0] = 'image/jpeg' as 'image/png'
  expect(owned.kind).toBe('budget')
  if (owned.kind !== 'budget') return
  const png = await pixels('png', 8, 4)
  const opened = await open({ bytes: png, budget: owned.budget })
  expect(opened.kind).toBe('opened')
  if (opened.kind === 'opened') await opened.handle.close()
  expect(owned.budget.heldReservation()).toEqual({ count: 0, bytes: 0 })
  expect('maxWidth' in owned.budget).toBe(false)
  expect(Object.keys(owned.budget)).toEqual(['heldReservation'])
})

it('rejects empty, truncated, foreign, and multi-frame bytes before taking a reservation', async () => {
  const png = await pixels('png', 8, 4)
  const cases = [
    { bytes: new Uint8Array(), reason: 'empty' },
    { bytes: png.subarray(0, 12), reason: 'truncated' },
    { bytes: Buffer.from('GIF89a'), reason: 'not-image' },
    { bytes: Buffer.from('not an image'), reason: 'not-image' },
    { bytes: withActl(png, 2), reason: 'multi-frame' },
    { bytes: animatedWebp(), reason: 'multi-frame' },
  ] as const
  for (const item of cases) {
    const gate = budget()
    const opened = await open({ bytes: item.bytes, budget: gate })
    expect(opened).toEqual({ kind: 'rejected', reason: item.reason })
    expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  }
})

it('rejects a dimension or decoded-byte overrun before taking a reservation', async () => {
  const png = await pixels('png', 8, 4)
  const wide = budget({ maxWidth: 7 })
  expect(await open({ bytes: png, budget: wide })).toEqual({ kind: 'rejected', reason: 'width' })
  expect(wide.heldReservation()).toEqual({ count: 0, bytes: 0 })

  const tall = budget({ maxHeight: 3 })
  expect(await open({ bytes: png, budget: tall })).toEqual({ kind: 'rejected', reason: 'height' })
  expect(tall.heldReservation()).toEqual({ count: 0, bytes: 0 })

  const heavy = budget({ maxDecodedBytes: 8 * 4 * 4 - 1 })
  expect(await open({ bytes: png, budget: heavy })).toEqual({ kind: 'rejected', reason: 'decoded-bytes' })
  expect(heavy.heldReservation()).toEqual({ count: 0, bytes: 0 })

  const jpegOnly = budget({ formats: ['image/jpeg'] })
  expect(await open({ bytes: png, budget: jpegOnly })).toEqual({ kind: 'rejected', reason: 'format' })
  expect(jpegOnly.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it('opens one frame, keeps the input bytes, and releases the reservation on close', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await pixels(format, 8, 4)
    const gate = budget()
    const opened = await open({ bytes, budget: gate })
    expect(opened.kind).toBe('opened')
    if (opened.kind !== 'opened') continue
    expect(Buffer.from(opened.verifiedBytes).equals(bytes)).toBe(true)
    expect(opened.declaration).toEqual({
      mediaType: `image/${format}`,
      orientedWidth: 8,
      orientedHeight: 4,
      trusted: false,
    })
    expect(gate.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
    const closed = await opened.handle.close()
    expect(closed.kind).toBe('closed')
    if (closed.kind !== 'closed') continue
    expect(closed.handle.reservation).toBe('released')
    expect(closed.handle.nativeStop).toBe('not-proven')
    expect(closed.handle.phase).toBe('closed')
    const again = await opened.handle.close()
    expect(again.kind).toBe('closed')
    if (again.kind === 'closed') expect(again.handle).toBe(closed.handle)
    expect(await closed.handle.close()).toBe(closed.handle)
    expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  }
})

it('budgets orientation 5 through 8 on png, jpeg, and webp', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await pixels(format, 8, 4, 6)
    const tight = budget({ maxWidth: 8, maxHeight: 4 })
    const pending = open({ bytes, budget: tight })
    expect(tight.heldReservation()).toEqual({ count: 0, bytes: 0 })
    expect(await pending).toEqual({ kind: 'rejected', reason: 'height' })

    const gate = budget({ maxWidth: 4, maxHeight: 8, maxDecodedBytes: 4 * 8 * 4 })
    const opened = await open({ bytes, budget: gate })
    expect(opened.kind).toBe('opened')
    if (opened.kind !== 'opened') continue
    expect(opened.declaration.orientedWidth).toBe(4)
    expect(opened.declaration.orientedHeight).toBe(8)
    await opened.handle.close()
  }
})

it('opens a lossless webp as a single frame', async () => {
  const bytes = await sharp({
    create: { width: 8, height: 4, channels: 3, background: { r: 9, g: 8, b: 7 } },
  })
    .webp({ lossless: true })
    .toBuffer()
  const gate = budget()
  const opened = await open({ bytes, budget: gate })
  expect(opened.kind).toBe('opened')
  if (opened.kind !== 'opened') return
  expect(opened.declaration).toEqual({
    mediaType: 'image/webp',
    orientedWidth: 8,
    orientedHeight: 4,
    trusted: false,
  })
  await opened.handle.close()
})

it('rejects a png chunk whose crc does not match, without holding a reservation', async () => {
  const png = Buffer.from(await pixels('png', 8, 4))
  const size = png.readUInt32BE(8)
  const crcAt = 8 + 8 + size
  png.writeUInt32BE((png.readUInt32BE(crcAt) + 1) >>> 0, crcAt)
  const gate = budget()
  const pending = open({ bytes: png, budget: gate })
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  expect(await pending).toEqual({ kind: 'rejected', reason: 'truncated' })
})

it('rejects a png whose signature differs by one byte', async () => {
  const png = Buffer.from(await pixels('png', 8, 4))
  png[1] = 0x00
  const gate = budget()
  expect(await open({ bytes: png, budget: gate })).toEqual({ kind: 'rejected', reason: 'not-image' })
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it('rejects a scan that stops before the container ends, without holding a reservation', async () => {
  const jpeg = await pixels('jpeg', 8, 4)
  const scan = jpeg.indexOf(Buffer.from([0xff, 0xda]))
  const cut = jpeg.subarray(0, scan + 4)
  const gate = budget()
  const pending = open({ bytes: cut, budget: gate })
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  expect(await pending).toEqual({ kind: 'rejected', reason: 'truncated' })

  const header = Buffer.alloc(10)
  header.writeUIntLE(7, 4, 3)
  header.writeUIntLE(3, 7, 3)
  const piece = Buffer.concat([Buffer.from('VP8X'), Buffer.alloc(4), header])
  piece.writeUInt32LE(10, 4)
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), piece])
  webp.writeUInt32LE(4 + piece.length, 4)
  const bare = budget()
  const headerOnly = open({ bytes: webp, budget: bare })
  expect(bare.heldReservation()).toEqual({ count: 0, bytes: 0 })
  expect(await headerOnly).toEqual({ kind: 'rejected', reason: 'truncated' })
})

it('stays open when close runs during encode', async () => {
  const bytes = await pixels('png', 8, 4)
  const gate = budget()
  const opened = await open({ bytes, budget: gate })
  if (opened.kind !== 'opened') throw new Error(opened.reason)
  const encoding = opened.handle.encode({ format: 'jpeg' })
  const early = await opened.handle.close()
  expect(early).toEqual({ kind: 'still-open', handle: opened.handle })
  expect(gate.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  expect((await encoding).kind).toBe('encoded')
  const closed = await opened.handle.close()
  expect(closed.kind).toBe('closed')
  expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it('budgets orientation 5 through 8 on the swapped edges and leaves the input bytes intact', async () => {
  for (const orientation of [5, 6, 7, 8]) {
    const bytes = await pixels('jpeg', 8, 4, orientation)
    const source = Buffer.from(bytes)
    const tight = budget({ maxWidth: 8, maxHeight: 4 })
    expect(await open({ bytes, budget: tight })).toEqual({ kind: 'rejected', reason: 'height' })
    expect(tight.heldReservation()).toEqual({ count: 0, bytes: 0 })

    const gate = budget({ maxWidth: 4, maxHeight: 8, maxDecodedBytes: 4 * 8 * 4 })
    const opened = await open({ bytes, budget: gate })
    expect(opened.kind).toBe('opened')
    if (opened.kind !== 'opened') continue
    expect(opened.declaration.orientedWidth).toBe(4)
    expect(opened.declaration.orientedHeight).toBe(8)
    expect(Buffer.from(opened.verifiedBytes).equals(source)).toBe(true)
    expect(bytes.equals(source)).toBe(true)
    expect(gate.heldReservation()).toEqual({ count: 1, bytes: 4 * 8 * 4 })
    const encoded = await opened.handle.encode({ format: 'jpeg' })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') continue
    expect(encoded.orientation).toBe('absent')
    expect(encoded.exif).toBe('absent')
    const meta = await sharp(encoded.bytes).metadata()
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
    expect(meta.width).toBe(4)
    expect(meta.height).toBe(8)
    await opened.handle.close()
  }
})

it('encodes png, jpeg, and webp without moving the reservation or the verified bytes', async () => {
  const bytes = await pixels('png', 8, 4)
  const gate = budget()
  const opened = await open({ bytes, budget: gate })
  if (opened.kind !== 'opened') throw new Error(opened.reason)
  const before = Buffer.from(opened.verifiedBytes)
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const encoded = await opened.handle.encode({ format })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') continue
    expect(encoded.mediaType).toBe(`image/${format}`)
    const meta = await sharp(encoded.bytes).metadata()
    expect(meta.width).toBe(8)
    expect(meta.height).toBe(4)
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
    expect(gate.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
    expect(Buffer.from(opened.verifiedBytes).equals(before)).toBe(true)
  }
  const failed = await opened.handle.encode({ format: 'gif' as 'png' })
  expect(failed).toEqual({ kind: 'rejected', reason: 'encode' })
  expect(opened.handle.phase).toBe('open')
  await opened.handle.close()
  expect(await opened.handle.encode({ format: 'png' })).toEqual({ kind: 'rejected', reason: 'closed' })
})

it('rejects a full reservation and releases a reservation when decode fails before the handle exists', async () => {
  const bytes = await pixels('png', 8, 4)
  const gate = budget({ maxConcurrentDecodes: 1, maxInFlightBytes: 8 * 4 * 4 })
  const first = await open({ bytes, budget: gate })
  if (first.kind !== 'opened') throw new Error(first.reason)
  const pending = open({ bytes, budget: gate })
  expect(gate.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  expect(await pending).toEqual({ kind: 'rejected', reason: 'concurrent' })
  expect(gate.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  await first.handle.close()

  const roomy = budget({ maxConcurrentDecodes: 2, maxInFlightBytes: 8 * 4 * 4 })
  const held = await open({ bytes, budget: roomy })
  if (held.kind !== 'opened') throw new Error(held.reason)
  expect(await open({ bytes, budget: roomy })).toEqual({ kind: 'rejected', reason: 'in-flight-bytes' })
  expect(roomy.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  await held.handle.close()

  const broken = budget()
  const corrupt = corruptIdat(bytes)
  const failing = open({ bytes: corrupt, budget: broken })
  expect(broken.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  expect(await failing).toEqual({ kind: 'rejected', reason: 'decode' })
  expect(broken.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it(
  'keeps the reservation when a 1 ms caller timeout beats a 2048 px decode',
  { tags: ['slow'], timeout: 30_000 },
  async () => {
    const bytes = await pixels('png', 2048, 2048)
    const gate = budget({
      maxWidth: 2048,
      maxHeight: 2048,
      maxDecodedBytes: 2048 * 2048 * 4,
      maxInFlightBytes: 2048 * 2048 * 4,
    })
    const pending = open({ bytes, budget: gate })
    const raced = await Promise.race([
      pending.then(() => 'open' as const),
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 1)),
    ])
    expect(raced).toBe('timeout')
    expect(gate.heldReservation()).toEqual({ count: 1, bytes: 2048 * 2048 * 4 })
    const opened = await pending
    expect(opened.kind).toBe('opened')
    if (opened.kind !== 'opened') return
    expect(opened.handle.phase).toBe('open')
    await opened.handle.close()
    expect(gate.heldReservation()).toEqual({ count: 0, bytes: 0 })
  },
)

it('does not import Cordis from the root entry', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const built = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
  expect(source.includes('@deepseek-ai/cordis')).toBe(false)
  expect(source.includes('sharp')).toBe(false)
  expect(built.includes('@deepseek-ai/cordis')).toBe(false)
  expect(built.includes('sharp')).toBe(false)
})

function budgetInput(): BudgetInput {
  return {
    formats: allFormats,
    maxWidth: 64,
    maxHeight: 64,
    maxDecodedBytes: 64 * 64 * 4,
    maxConcurrentDecodes: 2,
    maxInFlightBytes: 64 * 64 * 4 * 2,
  }
}
