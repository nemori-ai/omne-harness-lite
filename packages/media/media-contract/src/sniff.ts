import type { Modality } from './values.ts'

type Signature = Readonly<{
  mediaType: string
  offset: number
  bytes: readonly number[]
  also?: Readonly<{ offset: number; bytes: readonly number[] }>
}>

const ascii = (text: string): number[] => Array.from(text, character => character.charCodeAt(0))

const SIGNATURES: readonly Signature[] = [
  { mediaType: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  {
    mediaType: 'image/webp',
    offset: 0,
    bytes: ascii('RIFF'),
    also: { offset: 8, bytes: ascii('WEBP') },
  },
  {
    mediaType: 'audio/wav',
    offset: 0,
    bytes: ascii('RIFF'),
    also: { offset: 8, bytes: ascii('WAVE') },
  },
  { mediaType: 'application/pdf', offset: 0, bytes: ascii('%PDF-') },
]

function at(head: Uint8Array, offset: number, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => head[offset + index] === byte)
}

/** The media types this group takes in. A type outside it is refused before any byte. */
export const KNOWN_MEDIA_TYPES: readonly string[] = SIGNATURES.map(item => item.mediaType)

/** The media type the first bytes show, or null when they show none of the known types. */
export function sniffMediaType(head: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (!at(head, signature.offset, signature.bytes)) continue
    if (signature.also && !at(head, signature.also.offset, signature.also.bytes)) continue
    return signature.mediaType
  }
  return null
}

export function modalityOf(mediaType: string): Modality {
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('audio/')) return 'voice'
  return 'file'
}

const KEY = /^[0-9a-f]{32}$/

/** Keys are made by the core: opaque, never derived from the content. */
export function isMediaKey(key: string): boolean {
  return KEY.test(key)
}

export function digestText(hex: string): string {
  return `sha256:${hex}`
}

/** The facts of a PCM WAV from its header, or null when the header is not one. */
export function wavFacts(
  bytes: Uint8Array,
): { durationMs: number; sampleRate: number; channels: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  let format: { sampleRate: number; channels: number; byteRate: number } | null = null
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const size = view.getUint32(offset + 4, true)
    if (tag(offset) === 'fmt ' && offset + 20 <= bytes.byteLength)
      format = {
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
      }
    if (tag(offset) === 'data' && format !== null && format.byteRate > 0) {
      const audible = Math.min(size, bytes.byteLength - offset - 8)
      const { sampleRate, channels } = format
      return { durationMs: Math.round((audible * 1000) / format.byteRate), sampleRate, channels }
    }
    offset += 8 + size + (size % 2)
  }
  return null
}
