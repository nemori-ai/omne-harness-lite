// The strict JSON judgement (SPEC 3.2, 4.4): a digest never hashes a lossy form.
import { describe, expect, it } from 'vitest'
import { canonicalJson, isStrictJson } from '../src/canonical.ts'

const cycle: Record<string, unknown> = {}
cycle['self'] = cycle

const notJson: [string, unknown][] = [
  ['undefined', undefined],
  ['bigint', 1n],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['function', () => 1],
  ['Date', new Date(0)],
  ['symbol', Symbol('s')],
  ['cycle', cycle],
  ['sparse array', [1, , 3]], // eslint-disable-line no-sparse-arrays
  ['array of holes', Object.assign([] as unknown[], { length: 2 })],
  ['array with an extra own key', Object.assign([1], { extra: 1 })],
  ['accessor property', Object.defineProperty({}, 'g', { get: () => 1, enumerable: true })],
  ['non-enumerable property', Object.defineProperty({}, 'h', { value: 1, enumerable: false })],
  ['symbol key', { [Symbol('k')]: 1 }],
  ['lone surrogate string', '\ud800'],
  ['lone surrogate key', { ['\ud800']: 1 }],
  ['class instance', new (class Box {})()],
]

describe('isStrictJson', () => {
  it.each(notJson)('rejects %s', (_name, value) => {
    expect(isStrictJson(value)).toBe(false)
  })

  it.each(notJson)('canonicalJson throws TypeError for %s', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError)
  })

  it('accepts null, booleans, finite numbers, paired surrogates, dense arrays and plain objects', () => {
    expect(isStrictJson({ a: [null, true, 1.5, '\u{1F600}'], b: Object.create(null) })).toBe(true)
  })

  it('accepts one object that appears twice but is not its own ancestor', () => {
    const shared = { x: 1 }
    expect(isStrictJson({ a: shared, b: shared })).toBe(true)
  })
})
