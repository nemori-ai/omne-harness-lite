import { expect, it, vi } from 'vitest'
import { encodeToolMaterial } from '@omne-harness/tool'

it.each([
  {
    value: { '2': 'two', '10': 'ten' },
    text: '{"10":"ten","2":"two"}',
    bytes: '22',
    digest: 'b71e124675fc80e7314688bffdb68e83515851fb51474125db9a0c4c8aca3808',
  },
  {
    value: { b: [true, null], a: -0 },
    text: '{"a":0,"b":[true,null]}',
    bytes: '23',
    digest: 'ebd0d1dce2648d6e6a392d4c6314238345a127e7597ff0745787623150972106',
  },
  {
    value: '中🙂',
    text: '"中🙂"',
    bytes: '9',
    digest: '596813cba2a56fa013829710fd088ccf4c88dc47dd1f6d1a961328c4a7e5e906',
  },
  {
    value: { kind: 'number', lexeme: '1.0' },
    text: '{"kind":"number","lexeme":"1.0"}',
    bytes: '32',
    digest: '842b0fade85fdf871d443011e6b783fe02168b108dfc52734b3cb1d25052bd67',
  },
])('M02.1 encodes the fixed vector $text', ({ value, text, bytes, digest }) => {
  const encoded = encodeToolMaterial(value)
  if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
  expect(new TextDecoder().decode(encoded.ok.bytes)).toBe(text)
  expect(encoded.ok.fingerprint).toEqual({
    codec: 'tool-canonical-json-v1',
    algorithm: 'sha256',
    bytes,
    digest,
  })
})

it.each([
  undefined,
  NaN,
  Infinity,
  -Infinity,
  1n,
  Symbol('value'),
  () => 1,
  { optional: undefined },
  [undefined],
  new Array(2),
  new Date(0),
  new Map(),
  new Set(),
  new Uint8Array([1]),
  Object.create({ inherited: true }),
  { [Symbol('hidden')]: 1 },
  Object.assign([], { extra: 'not an element' }),
])('M02.1 rejects non-data input %# without a success fingerprint', value => {
  expect(encodeToolMaterial(value)).toEqual({
    failure: { kind: 'invalid', field: 'material', reason: 'not canonical JSON data' },
  })
})

it('rejects accessors without evaluating them', () => {
  const get = vi.fn(() => 'do not execute')
  for (const value of [
    Object.defineProperty({}, 'value', { get }),
    Object.defineProperty([], '0', { get }),
  ])
    expect(encodeToolMaterial(value)).toHaveProperty('failure')
  expect(get).not.toHaveBeenCalled()
})

it('rejects cycles but permits repeated references to the same data', () => {
  const circular: Record<string, unknown> = {}
  circular['self'] = circular
  expect(encodeToolMaterial(circular)).toHaveProperty('failure')
  const shared = { a: 1 }
  const encoded = encodeToolMaterial([shared, shared])
  if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
  expect(new TextDecoder().decode(encoded.ok.bytes)).toBe('[{"a":1},{"a":1}]')
})

it('does not run Proxy traps or toJSON hooks', () => {
  const getPrototypeOf = vi.fn(() => Object.prototype)
  const toJSON = vi.fn(() => ({}))
  expect(encodeToolMaterial(new Proxy({}, { getPrototypeOf }))).toHaveProperty('failure')
  expect(encodeToolMaterial({ toJSON })).toHaveProperty('failure')
  expect(getPrototypeOf).not.toHaveBeenCalled()
  expect(toJSON).not.toHaveBeenCalled()
})

it.each([
  { value: { '\uE000': 1, '\u{10000}': 2 }, text: '{"\u{10000}":2,"\uE000":1}' },
  { value: '\uD800', text: '"\\ud800"' },
  { value: ['é', 'e\u0301'], text: '["é","é"]' },
  { value: [1e21, 1e-7, 5e-324], text: '[1e+21,1e-7,5e-324]' },
  {
    value: Object.defineProperty(Object.create(null), 'hidden', { value: 1 }),
    text: '{"hidden":1}',
  },
  { value: JSON.parse('{"__proto__":1}'), text: '{"__proto__":1}' },
])('preserves the v1 representation $text', ({ value, text }) => {
  const encoded = encodeToolMaterial(value)
  if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
  expect(new TextDecoder().decode(encoded.ok.bytes)).toBe(text)
})
