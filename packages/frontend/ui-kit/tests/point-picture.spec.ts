import { crc32, deflateSync, inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { HAND, strokeSpine } from '../src/icons/brush.ts'
import { pointPicture } from '../src/index.ts'
import { OWN_CANVAS } from '../src/ink/brush-weight.ts'
import { CENTRE, circleLine, DEFAULT_HAND } from '../src/ink/ink.ts'
import { PICTURE_INK } from '../src/ink/point-picture.ts'
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

  it.each([
    ['fewer bytes than a signature', () => Uint8Array.of(137, 80, 78, 71), /not a PNG/],
    ['a chunk cut short', () => cut(nodeWrite(made(9, 7), {}), 20), /chunk IDAT is cut short/],
    ['no header', () => assembled([idatOf(made(4, 4))]), /no header/],
    ['no image data', () => assembled([ihdrOf(4, 4)]), /no image data/],
    ['no pixels', () => assembled([ihdrOf(0, 4), idatOf(made(4, 4))]), /no pixels/],
    [
      'image data shorter than its size',
      () => assembled([ihdrOf(4, 5), idatOf(made(4, 4))]),
      /image data is cut short/,
    ],
    [
      'image data that is not deflate',
      () => assembled([ihdrOf(4, 4), nodeChunk('IDAT', Uint8Array.of(1, 2, 3, 4, 5, 6))]),
      /does not inflate/,
    ],
  ])('refuses %s with the reason', async (_name, png, reason) => {
    await expect(readPng(png())).rejects.toThrow(reason)
    await expect(pointPicture(png(), { x: 1, y: 1 }, 1)).rejects.toThrow(reason)
  })

  it('reads past chunks it does not know, joins split image data and reads nothing after the end', async () => {
    const picture = made(23, 11, 4)
    const data = Buffer.from(deflateSync(Buffer.from(raw(picture))))
    const png = assembled([
      ihdrOf(23, 11, 6),
      nodeChunk('tEXt', new TextEncoder().encode('Comment\0hello')),
      nodeChunk('IDAT', data.subarray(0, 40)),
      nodeChunk('IDAT', data.subarray(40)),
      nodeChunk('IEND', new Uint8Array(0)),
      Uint8Array.of(0, 0, 0, 99, 0x74, 0x45, 0x58, 0x74, 1, 2),
    ])
    expect(await readPng(png)).toEqual(picture)
  })

  it('reads a row whose Paeth filter picks the pixel above and to the left', async () => {
    const data = new Uint8Array(8 * 8 * 3)
    for (let y = 0; y < 8; y += 1)
      for (let x = 0; x < 8; x += 1)
        data.fill(128 + 3 * x - 3 * y, (y * 8 + x) * 3, (y * 8 + x + 1) * 3)
    const picture: Plain = { width: 8, height: 8, channels: 3, data }
    expect(await readPng(nodeWrite(picture, { filter: () => 4 }))).toEqual(picture)
  })
})

function raw({ width, height, channels, data }: Plain): Uint8Array {
  const stride = width * channels
  const out = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y += 1)
    out.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  return out
}

function ihdrOf(width: number, height: number, colour = 2): Buffer {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8
  head[9] = colour
  return nodeChunk('IHDR', head)
}

const idatOf = (picture: Plain): Buffer => nodeChunk('IDAT', deflateSync(Buffer.from(raw(picture))))

const assembled = (chunks: readonly Uint8Array[]): Uint8Array =>
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks])

const cut = (png: Uint8Array, by: number): Uint8Array => png.subarray(0, png.length - by)

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

const UNIT = OWN_CANVAS.px / OWN_CANVAS.units
const LINE = circleLine(DEFAULT_HAND)
const STROKE = HAND.width * DEFAULT_HAND.weight * UNIT
const BREATH_TOP = 255 * PICTURE_INK.breathStrength
const breathAt = (away: number, scale: number): number =>
  Math.floor(BREATH_TOP * (1 - away / (PICTURE_INK.breath * scale)))
