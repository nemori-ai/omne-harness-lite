import { expect, it } from 'vitest'
import {
  KNOWN_MEDIA_TYPES,
  digestText,
  isMediaKey,
  modalityOf,
  sniffMediaType,
  wavFacts,
} from '@omne-harness/media-contract'

const head = (...bytes: number[]): Uint8Array =>
  new Uint8Array([...bytes, ...Array.from({ length: 16 }, () => 0)])
const ascii = (text: string): number[] => Array.from(text, character => character.charCodeAt(0))

it('exports the pure functions of the contract', async () => {
  const root = (await import('@omne-harness/media-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'KNOWN_MEDIA_TYPES',
    'declarationProblem',
    'digestText',
    'engineAccepts',
    'isEngineName',
    'isMediaKey',
    'modalityOf',
    'sniffMediaType',
    'wavFacts',
  ])
})

it.each([
  ['image/png', head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
  ['image/jpeg', head(0xff, 0xd8, 0xff, 0xe0)],
  ['image/webp', head(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'))],
  ['audio/wav', head(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE'))],
  ['application/pdf', head(...ascii('%PDF-1.7'))],
])('sniffs %s from its first bytes', (mediaType, bytes) => {
  expect(sniffMediaType(bytes)).toBe(mediaType)
  expect(KNOWN_MEDIA_TYPES).toContain(mediaType)
})

it('sniffs nothing from bytes of no known type, a RIFF of another form, or too few bytes', () => {
  expect(sniffMediaType(head(...ascii('plain text')))).toBeNull()
  expect(sniffMediaType(head(...ascii('GIF89a')))).toBeNull()
  expect(sniffMediaType(head(...ascii('ID3'), 4))).toBeNull()
  expect(sniffMediaType(head(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('AVI ')))).toBeNull()
  expect(sniffMediaType(new Uint8Array([0x89, 0x50]))).toBeNull()
  expect(sniffMediaType(new Uint8Array())).toBeNull()
})

it('puts a media type in its modality', () => {
  expect(modalityOf('image/webp')).toBe('image')
  expect(modalityOf('audio/wav')).toBe('voice')
  expect(modalityOf('application/pdf')).toBe('file')
})

it('takes only the keys the core makes, and writes a digest with its algorithm', () => {
  expect(isMediaKey('0123456789abcdef0123456789abcdef')).toBe(true)
  for (const key of ['', 'abc', 'A'.repeat(32), `${'a'.repeat(31)}/`, 'a'.repeat(33)])
    expect(isMediaKey(key), key).toBe(false)
  expect(digestText('ab12')).toBe('sha256:ab12')
})

function wav(
  sampleRate: number,
  channels: number,
  seconds: number,
  extraChunk = false,
): Uint8Array {
  const data = sampleRate * channels * 2 * seconds
  const extra = extraChunk ? 12 : 0
  const bytes = new Uint8Array(44 + extra + data)
  const view = new DataView(bytes.buffer)
  const put = (offset: number, text: string) => bytes.set(ascii(text), offset)
  put(0, 'RIFF')
  view.setUint32(4, 36 + extra + data, true)
  put(8, 'WAVE')
  put(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  if (extraChunk) {
    put(36, 'LIST')
    view.setUint32(40, 3, true)
  }
  put(36 + extra, 'data')
  view.setUint32(40 + extra, data, true)
  return bytes
}

it('reads the duration, rate and channels of a PCM WAV, past a chunk of odd size', () => {
  expect(wavFacts(wav(16000, 1, 2))).toEqual({ durationMs: 2000, sampleRate: 16000, channels: 1 })
  expect(wavFacts(wav(44100, 2, 1, true))).toEqual({
    durationMs: 1000,
    sampleRate: 44100,
    channels: 2,
  })
})

it('reads no facts from a WAV without a format or a data chunk', () => {
  expect(wavFacts(wav(16000, 1, 1).subarray(0, 36))).toBeNull()
  expect(wavFacts(new Uint8Array(12))).toBeNull()
})
