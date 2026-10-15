import { crc32 } from 'node:zlib'

export type ContainerFormat = 'png' | 'jpeg' | 'webp'

export type Container =
  | { readonly format: ContainerFormat; readonly width: number; readonly height: number; readonly orientation: number }
  | 'empty'
  | 'truncated'
  | 'not-image'
  | 'multi-frame'

type Stop = 'truncated' | 'multi-frame'

function viewOf(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function pngSignature(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
}

function pngChunk(
  view: Buffer,
  offset: number,
): { readonly type: string; readonly data: Buffer; readonly next: number } | 'truncated' {
  const size = view.readUInt32BE(offset)
  const end = offset + 12 + size
  if (end > view.length) return 'truncated'
  const crc = view.readUInt32BE(end - 4)
  if (crc32(view.subarray(offset + 4, end - 4)) !== crc) return 'truncated'
  return {
    type: view.toString('ascii', offset + 4, offset + 8),
    data: view.subarray(offset + 8, end - 4),
    next: end,
  }
}

type PngNote = {
  width: number
  height: number
  orientation: number
  sawHeader: boolean
  sawEnd: boolean
}

function notePng(note: PngNote, type: string, data: Buffer): Stop | undefined {
  if (type === 'IHDR') {
    if (data.length < 13) return 'truncated'
    note.width = data.readUInt32BE(0)
    note.height = data.readUInt32BE(4)
    note.sawHeader = true
  } else if (type === 'eXIf') {
    const found = exifOrientation(data)
    if (found !== undefined) note.orientation = found
  } else if (type === 'acTL') {
    if (data.length !== 8) return 'truncated'
    if (data.readUInt32BE(0) !== 1) return 'multi-frame'
  } else if (type === 'IEND') note.sawEnd = true
  return undefined
}

function readPng(bytes: Uint8Array): Container {
  if (!pngSignature(bytes)) return 'not-image'
  const view = viewOf(bytes)
  const note: PngNote = { width: 0, height: 0, orientation: 1, sawHeader: false, sawEnd: false }
  let offset = 8
  while (offset + 12 <= view.length && !note.sawEnd) {
    const chunk = pngChunk(view, offset)
    if (chunk === 'truncated') return chunk
    const effect = notePng(note, chunk.type, chunk.data)
    if (effect !== undefined) return effect
    offset = chunk.next
  }
  if (!note.sawHeader || !note.sawEnd || note.width === 0 || note.height === 0) return 'truncated'
  return { format: 'png', width: note.width, height: note.height, orientation: note.orientation }
}

function tiffOrientation(tiff: Buffer): number | undefined {
  if (tiff.length < 8) return undefined
  const order = tiff.toString('ascii', 0, 2)
  if (order !== 'II' && order !== 'MM') return undefined
  const little = order === 'II'
  const read16 = (offset: number) => (little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset))
  const read32 = (offset: number) => (little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset))
  const ifd = read32(4)
  if (ifd + 2 > tiff.length) return undefined
  const count = read16(ifd)
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > tiff.length) return undefined
    if (read16(entry) === 0x0112) return read16(entry + 8)
  }
  return undefined
}

function exifOrientation(segment: Buffer): number | undefined {
  if (segment.length >= 8 && segment.toString('ascii', 0, 4) === 'Exif') return tiffOrientation(segment.subarray(6))
  return tiffOrientation(segment)
}

type JpegNote = { width: number; height: number; orientation: number; sawFrame: boolean }

function startOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function noteJpeg(note: JpegNote, marker: number, segment: Buffer): 'truncated' | undefined {
  if (marker === 0xe1) {
    const found = exifOrientation(segment)
    if (found !== undefined) note.orientation = found
  }
  if (!startOfFrame(marker)) return undefined
  if (segment.length < 5) return 'truncated'
  note.height = segment.readUInt16BE(1)
  note.width = segment.readUInt16BE(3)
  note.sawFrame = true
  return undefined
}

type JpegStep =
  | { readonly kind: 'stop' }
  | { readonly kind: 'scan'; readonly next: number }
  | { readonly kind: 'segment'; readonly marker: number; readonly segment: Buffer; readonly next: number }

function jpegStep(view: Buffer, offset: number): JpegStep | 'truncated' {
  if (view[offset] !== 0xff) return 'truncated'
  let cursor = offset
  while (cursor < view.length && view[cursor] === 0xff) cursor += 1
  if (cursor >= view.length) return 'truncated'
  const marker = view[cursor]
  cursor += 1
  if (marker === undefined || marker === 0xd9) return { kind: 'stop' }
  if (marker === 0xda) return { kind: 'scan', next: cursor }
  if (cursor + 2 > view.length) return 'truncated'
  const length = view.readUInt16BE(cursor)
  if (length < 2 || cursor + length > view.length) return 'truncated'
  return {
    kind: 'segment',
    marker,
    segment: view.subarray(cursor + 2, cursor + length),
    next: cursor + length,
  }
}

function jpegReady(note: JpegNote, sawScan: boolean): boolean {
  return note.sawFrame && sawScan && note.width > 0 && note.height > 0
}

