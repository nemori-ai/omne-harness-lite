import { LosslessNumber, type JsonValue } from '@omne-harness-lite/content-blocks'

// The branded private value is authoritative, not a caller's prototype Get implementation.
const sourceGetter = Object.getOwnPropertyDescriptor(LosslessNumber.prototype, 'source')?.get

class InputAdmissionError extends Error {}

function number(input: LosslessNumber): LosslessNumber {
  let owner: object | null = input
  const visited = new Set<object>()
  while (owner !== null) {
    if (visited.has(owner)) throw new InputAdmissionError()
    visited.add(owner)
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'source')
    if (descriptor !== undefined) {
      if (sourceGetter === undefined || descriptor.get !== sourceGetter || 'value' in descriptor)
        throw new InputAdmissionError()
      const source: unknown = Reflect.apply(sourceGetter, input, [])
      if (typeof source !== 'string') throw new Error('invalid trusted numeric source')
      return new LosslessNumber(source)
    }
    const next: unknown = Object.getPrototypeOf(owner)
    if (next !== null && typeof next !== 'object') throw new InputAdmissionError()
    owner = next
  }
  throw new InputAdmissionError()
}

/** Selection's owned JSON admission; numeric leaves must be captured before profile judges. */
export function captureSelectionJson(value: unknown): JsonValue | undefined {
  const active = new Set<object>()
  function capture(input: unknown): JsonValue {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new InputAdmissionError()
      return input
    }
    if (LosslessNumber.is(input)) return number(input)
    if (typeof input !== 'object' || active.has(input)) throw new InputAdmissionError()
    const prototype: unknown = Object.getPrototypeOf(input)
    const array = Array.isArray(input)
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new InputAdmissionError()
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (Object.getOwnPropertySymbols(input).length !== 0) throw new InputAdmissionError()
    active.add(input)
    try {
      if (array) {
        const length: unknown = descriptors.length?.value
        if (
          typeof length !== 'number' ||
          !Number.isInteger(length) ||
          length < 0 ||
          Object.keys(descriptors).length !== length + 1
        )
          throw new InputAdmissionError()
        const result: JsonValue[] = []
        for (let index = 0; index < length; index++) {
          const descriptor = descriptors[String(index)]
          if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable)
            throw new InputAdmissionError()
          const item: unknown = descriptor.value
          result.push(capture(item))
        }
        return Object.freeze(result)
      }
      const result: Record<string, JsonValue> = {}
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (!('value' in descriptor) || !descriptor.enumerable) throw new InputAdmissionError()
        const item: unknown = descriptor.value
        Object.defineProperty(result, key, { value: capture(item), enumerable: true })
      }
      return Object.freeze(result)
    } finally {
      active.delete(input)
    }
  }
  try {
    return capture(value)
  } catch (error) {
    if (error instanceof InputAdmissionError) return undefined
    throw error
  }
}
