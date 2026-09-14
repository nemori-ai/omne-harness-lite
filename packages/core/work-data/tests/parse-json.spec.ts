import { describe, expect, it } from 'vitest'
import { parseJson } from '../dist/index.js'

const limits = { maxBytes: 1_024, maxDepth: 8, maxNodes: 32 }

describe('A31 strict JSON text parsing', () => {
  it('returns a detached frozen value for strict JSON', () => {
    const result = parseJson('{"z":[true,null],"a":1e3}', limits)
    expect(result).toEqual({ ok: true, value: { z: [true, null], a: 1_000 } })
    if (result.ok) {
      expect(Object.getPrototypeOf(result.value)).toBeNull()
      expect(Object.isFrozen(result.value)).toBe(true)
      expect(Object.isFrozen((result.value as { z: unknown }).z)).toBe(true)
    }
  })

  it.each([
    ['comments', '{"a":1/* comment */}'],
    ['trailing comma', '{"a":1,}'],
    ['empty input', ''],
    ['partial input', '{"a":1'],
  ])('rejects %s', (_label, text) => {
    const result = parseJson(text, limits)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.code).toBe('invalid_json')
  })

  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":1,"\\u005f_proto__":2}',
  ])('rejects duplicate decoded object keys: %s', (text) => {
    const result = parseJson(text, limits)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({ code: 'invalid_json' })
      expect(result.issues[0]?.message).toContain('duplicate')
    }
  })

  it.each([
    ['unsafe integer', '9007199254740992'],
    ['rounded integer', '9007199254740993'],
    ['rounded fraction', '0.100000000000000005'],
    ['negative zero', '-0'],
    ['negative zero exponent', '-0e10'],
    ['overflow', '1e400'],
    ['underflow', '1e-400'],
  ])('rejects unsupported number: %s', (_label, text) => {
    const result = parseJson(text, limits)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]?.code).toBe('unsupported_number')
  })

  it.each(['1e3', '1000', '1.25', '1.2500', '0.000001', '1e-7'])('accepts exactly represented number token %s', (text) => {
    expect(parseJson(text, limits).ok).toBe(true)
  })

  it.each([
    String(Number.MAX_SAFE_INTEGER),
    String(Number.MIN_SAFE_INTEGER),
    '1e+3',
    '0e999999999999999999999999',
  ])('accepts the supported numeric boundary %s', (text) => {
    expect(parseJson(text, limits).ok).toBe(true)
  })

  it('reports nested duplicates at an escaped JSON Pointer and treats __proto__ as inert data', () => {
    expect(parseJson('{"a/b":{"~key":1,"\\u007ekey":2}}', limits)).toMatchObject({
      ok: false,
      issues: [{ path: '/a~1b/~0key', code: 'invalid_json' }],
    })
    const accepted = parseJson('{"__proto__":{"safe":true}}', limits)
    expect(accepted.ok).toBe(true)
    if (accepted.ok) {
      expect(Object.getPrototypeOf(accepted.value)).toBeNull()
      expect(Object.prototype.hasOwnProperty.call(accepted.value, '__proto__')).toBe(true)
    }
  })

  it('enforces raw UTF-8 bytes, root-relative depth and value node count', () => {
    expect(parseJson('"é"', { ...limits, maxBytes: 3 })).toMatchObject({ ok: false, issues: [{ code: 'capacity' }] })
    expect(parseJson('{"a":{"b":1}}', { ...limits, maxDepth: 1 })).toMatchObject({ ok: false, issues: [{ path: '/a/b', code: 'capacity' }] })
    expect(parseJson('[0,1]', { ...limits, maxNodes: 2 })).toMatchObject({ ok: false, issues: [{ path: '/1', code: 'capacity' }] })
  })

  it.each([
    ['depth', { maxBytes: 100_000, maxDepth: 8, maxNodes: 32 }, `/${'0/'.repeat(8)}0`],
    ['nodes', { maxBytes: 100_000, maxDepth: 20_000, maxNodes: 32 }, `/${'0/'.repeat(31)}0`],
  ])('returns a capacity issue before recursive parsing exceeds the stack: %s', (_label, deepLimits, path) => {
    const depth = 20_000
    const text = `${'['.repeat(depth)}0${']'.repeat(depth)}`

    expect(parseJson(text, deepLimits)).toMatchObject({
      ok: false,
      issues: [{ path, code: 'capacity' }],
    })
  })
})
