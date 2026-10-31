import { expect, it } from 'vitest'
import { isCanonicalMediaType, judgeMediaType } from '@omne-harness/modality'

it.each([
  ['text/csv', 'text/csv', 'text'],
  ['text/plain; charset=utf-8', 'text/plain', 'text'],
  ['image/png', 'image/png', 'image'],
  ['image/svg+xml', 'image/svg+xml', 'image'],
  ['audio/wav', 'audio/wav', 'voice'],
  ['audio/midi', 'audio/midi', 'voice'],
  ['audio/x-custom', 'audio/x-custom', 'voice'],
  ['video/mp4;codecs=avc1', 'video/mp4', 'video'],
  ['video/mp4 ; codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4', 'video'],
  ['Image/PNG', 'image/png', 'image'],
  ['IMAGE/Svg+XML', 'image/svg+xml', 'image'],
  ['application/pdf', 'application/pdf', null],
  ['application/vnd.ms-excel', 'application/vnd.ms-excel', null],
  ['font/woff2', 'font/woff2', null],
  ['model/gltf-binary', 'model/gltf-binary', null],
  ['multipart/form-data; boundary=x', 'multipart/form-data', null],
])('reads %j as %s with modality %s', (value, mediaType, modality) => {
  expect(judgeMediaType(value)).toEqual({ ok: { mediaType, modality } })
})

it('does not give vendor and suffix parts a meaning of their own', () => {
  expect(judgeMediaType('application/vnd.example+png')).toEqual({
    ok: { mediaType: 'application/vnd.example+png', modality: null },
  })
  expect(judgeMediaType('application/x-image')).toEqual({
    ok: { mediaType: 'application/x-image', modality: null },
  })
})

it('keeps a quoted parameter value that contains a semicolon and an escaped quote', () => {
  expect(judgeMediaType('text/plain; note="a;b\\"c"')).toEqual({
    ok: { mediaType: 'text/plain', modality: 'text' },
  })
})

it.each([
  'image/png;',
  'image/png; ',
  'image/png ;',
  'image/png;;',
  'image/png; ;a=b',
  'image/png;a=b;',
  'image/png;a=b; ;c=d',
  'image/png\t;',
  'image/png;\t',
])('accepts the empty parameter slot in %j and reads it as image/png', value => {
  expect(judgeMediaType(value)).toEqual({ ok: { mediaType: 'image/png', modality: 'image' } })
})

it.each(['image/png\t;\ta=b', 'image/png\t;a=b', 'image/png;\ta=b', 'image/png \t; \ta=b'])(
  'accepts a horizontal tab as optional whitespace around the semicolon in %j',
  value => {
    expect(judgeMediaType(value)).toEqual({ ok: { mediaType: 'image/png', modality: 'image' } })
  },
)

it.each([
  'image/png;a = b',
  'image/png;a= b',
  'image/png;a =b',
  'image/png;a=\tb',
  'image/png;a\t=b',
])('rejects whitespace around the equals sign in %j', value => {
  expect(judgeMediaType(value)).toEqual({ rejected: 'media-type' })
})

it.each([
  ['obs-text in the quoted text', 'image/png;a="\u0080ÿ"'],
  ['obs-text after a backslash', 'image/png;a="\\\u0080\\ÿ"'],
  ['a tab and a space in the quoted text', 'image/png;a="\t x"'],
  ['a tab and a space after a backslash', 'image/png;a="\\\t\\ "'],
  ['an empty quoted string', 'image/png;a=""'],
])('accepts a quoted parameter value with %s', (_case, value) => {
  expect(judgeMediaType(value)).toEqual({ ok: { mediaType: 'image/png', modality: 'image' } })
})

it.each([
  ['a code unit above U+00FF in the quoted text', 'image/png;a="Ā"'],
  ['a code unit above U+00FF after a backslash', 'image/png;a="\\Ā"'],
  ['DEL in the quoted text', 'image/png;a="\u007f"'],
  ['DEL after a backslash', 'image/png;a="\\\u007f"'],
  ['NUL in the quoted text', 'image/png;a="\u0000"'],
  ['a line feed after a backslash', 'image/png;a="\\\n"'],
  ['a backslash that escapes the closing quote', 'image/png;a="\\"'],
  ['obs-text outside quotes', 'image/png;a=é'],
])('rejects a quoted parameter value with %s', (_case, value) => {
  expect(judgeMediaType(value)).toEqual({ rejected: 'media-type' })
})

