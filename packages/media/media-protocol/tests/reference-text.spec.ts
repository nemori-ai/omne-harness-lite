import { expect, it } from 'vitest'
import { readReferenceText, referenceText } from '@omne-harness/media-protocol'

const REF = {
  storage: 'local',
  key: '0123456789abcdef0123456789abcdef',
  mediaType: 'image/png',
  bytes: '2048',
  digest: `sha256:${'ab'.repeat(32)}`,
}
const TEXT =
  '{"storage":"local","key":"0123456789abcdef0123456789abcdef","mediaType":"image/png","bytes":"2048","digest":"sha256:abababababababababababababababababababababababababababababababab"}'

it('writes the five fields in a fixed order as JSON with no white space, whatever order they came in', () => {
  expect(referenceText(REF)).toBe(TEXT)
  const { digest, bytes, mediaType, key, storage } = REF
  expect(referenceText({ digest, bytes, mediaType, key, storage })).toBe(TEXT)
  expect(referenceText({ ...REF, extra: 'x' } as typeof REF)).toBe(TEXT)
})

it('reads back what it wrote', () => {
  expect(readReferenceText(TEXT)).toEqual(REF)
})

it.each([
  ['not JSON', 'storage=local'],
  ['JSON of another kind', '["local","k","image/png","1","d"]'],
  ['null', 'null'],
  ['a text', '"local"'],
  ['a field more', TEXT.replace('}', ',"tenant":"t"}')],
  ['a field less', TEXT.replace(/,"digest":"[^"]*"/u, '')],
  ['a field that is not text', TEXT.replace('"2048"', '2048')],
  ['a key that is a number', TEXT.replace('"0123456789abcdef0123456789abcdef"', '123')],
  ['a media type that is true', TEXT.replace('"image/png"', 'true')],
  ['a digest that is a number', TEXT.replace(/"sha256:[a-f]*"/u, '7')],
  ['a field that is null', TEXT.replace('"local"', 'null')],
  [
    'the fields in another order',
    TEXT.replace('"storage":"local","key"', '"key"').replace(
      '"mediaType"',
      '"storage":"local","mediaType"',
    ),
  ],
  ['white space', TEXT.replace(',', ', ')],
  ['white space around it', ` ${TEXT}`],
  ['a line after it', `${TEXT}\n`],
  ['a character escaped that need not be', TEXT.replace('"local"', '"\\u006cocal"')],
  ['a slash escaped', TEXT.replace('image/png', 'image\\/png')],
  ['a field given twice', TEXT.replace('{', '{"storage":"other",')],
  ['an empty text', ''],
])('reads %s as no reference', (_, text) => {
  expect(readReferenceText(text)).toBeNull()
})

const alphabet = [
  'a',
  'Z',
  '0',
  ' ',
  '"',
  '\\',
  '/',
  '\n',
  '\u0000',
  '中',
  '\u{1F600}',
  '\uD800',
  '}',
]

/** A text of up to eight characters, picked by a small generator that repeats for one seed. */
function textOf(next: () => number): string {
  const length = Math.floor(next() * 9)
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join('')
}

it('for any five texts: written and read back is the same reference, and read and written again is the same text', () => {
  let seed = 7
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let round = 0; round < 500; round += 1) {
    const ref = {
      storage: textOf(next),
      key: textOf(next),
      mediaType: textOf(next),
      bytes: textOf(next),
      digest: textOf(next),
    }
    const text = referenceText(ref)
    const read = readReferenceText(text)
    expect(read).toEqual(ref)
    expect(read === null ? null : referenceText(read)).toBe(text)
  }
})
