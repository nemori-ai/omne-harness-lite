import { expect, it } from 'vitest'
import { copyJsonValue, writeJsonLossless, LosslessNumber, type JsonObject } from '../src/index.ts'

it('owns independent nested copies and prototype-named data with the original descriptors', () => {
  const input = JSON.parse(
    '{"__proto__":{"value":1},"constructor":{"value":2},"nested":[{"value":3}]}',
  )
  input.exact = new LosslessNumber('9007199254740993')
  const first = copyJsonValue(input)
  if ('failed' in first) throw new Error('ordinary JSON required')
  const second = copyJsonValue(first.ok)
  if ('failed' in second) throw new Error('owned JSON required')
  expect(second.ok).not.toBe(first.ok)
  expect(Object.getPrototypeOf(first.ok)).toBe(Object.prototype)
  expect(Object.hasOwn(first.ok as object, '__proto__')).toBe(true)
  expect(Object.getOwnPropertyDescriptor(first.ok, '__proto__')).toMatchObject({
    enumerable: true,
    writable: false,
    configurable: false,
  })
  input.__proto__.value = 9
  input.nested[0].value = 9
  expect(writeJsonLossless(first.ok)).toBe(
    '{"__proto__":{"value":1},"constructor":{"value":2},"nested":[{"value":3}],"exact":9007199254740993}',
  )
  expect(writeJsonLossless(second.ok)).toBe(writeJsonLossless(first.ok))
})

it('rejects invalid descriptors without invoking caller getters', () => {
  let reads = 0
  const getter = Object.defineProperty({}, 'value', {
    get() {
      reads++
      return 1
    },
    enumerable: true,
  })
  const hidden = Object.defineProperty({}, 'value', { value: 1, enumerable: false })
  const symbol = { [Symbol('hidden')]: 1 }
  const sparse = [1, , 3]
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  for (const input of [getter, hidden, symbol, sparse, cyclic])
    expect(copyJsonValue(input)).toEqual({ failed: 'not_json' })
  expect(reads).toBe(0)
})

it('does not evaluate an inherited setter and copies shared input independently', () => {
  let writes = 0
  const key = 'jsonCopyInheritedSetter'
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    set() {
      writes++
    },
  })
  try {
    const shared = { value: 1 }
    const input = { [key]: shared, other: shared }
    const copied = copyJsonValue(input)
    if (
      'failed' in copied ||
      copied.ok === null ||
      typeof copied.ok !== 'object' ||
      Array.isArray(copied.ok)
    )
      throw new Error('JSON object required')
    const output = copied.ok as JsonObject
    expect(writes).toBe(0)
    expect(output[key]).toEqual(shared)
    expect(output[key]).not.toBe(shared)
    expect(output[key]).not.toBe(output.other)
    expect(Object.isFrozen(output[key])).toBe(true)
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype)
  } finally {
    Reflect.deleteProperty(Object.prototype, key)
  }
})
