import { crc32 } from 'node:zlib'

export type ContainerFormat = 'png' | 'jpeg' | 'webp'

export type Container =
  | { readonly format: ContainerFormat; readonly width: number; readonly height: number; readonly orientation: number }
  | 'empty'
  | 'truncated'
  | 'not-image'
  | 'multi-frame'

function viewOf(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function readPng(bytes: Uint8Array): Container {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < signature.length || !signature.every((byte, index) => bytes[index] === byte)) return 'not-image'
  const view = viewOf(bytes)
  let offset = 8
  let width = 0
  let height = 0
  let sawHeader = false
  let sawEnd = false
  while (offset + 12 <= view.length) {
    const size = view.readUInt32BE(offset)
    const end = offset + 12 + size
    if (end > view.length) return 'truncated'
    const crc = view.readUInt32BE(end - 4)
    if (crc32(view.subarray(offset + 4, end - 4)) !== crc) return 'truncated'
    const type = view.toString('ascii', offset + 4, offset + 8)
    if (type === 'IHDR') {
      if (size < 13) return 'truncated'
      width = view.readUInt32BE(offset + 8)
      height = view.readUInt32BE(offset + 12)
      sawHeader = true
    }
    if (type === 'acTL') {
      if (size !== 8) return 'truncated'
      if (view.readUInt32BE(offset + 8) !== 1) return 'multi-frame'
    }
    if (type === 'IEND') {
      sawEnd = true
      break
    }
    offset = end
  }
  if (!sawHeader || !sawEnd || width === 0 || height === 0) return 'truncated'
  return { format: 'png', width, height, orientation: 1 }
}

function exifOrientation(segment: Buffer): number {
  if (segment.length < 8 || segment.toString('ascii', 0, 4) !== 'Exif') return 1
  const tiff = segment.subarray(6)
  const little = tiff.toString('ascii', 0, 2) === 'II'
  const read16 = (offset: number) => (little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset))
  const read32 = (offset: number) => (little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset))
  if (tiff.length < 8) return 1
  const ifd = read32(4)
  if (ifd + 2 > tiff.length) return 1
  const count = read16(ifd)
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > tiff.length) return 1
    if (read16(entry) === 0x0112) return read16(entry + 8)
  }
  return 1
}

function readJpeg(bytes: Uint8Array): Container {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'not-image'
  const view = viewOf(bytes)
  let offset = 2
  let width = 0
  let height = 0
  let orientation = 1
  let sawFrame = false
  while (offset + 4 < view.length) {
    if (view[offset] !== 0xff) return 'truncated'
    while (offset < view.length && view[offset] === 0xff) offset += 1
    if (offset >= view.length) return 'truncated'
    const marker = view[offset]
    offset += 1
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (offset + 2 > view.length) return 'truncated'
    const length = view.readUInt16BE(offset)
    if (length < 2 || offset + length > view.length) return 'truncated'
    if (marker === 0xe1) orientation = exifOrientation(view.subarray(offset + 2, offset + length))
    const startOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (startOfFrame) {
      if (length < 7) return 'truncated'
      height = view.readUInt16BE(offset + 3)
      width = view.readUInt16BE(offset + 5)
      sawFrame = true
    }
    offset += length
  }
  if (!sawFrame || width === 0 || height === 0) return 'truncated'
  return { format: 'jpeg', width, height, orientation }
}

function readWebp(bytes: Uint8Array): Container {
  if (bytes.length < 12) {
    return bytes.length >= 4 && viewOf(bytes).toString('ascii', 0, 4) === 'RIFF' ? 'truncated' : 'not-image'
  }
  const view = viewOf(bytes)
  if (view.toString('ascii', 0, 4) !== 'RIFF' || view.toString('ascii', 8, 12) !== 'WEBP') return 'not-image'
  let offset = 12
  let width = 0
  let height = 0
  let saw = false
  while (offset + 8 <= view.length) {
    const tag = view.toString('ascii', offset, offset + 4)
    const size = view.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + size > view.length) return 'truncated'
    if (tag === 'VP8X' && size >= 10) {
      const flags = view[data]
      if (flags === undefined) return 'truncated'
      if ((flags & 0x02) !== 0) return 'multi-frame'
      width = 1 + view.readUIntLE(data + 4, 3)
      height = 1 + view.readUIntLE(data + 7, 3)
      saw = true
    } else if (tag === 'VP8 ' && size >= 10) {
      width = view.readUInt16LE(data + 6) & 0x3fff
      height = view.readUInt16LE(data + 8) & 0x3fff
      saw = true
    } else if (tag === 'VP8L' && size >= 5 && view[data] === 0x2f) {
      const b1 = view[data + 1] ?? 0
      const b2 = view[data + 2] ?? 0
      const b3 = view[data + 3] ?? 0
      const b4 = view[data + 4] ?? 0
      width = 1 + (((b2 & 0x3f) << 8) | b1)
      height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
      saw = true
    }
    offset = data + size + (size % 2)
    if (saw) break
  }
  if (!saw || width === 0 || height === 0) return 'truncated'
  return { format: 'webp', width, height, orientation: 1 }
}

export function readContainer(bytes: Uint8Array): Container {
  if (bytes.byteLength === 0) return 'empty'
  const head = bytes[0]
  if (head === 0x89) return readPng(bytes)
  if (head === 0xff) return readJpeg(bytes)
  if (head === 0x52) return readWebp(bytes)
  return 'not-image'
}
