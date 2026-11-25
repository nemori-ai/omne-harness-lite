import { crc32, deflateSync, inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { pointPicture } from '../src/index.ts'
import { readPng, writePng, type Pixels } from '../src/ink/png.ts'

const NEAR = 480
const RING = (21 * 56) / 64
const REACH = RING + 12

interface Plain {
  readonly width: number
  readonly height: number
  readonly channels: 3 | 4
  readonly data: Uint8Array
}

function made(width: number, height: number, channels: 3 | 4 = 3): Plain {
  const data = new Uint8Array(width * height * channels)
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * channels
      data.set([x & 0xff, y & 0xff, ((x >> 8) << 4) | (y >> 8)], at)
      if (channels === 4) data[at + 3] = 0
    }
  return { width, height, channels, data }
}

function chunksOf(png: Uint8Array): { type: string; body: Uint8Array }[] {
  const found: { type: string; body: Uint8Array }[] = []
  const view = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  let at = 8
  while (at < png.length) {
    const length = view.readUInt32BE(at)
    const type = view.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    expect(view.readUInt32BE(at + 8 + length)).toBe(crc32(png.subarray(at + 4, at + 8 + length)))
    found.push({ type, body })
    at += length + 12
  }
  return found
}

function nodeRead(png: Uint8Array): Plain {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const found = chunksOf(png)
  const head = Buffer.from(found[0]!.body)
  expect(found[0]!.type).toBe('IHDR')
  expect(found.at(-1)!.type).toBe('IEND')
  const [width, height] = [head.readUInt32BE(0), head.readUInt32BE(4)]
  expect(head[8]).toBe(8)
  expect(head[12]).toBe(0)
  const channels = head[9] === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(found.filter(c => c.type === 'IDAT').map(c => c.body)))
  const stride = width * channels
  const data = new Uint8Array(height * stride)
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (stride + 1)]).toBe(0)
    data.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride)
  }
  return { width, height, channels, data }
}

const FILTERS = [
  (_a: number, _b: number, _c: number) => 0,
  (a: number) => a,
  (_a: number, b: number) => b,
  (a: number, b: number) => (a + b) >>> 1,
  (a: number, b: number, c: number) => {
    const p = a + b - c
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  },
]

function nodeChunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

function nodeWrite(
  { width, height, channels, data }: Plain,
  options: { depth?: number; colour?: number; interlace?: number; filter?: (y: number) => number },
): Uint8Array {
  const stride = width * channels
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    const filter = options.filter?.(y) ?? 0
    raw[y * (stride + 1)] = filter
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? data[y * stride + i - channels]! : 0
      const b = y > 0 ? data[(y - 1) * stride + i]! : 0
      const c = i >= channels && y > 0 ? data[(y - 1) * stride + i - channels]! : 0
      raw[y * (stride + 1) + 1 + i] =
        (data[y * stride + i]! - (FILTERS[filter]?.(a, b, c) ?? 0)) & 0xff
    }
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = options.depth ?? 8
  head[9] = options.colour ?? (channels === 4 ? 6 : 2)
  head[12] = options.interlace ?? 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    nodeChunk('IHDR', head),
    nodeChunk('IDAT', deflateSync(raw)),
    nodeChunk('IEND', new Uint8Array(0)),
  ])
}

/** A header that says 4 by 4, and megabytes of image data behind it. */
function swollen(): Uint8Array {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(4, 0)
  head.writeUInt32BE(4, 4)
  head[8] = 8
  head[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    nodeChunk('IHDR', head),
    nodeChunk('IDAT', deflateSync(Buffer.alloc(4_000_000))),
    nodeChunk('IEND', new Uint8Array(0)),
  ])
}

const pixel = (picture: Plain, x: number, y: number): number[] => {
  const at = (Math.floor(y) * picture.width + Math.floor(x)) * picture.channels
  return [...picture.data.subarray(at, at + picture.channels)]
}

function changedOnlyNear(before: Plain, after: Plain, x: number, y: number, scale: number): void {
  let [changed, farthest] = [0, 0]
  for (let i = 0; i < before.data.length; i += 1) {
    if (before.data[i] === after.data[i]) continue
    const at = Math.floor(i / before.channels)
    const [px, py] = [at % before.width, Math.floor(at / before.width)]
    changed += 1
    farthest = Math.max(farthest, Math.hypot(px + 0.5 - x * scale, py + 0.5 - y * scale))
  }
  expect(changed).toBeGreaterThan(0)
  expect(farthest).toBeLessThan(REACH * scale)
}

function crop(picture: Plain, box: { x: number; y: number; width: number; height: number }): Plain {
  const stride = picture.width * picture.channels
  const data = new Uint8Array(box.width * box.height * picture.channels)
  for (let row = 0; row < box.height; row += 1) {
    const from = (box.y + row) * stride + box.x * picture.channels
    data.set(
      picture.data.subarray(from, from + box.width * picture.channels),
      row * box.width * picture.channels,
    )
  }
  return { width: box.width, height: box.height, channels: picture.channels, data }
}

const ringProbe = (picture: Plain, x: number, y: number, scale: number): [number, number] =>
  (y + RING) * scale < picture.height
    ? [x * scale, (y + RING) * scale]
    : [(x - RING) * scale, y * scale]

