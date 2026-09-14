import { describe, expect, it } from 'vitest'
import { canonicalJson, copyJson, equalJson } from '../dist/index.js'

const limits = { maxBytes: 1_024, maxDepth: 8, maxNodes: 32 }

describe('A31 strict JSON value snapshots', () => {
  it('deeply freezes Checked success and failure outputs', () => {
    const success = copyJson({ value: 1 }, limits)
    expect(success.ok).toBe(true)
    expect(Object.isFrozen(success)).toBe(true)

    const failure = copyJson({ value: undefined }, limits)
    expect(failure.ok).toBe(false)
    expect(Object.isFrozen(failure)).toBe(true)
    if (!failure.ok) {
      expect(Object.isFrozen(failure.issues)).toBe(true)
      expect(Object.isFrozen(failure.issues[0])).toBe(true)
    }
  })

  it('copies ordinary and null-prototype data into a detached, deeply frozen snapshot', () => {
    const child = Object.assign(Object.create(null) as Record<string, unknown>, { value: 1 })
    const input = { child, list: [true, null] }
    const result = copyJson(input, limits)
    expect(result).toEqual({ ok: true, value: input })
    if (!result.ok) return

    const value = result.value as { child: object; list: readonly unknown[] }
    expect(value).not.toBe(input)
    expect(value.child).not.toBe(child)
    expect(value.list).not.toBe(input.list)
    expect(Object.getPrototypeOf(value)).toBeNull()
    expect(Object.getPrototypeOf(value.child)).toBeNull()
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.child)).toBe(true)
    expect(Object.isFrozen(value.list)).toBe(true)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(child)).toBe(false)
  })

  it('copies __proto__ as inert data on a null-prototype result', () => {
    const input = Object.create(null) as Record<string, unknown>
    Object.defineProperty(input, '__proto__', { value: { safe: true }, enumerable: true })
    const result = copyJson(input, limits)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.getPrototypeOf(result.value)).toBeNull()
      expect(Object.prototype.hasOwnProperty.call(result.value, '__proto__')).toBe(true)
    }
  })

  it('does not invoke getters or toJSON while rejecting them', () => {
    let calls = 0
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        calls += 1
        return 1
      },
    })
    const withToJson = {
      value: 1,
      toJSON() {
        calls += 1
        return { value: 2 }
      },
    }
    expect(copyJson(accessor, limits).ok).toBe(false)
    expect(copyJson(withToJson, limits).ok).toBe(false)
    expect(calls).toBe(0)
  })

  it.each([
    ['class instance', new (class Value { value = 1 })()],
    ['date', new Date(0)],
    ['undefined property', { value: undefined }],
    ['function property', { value() {} }],
    ['bigint property', { value: 1n }],
    ['non-finite number', { value: Number.POSITIVE_INFINITY }],
    ['negative zero', { value: -0 }],
    ['unsafe integer', { value: Number.MAX_SAFE_INTEGER + 1 }],
    ['symbol property', Object.assign({ value: 1 }, { [Symbol('hidden')]: 2 })],
  ])('rejects %s', (_label, value) => {
    expect(copyJson(value, limits).ok).toBe(false)
  })

  it('rejects cycles, sparse arrays, extra array properties and hidden object data', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const sparse = new Array(2)
    sparse[1] = 1
    const extra = [1] as unknown[] & { extra?: number }
    extra.extra = 2
    const hidden = Object.defineProperty({ visible: 1 }, 'hidden', { value: 2 })

    expect(copyJson(cyclic, limits).ok).toBe(false)
    expect(copyJson(sparse, limits).ok).toBe(false)
    expect(copyJson(extra, limits).ok).toBe(false)
    expect(copyJson(hidden, limits).ok).toBe(false)
  })

  it('enforces canonical UTF-8 bytes, depth and nodes for value inputs', () => {
    expect(copyJson('é', { ...limits, maxBytes: 3 })).toMatchObject({ ok: false, issues: [{ code: 'capacity' }] })
    expect(copyJson({ a: { b: 1 } }, { ...limits, maxDepth: 1 })).toMatchObject({ ok: false, issues: [{ path: '/a/b', code: 'capacity' }] })
    expect(copyJson([0, 1], { ...limits, maxNodes: 2 })).toMatchObject({ ok: false, issues: [{ path: '/1', code: 'capacity' }] })
  })
})

describe('A31 core-json/1 canonical encoding', () => {
  it('matches fixed golden strings with UTF-16 key order and JSON escaping', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, {
      z: [1e3, true, null],
      a: 'line\n"quoted"',
      '\uE000': 1,
      '😀': 2,
    })
    expect(canonicalJson(value as never)).toBe('{"a":"line\\n\\"quoted\\"","z":[1000,true,null],"😀":2,"":1}')
  })

  it('compares JSON structure independently of object insertion order', () => {
    expect(equalJson({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true)
    expect(equalJson([1, 2], [2, 1])).toBe(false)
  })

  it('throws a named programming error for invalid runtime input without invoking accessors', () => {
    let calls = 0
    const invalid = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        calls += 1
        return 1
      },
    })
    expect(() => canonicalJson(invalid as never)).toThrowError(expect.objectContaining({ name: 'InvalidJsonValueError' }))
    expect(() => canonicalJson(-0)).toThrowError(expect.objectContaining({ name: 'InvalidJsonValueError' }))
    expect(calls).toBe(0)
  })
})
