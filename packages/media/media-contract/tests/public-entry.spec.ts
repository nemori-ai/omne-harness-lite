import { expect, it } from 'vitest'
import {
  KNOWN_MEDIA_TYPES,
  digestText,
  isMediaKey,
  modalityOf,
  sniffMediaType,
} from '@omne-harness/media-contract'

const head = (...bytes: number[]): Uint8Array =>
  new Uint8Array([...bytes, ...Array.from({ length: 16 }, () => 0)])
const ascii = (text: string): number[] => Array.from(text, character => character.charCodeAt(0))

it('exports the pure functions of the contract', async () => {
  const root = (await import('@omne-harness/media-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'KNOWN_MEDIA_TYPES',
    'digestText',
    'isMediaKey',
    'modalityOf',
    'sniffMediaType',
  ])
})

it.each([
  ['image/png', head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
  ['image/jpeg', head(0xff, 0xd8, 0xff, 0xe0)],
  ['image/gif', head(...ascii('GIF89a'))],
  ['image/webp', head(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'))],
  ['audio/wav', head(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE'))],
  ['audio/mpeg', head(...ascii('ID3'), 4)],
  ['audio/ogg', head(...ascii('OggS'))],
  ['audio/flac', head(...ascii('fLaC'))],
  ['audio/webm', head(0x1a, 0x45, 0xdf, 0xa3)],
  ['audio/mp4', head(0, 0, 0, 0x20, ...ascii('ftypM4A '))],
  ['application/pdf', head(...ascii('%PDF-1.7'))],
])('sniffs %s from its first bytes', (mediaType, bytes) => {
  expect(sniffMediaType(bytes)).toBe(mediaType)
  expect(KNOWN_MEDIA_TYPES).toContain(mediaType)
})

it('sniffs nothing from bytes of no known type, a RIFF of another form, or too few bytes', () => {
  expect(sniffMediaType(head(...ascii('plain text')))).toBeNull()
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