const paperAtMost = (scale: number): number => breathAt(0.5, scale)
const clearOfInk = (scale: number): number => breathAt(1, scale)
const SIZE = 120
const MIDDLE = SIZE / 2

type Axis = 'x' | 'y'

const flat = (
  channels: 3 | 4,
  colour: readonly number[],
  scale: number,
  side = SIZE * scale,
): Plain => {
  const data = new Uint8Array(side * side * channels)
  for (let at = 0; at < data.length; at += channels) data.set(colour.slice(0, channels), at)
  return { width: side, height: side, channels, data }
}

async function circledOn(picture: Plain, scale: number, at = { x: MIDDLE, y: MIDDLE }) {
  const [circled] = await pointPicture(await writePng(picture), at, scale)
  return nodeRead(circled!)
}

const onPicture = ([x, y]: readonly [number, number], scale: number): [number, number] => [
  MIDDLE * scale + (x - CENTRE[0]) * UNIT * scale,
  MIDDLE * scale + (y - CENTRE[1]) * UNIT * scale,
]

const alpha = (picture: Plain, x: number, y: number): number => pixel(picture, x, y)[3]!

const fromInk = (a: number, scale: number): number =>
  PICTURE_INK.breath * scale * (1 - a / BREATH_TOP)

function acrossStroke(clear: Plain, through: [number, number], axis: Axis, scale: number) {
  const [x, y] = through.map(Math.floor) as [number, number]
  const at = (step: number): number =>
    axis === 'x' ? alpha(clear, x + step, y) : alpha(clear, x, y + step)
  const own = axis === 'x' ? x : y
  const side = (sign: 1 | -1): { edge: number; breath: number[]; quiet: number } => {
    let step = 0
    while (at(step) > clearOfInk(scale)) step += sign
    const edge = own + step + 0.5 - sign * fromInk(at(step), scale)
    const breath: number[] = []
    for (; at(step) > 0; step += sign) breath.push(at(step))
    return { edge, breath, quiet: sign * (own + step + 0.5 - edge) }
  }
  const [low, high] = [side(-1), side(1)]
  return {
    middle: (low.edge + high.edge) / 2,
    half: (high.edge - low.edge) / 2,
    sides: [low, high],
  }
}

const SPINE_STEP = 0.1

function nearSpine(side: number, scale: number, reach: number) {
  const fine = strokeSpine(LINE, DEFAULT_HAND.weight, { spacing: SPINE_STEP, most: 10_000 })
  const away = new Float64Array(side * side).fill(Infinity)
  const inside = new Float64Array(side * side).fill(-Infinity)
  fine.points.forEach((point, i) => {
    const [sx, sy] = onPicture(point, scale)
    const half = fine.half[i]! * UNIT * scale
    for (let y = Math.floor(sy - reach); y <= sy + reach; y += 1)
      for (let x = Math.floor(sx - reach); x <= sx + reach; x += 1) {
        const [at, gap] = [y * side + x, Math.hypot(x + 0.5 - sx, y + 0.5 - sy)]
        away[at] = Math.min(away[at]!, gap)
        inside[at] = Math.max(inside[at]!, half - gap)
      }
  })
  return { away, inside }
}

const POINTS: readonly [string, number, Axis][] = [
  ['on the right', 1, 'x'],
  ['at the bottom', 6, 'y'],
  ['on the left', 11, 'x'],
  ['at the top', 15, 'y'],
]