function readJpeg(bytes: Uint8Array): Container {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'not-image'
  const view = viewOf(bytes)
  const note: JpegNote = { width: 0, height: 0, orientation: 1, sawFrame: false }
  let offset = 2
  let sawScan = false
  while (offset + 4 < view.length) {
    const step = jpegStep(view, offset)
    if (step === 'truncated') return step
    if (step.kind === 'stop') break
    if (step.kind === 'scan') {
      sawScan = true
      offset = step.next
      break
    }
    const effect = noteJpeg(note, step.marker, step.segment)
    if (effect !== undefined) return effect
    offset = step.next
  }
  if (!jpegReady(note, sawScan) || !hasEoi(view, offset)) return 'truncated'
  return { format: 'jpeg', width: note.width, height: note.height, orientation: note.orientation }
}

function hasEoi(view: Buffer, offset: number): boolean {
  for (let index = offset; index + 1 < view.length; index += 1) {
    if (view[index] !== 0xff) continue
    const next = view[index + 1]
    if (next === 0x00) {
      index += 1
      continue
    }
    if (next === 0xd9) return true
  }
  return false
}

type WebpNote = {
  width: number
  height: number
  orientation: number
  sawHeader: boolean
  sawBits: boolean
}

function noteVp8x(note: WebpNote, data: Buffer): Stop | undefined {
  if (data.length < 10) return undefined
  const flags = data[0]
  if (flags === undefined) return 'truncated'
  if ((flags & 0x02) !== 0) return 'multi-frame'
  note.width = 1 + data.readUIntLE(4, 3)
  note.height = 1 + data.readUIntLE(7, 3)
  note.sawHeader = true
  return undefined
}

function noteVp8(note: WebpNote, data: Buffer): undefined {
  if (data.length < 10) return undefined
  if (!note.sawHeader) {
    note.width = data.readUInt16LE(6) & 0x3fff
    note.height = data.readUInt16LE(8) & 0x3fff
  }
  note.sawBits = true
  return undefined
}

function vp8lSize(data: Buffer): { readonly width: number; readonly height: number } | undefined {
  if (data.length < 5 || data[0] !== 0x2f) return undefined
  const b1 = data[1] ?? 0
  const b2 = data[2] ?? 0
  const b3 = data[3] ?? 0
  const b4 = data[4] ?? 0
  return {
    width: 1 + (((b2 & 0x3f) << 8) | b1),
    height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
  }
}

function noteVp8l(note: WebpNote, data: Buffer): undefined {
  const size = vp8lSize(data)
  if (size === undefined) return undefined
  if (!note.sawHeader) {
    note.width = size.width
    note.height = size.height
  }
  note.sawBits = true
  return undefined
}

function noteWebpExif(note: WebpNote, data: Buffer): undefined {
  const found = exifOrientation(data)
  if (found !== undefined) note.orientation = found
  return undefined
}

const webpNotes = {
  VP8X: noteVp8x,
  'VP8 ': noteVp8,
  VP8L: noteVp8l,
  EXIF: noteWebpExif,
} as const

function webpChunk(
  view: Buffer,
  offset: number,
): { readonly tag: string; readonly data: Buffer; readonly next: number } | 'truncated' {
  const size = view.readUInt32LE(offset + 4)
  const dataAt = offset + 8
  if (dataAt + size > view.length) return 'truncated'
  return {
    tag: view.toString('ascii', offset, offset + 4),
    data: view.subarray(dataAt, dataAt + size),
    next: dataAt + size + (size % 2),
  }
}

function applyWebpChunk(
  note: WebpNote,
  tag: string,
  data: Buffer,
): Stop | undefined {
  const noteChunk = webpNotes[tag as keyof typeof webpNotes]
  if (noteChunk === undefined) return undefined
  return noteChunk(note, data)
}

function webpHead(bytes: Uint8Array): Buffer | 'truncated' | 'not-image' {
  if (bytes.length < 12) {
    return bytes.length >= 4 && viewOf(bytes).toString('ascii', 0, 4) === 'RIFF' ? 'truncated' : 'not-image'
  }
  const view = viewOf(bytes)
  if (view.toString('ascii', 0, 4) !== 'RIFF' || view.toString('ascii', 8, 12) !== 'WEBP') return 'not-image'
  return view
}

function readWebp(bytes: Uint8Array): Container {
  const view = webpHead(bytes)
  if (typeof view === 'string') return view
  const note: WebpNote = { width: 0, height: 0, orientation: 1, sawHeader: false, sawBits: false }
  let offset = 12
  while (offset + 8 <= view.length) {
    const chunk = webpChunk(view, offset)
    if (chunk === 'truncated') return chunk
    const effect = applyWebpChunk(note, chunk.tag, chunk.data)
    if (effect !== undefined) return effect
    offset = chunk.next
  }
  if (!note.sawBits || note.width === 0 || note.height === 0) return 'truncated'
  return { format: 'webp', width: note.width, height: note.height, orientation: note.orientation }
}

export function readContainer(bytes: Uint8Array): Container {
  if (bytes.byteLength === 0) return 'empty'
  const head = bytes[0]
  if (head === 0x89) return readPng(bytes)
  if (head === 0xff) return readJpeg(bytes)
  if (head === 0x52) return readWebp(bytes)
  return 'not-image'
}