describe('the PNG it writes and reads', () => {
  it('writes a PNG that zlib reads back to the same pixels, rows with filter 0', async () => {
    for (const channels of [3, 4] as const) {
      const picture = made(37, 21, channels)
      expect(nodeRead(await writePng(picture))).toEqual(picture)
    }
  })

  it('reads rows of every filter, in RGB and RGBA', async () => {
    for (const channels of [3, 4] as const) {
      const picture = made(29, 15, channels)
      const png = nodeWrite(picture, { filter: y => y % 5 })
      const read: Pixels = await readPng(png)
      expect(read).toEqual(picture)
    }
  })

  it.each([
    [
      'bytes that are not a PNG',
      () => new TextEncoder().encode('not a picture at all'),
      /not a PNG/,
    ],
    ['16 bits a channel', () => nodeWrite(made(4, 4), { depth: 16 }), /bit depth 16/],
    ['a palette', () => nodeWrite(made(4, 4), { colour: 3 }), /colour type 3/],
    ['grey', () => nodeWrite(made(4, 4), { colour: 0 }), /colour type 0/],
    ['interlaced', () => nodeWrite(made(4, 4), { interlace: 1 }), /interlaced/],
    ['a row filter it does not know', () => nodeWrite(made(4, 4), { filter: () => 7 }), /filter 7/],
    ['image data that inflates past what its size says', () => swollen(), /longer than its size/],
  ])('refuses %s with the reason, and answers no picture', async (_name, png, reason) => {
    await expect(readPng(png())).rejects.toThrow(reason)
    await expect(pointPicture(png(), { x: 1, y: 1 }, 1)).rejects.toThrow(reason)
  })
})

describe('circling a point (FE-I67)', () => {
  const SCALE = 2
  const picture = made(1200, 1000)

  it.each([
    ['in the middle', 300, 250, { x: 120, y: 20, width: 960, height: 960 }],
    ['at the top edge', 300, 0, { x: 120, y: 0, width: 960, height: 480 }],
    ['near the left edge', 4, 250, { x: 0, y: 20, width: 488, height: 960 }],
    ['in the top left corner', 0, 0, { x: 0, y: 0, width: 480, height: 480 }],
    ['in the bottom right corner', 590, 490, { x: 700, y: 500, width: 500, height: 500 }],
  ])(
    '%s: the circled one keeps the size and changes only round the point; the close look is the 480-point square round it, cut at the picture, with no circle',
    async (_name, x, y, near) => {
      const png = await writePng(picture)
      const answered = await pointPicture(png, { x, y }, SCALE)
      expect(answered).toHaveLength(2)
      const [circled, look] = answered.map(nodeRead) as [Plain, Plain]
      expect([circled.width, circled.height, circled.channels]).toEqual([1200, 1000, 3])
      changedOnlyNear(picture, circled, x, y, SCALE)
      const [rx, ry] = ringProbe(picture, x, y, SCALE)
      expect(pixel(circled, rx, ry)).not.toEqual(pixel(picture, rx, ry))
      expect({ width: look.width, height: look.height }).toEqual({
        width: near.width,
        height: near.height,
      })
      expect(pixel(look, 0, 0)).toEqual(pixel(picture, near.x, near.y))
      expect(pixel(look, look.width - 1, look.height - 1)).toEqual(
        pixel(picture, near.x + near.width - 1, near.y + near.height - 1),
      )
      expect(Buffer.compare(look.data, crop(picture, near).data)).toBe(0)
    },
  )

  it('at scale 1 the close look is 480 pixels a side', async () => {
    const small = made(700, 600)
    const [, look] = await pointPicture(await writePng(small), { x: 350, y: 300 }, 1)
    const read = nodeRead(look!)
    expect([read.width, read.height]).toEqual([NEAR, NEAR])
    expect(pixel(read, 0, 0)).toEqual(pixel(small, 110, 60))
  })

  it('keeps RGBA as RGBA and puts ink on a clear picture', async () => {
    const clear = made(200, 200, 4)
    const [circled] = await pointPicture(await writePng(clear), { x: 100, y: 100 }, 1)
    const read = nodeRead(circled!)
    expect(read.channels).toBe(4)
    expect(pixel(read, 100, 100 + RING)[3]).toBeGreaterThan(0)
    expect(pixel(read, 100, 100)[3]).toBe(0)
  })

  it.each([
    ['left of it', -1, 250],
    ['right of it, at its width', 600, 250],
    ['above it', 300, -0.5],
    ['below it, at its height', 300, 500],
  ])('a point %s: only the picture, its bytes as they came', async (_name, x, y) => {
    const png = await writePng(picture)
    const answered = await pointPicture(png, { x, y }, SCALE)
    expect(answered).toHaveLength(1)
    expect(Buffer.compare(answered[0]!, png)).toBe(0)
  })

  it('the same input answers the same bytes', async () => {
    const png = await writePng(made(300, 200))
    const first = await pointPicture(png, { x: 120, y: 80 }, 1)
    const second = await pointPicture(png, { x: 120, y: 80 }, 1)
    expect(second).toHaveLength(2)
    second.forEach((bytes, i) => expect(Buffer.compare(bytes, first[i]!)).toBe(0))
  })
})