describe('the circle it draws (FE-I67)', () => {
  it.each(POINTS)(
    'the stroke %s runs through the shape’s own circle, as wide as the brush',
    async (_name, i, axis) => {
      for (const scale of [1, 2]) {
        const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
        const through = onPicture(LINE[i]!, scale)
        const stroke = acrossStroke(clear, through, axis, scale)
        expect(Math.abs(stroke.middle - through[axis === 'x' ? 0 : 1])).toBeLessThan(0.35)
        expect(stroke.half).toBeGreaterThan((STROKE * scale * HAND.liftWidth) / 2)
        expect(stroke.half).toBeLessThan((STROKE * scale) / 2)
      }
    },
  )

  it('ink lies along the whole of the shape’s stroke and nowhere off it', async () => {
    for (const scale of [1, 2, 3]) {
      const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
      const slack = SPINE_STEP * UNIT * scale
      const deep = 0.6 + slack
      const inkless = (STROKE / 2) * scale + slack + 0.6
      const quiet = (STROKE / 2 + PICTURE_INK.breath) * scale + slack + 0.1
      const { away: far, inside } = nearSpine(clear.width, scale, quiet)
      const seen = { deep: 0, inkless: 0, quiet: 0 }
      far.forEach((away, at) => {
        const [r, g, b, a] = pixel(clear, at % clear.width, Math.floor(at / clear.width))
        if (inside[at]! >= deep) {
          seen.deep += 1
          expect([r, g, b, a]).toEqual([...PICTURE_INK.ink, 255])
        } else if (away >= quiet) {
          seen.quiet += 1
          expect(a).toBe(0)
        } else if (away >= inkless) {
          seen.inkless += 1
          expect(a).toBeLessThanOrEqual(paperAtMost(scale))
        }
      })
      expect(Math.min(seen.deep, seen.inkless, seen.quiet)).toBeGreaterThan(0)
    }
  })

  it('twice the scale draws the stroke twice as wide', async () => {
    const [one, two] = await Promise.all(
      [1, 2].map(async scale => {
        const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
        return acrossStroke(clear, onPicture(LINE[1]!, scale), 'x', scale).half
      }),
    )
    expect(two! / one!).toBeCloseTo(2, 1)
  })

  it('every point of the shape’s circle is ink, the ink colour itself', async () => {
    for (const scale of [1, 2]) {
      const circled = await circledOn(flat(3, [0x30, 0x90, 0xd0], scale), scale)
      for (const point of LINE.slice(1, -1)) {
        const [x, y] = onPicture(point, scale)
        expect(pixel(circled, x, y)).toEqual([...PICTURE_INK.ink])
      }
    }
  })

  it('the mouth is where the shape’s mouth is: no ink across it, nothing at all down its middle', async () => {
    for (const scale of [1, 2]) {
      const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
      const radius = DEFAULT_HAND.radius * UNIT * scale
      for (let turn = -12; turn <= 12; turn += 1) {
        const angle = ((DEFAULT_HAND.gapAt + turn) * Math.PI) / 180
        for (let r = radius * 0.6; r <= radius * 1.4; r += 0.5) {
          const [x, y] = [
            MIDDLE * scale + r * Math.cos(angle),
            MIDDLE * scale + r * Math.sin(angle),
          ]
          expect(alpha(clear, x, y)).toBeLessThanOrEqual(
            Math.abs(turn) <= 1 ? 0 : paperAtMost(scale),
          )
        }
      }
    }
  })

  it('the middle of the circle and the picture away from it are left as they were', async () => {
    const scale = 2
    const picture = flat(3, [0x30, 0x90, 0xd0], scale)
    const circled = await circledOn(picture, scale)
    const radius = DEFAULT_HAND.radius * UNIT * scale
    const reach = radius * 1.1 + (STROKE / 2 + PICTURE_INK.breath + 1) * scale
    for (let y = 0; y < circled.height; y += 1)
      for (let x = 0; x < circled.width; x += 1) {
        const away = Math.hypot(x + 0.5 - MIDDLE * scale, y + 0.5 - MIDDLE * scale)
        if (away < radius * 0.45 || away > reach)
          expect(pixel(circled, x, y)).toEqual(pixel(picture, x, y))
      }
  })

  it.each(POINTS)(
    'the paper breath %s lies outside the ink, fades evenly with distance and stops at the breath',
    async (_name, i, axis) => {
      for (const scale of [1, 2, 3]) {
        const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
        const { sides } = acrossStroke(clear, onPicture(LINE[i]!, scale), axis, scale)
        const breath = PICTURE_INK.breath * scale
        const step = BREATH_TOP / breath
        for (const { breath: faded, quiet } of sides) {
          expect(quiet).toBeGreaterThan(breath - 0.1)
          expect(quiet).toBeLessThan(breath * 1.02 + 1)
          faded.slice(1).forEach((a, k) => {
            expect(faded[k]! - a).toBeGreaterThan(step * 0.9 - 1.5)
            expect(faded[k]! - a).toBeLessThan(step + 1.5)
          })
        }
      }
    },
  )
})