/** RFC 9110 §5.6.2 的全部 tchar 符号，外加数字与大小写字母的两端。 */
const TCHARS = [..."!#$%&'*+-.^_`|~", '0', '9', 'A', 'Z', 'a', 'z']
/** 不是 tchar 的字符：RFC 9110 §5.6.2 的分隔符、空白、控制字符与 obs-text。 */
const NON_TCHARS = [...'"(),/:;<=>?@[\\]{}', ' ', '\t', '\u007f', '\u0000', 'é']
const TOKEN_POSITIONS = [
  {
    position: 'type',
    place: (token: string) => `${token}/png`,
    readsAs: (token: string) => `${token.toLowerCase()}/png`,
  },
  {
    position: 'subtype',
    place: (token: string) => `image/${token}`,
    readsAs: (token: string) => `image/${token.toLowerCase()}`,
  },
  {
    position: 'parameter name',
    place: (token: string) => `image/png;${token}=v`,
    readsAs: () => 'image/png',
  },
  {
    position: 'parameter value',
    place: (token: string) => `image/png;n=${token}`,
    readsAs: () => 'image/png',
  },
]

it.each(
  TOKEN_POSITIONS.flatMap(({ position, place, readsAs }) =>
    TCHARS.map(char => [char, position, place(`x${char}y`), readsAs(`x${char}y`)]),
  ),
)('accepts the tchar %j in the %s of %j', (_char, _position, value, mediaType) => {
  expect(judgeMediaType(value)).toMatchObject({ ok: { mediaType } })
})

it.each(
  TOKEN_POSITIONS.flatMap(({ position, place }) =>
    NON_TCHARS.map(char => [char, position, place(`x${char}y`)]),
  ),
)('rejects the non-tchar %j in the %s of %j', (_char, _position, value) => {
  expect(judgeMediaType(value)).toEqual({ rejected: 'media-type' })
})

it('rejects adversarial input within a second instead of backtracking', () => {
  const inputs = [
    `image/png${';  '.repeat(18)}!`,
    `image/png${'; '.repeat(50_000)}!`,
    `image/png;a="${'\\'.repeat(100_000)}`,
    `image/png${'; a=b'.repeat(20_000)} `,
    `image/png;${' '.repeat(100_000)}x`,
    `image/png${' \t'.repeat(50_000)};!`,
  ]
  for (const value of inputs) {
    const started = performance.now()
    expect(judgeMediaType(value)).toEqual({ rejected: 'media-type' })
    expect(performance.now() - started).toBeLessThan(1_000)
  }
})

it('reads a million parameter slots without exhausting the regex backtracking stack', () => {
  expect(judgeMediaType(`image/png${';a=b'.repeat(1_000_000)}`)).toEqual({
    ok: { mediaType: 'image/png', modality: 'image' },
  })
})

it.each([
  '',
  'image',
  'image/',
  '/png',
  '/',
  ' image/png',
  'image/png ',
  '\timage/png',
  'image/png\n',
  'image/png\r\n',
  'image/png;a=b ',
  'image/png; a=b\t',
  'image/png@;a=b',
  'image/png;a=b c;d=e',
  'image/png;a="b"c;d=e',
  'image/png/x',
  'image/p ng',
  'ima ge/png',
  'image/png;charset',
  'image/png;charset=',
  'image/png;=utf-8',
  'image/png;charset=utf 8',
  'image/png;charset="unterminated',
  'image/png;charset="bad"quote"',
  'image/png,image/jpeg',
  'image/(png)',
  'image/png@x',
  'image/é',
])('rejects the ill-formed text %j with media-type', value => {
  expect(judgeMediaType(value)).toEqual({ rejected: 'media-type' })
})

it.each([undefined, null, 1, true, ['image/png'], { mediaType: 'image/png' }])(
  'rejects the non-string %j with type',
  value => {
    expect(judgeMediaType(value)).toEqual({ rejected: 'type' })
  },
)

it.each(['text/csv', 'image/png', 'image/svg+xml', 'audio/wav', 'application/pdf', 'font/woff2'])(
  'treats the canonical form %s as canonical',
  value => {
    expect(isCanonicalMediaType(value)).toBe(true)
  },
)

it.each([
  'Image/PNG',
  'image/png;charset=utf-8',
  'video/mp4;codecs=avc1',
  'image/png ',
  ' image/png',
  'IMAGE/png',
  'image/png;',
  'image/png\t;',
])('treats the non-canonical %j as not canonical', value => {
  expect(isCanonicalMediaType(value)).toBe(false)
})

it.each(['', 'image', 'image/', 'image/png/x'])(
  'treats the ill-formed %j as not canonical',
  value => {
    expect(isCanonicalMediaType(value)).toBe(false)
  },
)

it('treats a non-string passed through a loose boundary as not canonical', () => {
  expect(isCanonicalMediaType(undefined as unknown as string)).toBe(false)
})
