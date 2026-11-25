export interface Pixels {
  readonly width: number
  readonly height: number
  readonly channels: 3 | 4
  readonly data: Uint8Array
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const

const COLOUR_TYPES: Readonly<Record<number, 3 | 4>> = { 2: 3, 6: 4 }

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const TOO_LONG = 'the PNG image data is longer than its size says'

async function through(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  most = Infinity,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  void writer.write(Uint8Array.from(bytes)).catch(() => undefined)
  void writer.close().catch(() => undefined)
  const reader = (stream.readable as ReadableStream<Uint8Array>).getReader()
  const parts: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return concat(parts)
    length += value.length
    if (length > most) {
      void reader.cancel().catch(() => undefined)
      throw new Error(TOO_LONG)
    }
    parts.push(value)
  }
}

interface Header {
  readonly width: number
  readonly height: number
  readonly channels: 3 | 4
}

function header(data: DataView): Header {
  const [width, height] = [data.getUint32(0), data.getUint32(4)]
  const [depth, colour, interlace] = [data.getUint8(8), data.getUint8(9), data.getUint8(12)]
  const channels = COLOUR_TYPES[colour]
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not read; only 8 bits a channel`)
  if (channels === undefined)
    throw new Error(`PNG colour type ${colour} is not read; only RGB (2) and RGBA (6)`)
  if (interlace !== 0) throw new Error('an interlaced PNG is not read')
  if (width === 0 || height === 0) throw new Error('a PNG with no pixels is not read')
  return { width, height, channels }
}

function chunks(png: Uint8Array): { readonly head: Header; readonly idat: Uint8Array } {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte))
    throw new Error('these bytes are not a PNG')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const idat: Uint8Array[] = []
  let head: Header | null = null
  let at = 8
  while (at + 8 <= png.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    const body = at + 8
    if (body + length + 4 > png.length) throw new Error(`the PNG chunk ${type} is cut short`)
    if (type === 'IHDR') head = header(new DataView(png.buffer, png.byteOffset + body, length))
    else if (type === 'IDAT') idat.push(png.subarray(body, body + length))
    else if (type === 'IEND') break
    at = body + length + 4
  }
  if (head === null) throw new Error('the PNG has no header')
  if (idat.length === 0) throw new Error('the PNG has no image data')
  return { head, idat: concat(idat) }
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

type Predict = (a: number, b: number, c: number) => number

const PREDICTORS: readonly Predict[] = [
  () => 0,
  a => a,
  (_a, b) => b,
  (a, b) => (a + b) >>> 1,
  paeth,
]

function unfilter(raw: Uint8Array, { width, height, channels }: Header): Uint8Array {
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error('the PNG image data is cut short')
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!
    const predict = PREDICTORS[filter]
    if (predict === undefined) throw new Error(`PNG row filter ${filter} is not known`)
    const line = y * (stride + 1) + 1
    const row = y * stride
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels
      const a = left ? out[row + i - channels]! : 0
      const b = y > 0 ? out[row - stride + i]! : 0
      const c = left && y > 0 ? out[row - stride + i - channels]! : 0
      out[row + i] = (raw[line + i]! + predict(a, b, c)) & 0xff
    }
  }
  return out
}

export async function readPng(png: Uint8Array): Promise<Pixels> {
  const { head, idat } = chunks(png)
  let raw: Uint8Array
  try {
    const most = head.height * (head.width * head.channels + 1)
    raw = await through(idat, new DecompressionStream('deflate'), most)
  } catch (cause) {
    if (cause instanceof Error && cause.message === TOO_LONG) throw cause
    throw new Error('the PNG image data does not inflate', { cause })
  }
  return { ...head, data: unfilter(raw, head) }
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

export async function writePng({ width, height, channels, data }: Pixels): Promise<Uint8Array> {
  const stride = width * channels
  const raw = new Uint8Array(height * (stride + 1))
  for (let y = 0; y < height; y += 1)
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const head = new Uint8Array(13)
  const view = new DataView(head.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  head.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8)
  const idat = await through(raw, new CompressionStream('deflate'))
  return concat([
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', head),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ])
}