describe('the circle laid on the picture (FE-I67)', () => {
  it.each([
    ['RGB', 3, 255],
    ['RGBA, opaque', 4, 255],
    ['RGBA, half clear', 4, 96],
  ] as const)(
    'on %s the paper and the ink are laid over what is there',
    async (_name, channels, under) => {
      const colour = [0x30, 0x90, 0xd0, under]
      for (const scale of [1, 2]) {
        const clear = await circledOn(flat(4, [0, 0, 0, 0], scale), scale)
        const picture = flat(channels, colour, scale)
        const circled = await circledOn(picture, scale)
        const seen = { paper: 0, ink: 0, untouched: 0 }
        for (let y = 0; y < clear.height; y += 1)
          for (let x = 0; x < clear.width; x += 1) {
            const [r, g, b, a] = pixel(clear, x, y) as [number, number, number, number]
            const got = pixel(circled, x, y)
            if (a === 0) {
              seen.untouched += 1
              const was = pixel(picture, x, y)
              got.forEach((value, c) => expect(Math.abs(value - was[c]!)).toBeLessThanOrEqual(1))
            } else if (a === 255 && [r, g, b].join() === PICTURE_INK.ink.join()) {
              seen.ink += 1
              const ink = [...PICTURE_INK.ink, 255]
              got.forEach((value, c) => expect(Math.abs(value - ink[c]!)).toBeLessThanOrEqual(1))
            } else if (a <= clearOfInk(scale)) {
              seen.paper += 1
              expect([r, g, b]).toEqual([...PICTURE_INK.paper])
              const expected = over(PICTURE_INK.paper, a / 255, colour, under / 255)
              got.forEach((value, c) =>
                expect(Math.abs(value - expected[c]!)).toBeLessThanOrEqual(2),
              )
            }
          }
        expect(Math.min(seen.paper, seen.ink, seen.untouched)).toBeGreaterThan(0)
      }
    },
  )

  it.each([
    ['left', 2, MIDDLE],
    ['right', SIZE - 2, MIDDLE],
    ['top', MIDDLE, 1],
    ['bottom', MIDDLE, SIZE - 1],
  ])(
    'by the %s edge only the part of the circle inside the picture is drawn',
    async (_name, x, y) => {
      const pad = 40
      for (const channels of [3, 4] as const) {
        const colour = [0x30, 0x90, 0xd0, 96]
        const picture = flat(channels, colour, 1)
        const circled = await circledOn(picture, 1, { x, y })
        const wide = flat(channels, colour, 1, SIZE + 2 * pad)
        const whole = await circledOn(wide, 1, { x: x + pad, y: y + pad })
        const inside = crop(whole, { x: pad, y: pad, width: SIZE, height: SIZE })
        expect(Buffer.compare(circled.data, inside.data)).toBe(0)
      }
    },
  )
})

function over(top: readonly number[], a: number, under: readonly number[], b: number): number[] {
  const out = a + b * (1 - a)
  const colour = [0, 1, 2].map(c => (top[c]! * a + under[c]! * b * (1 - a)) / out)
  return [...colour, out * 255]
}
