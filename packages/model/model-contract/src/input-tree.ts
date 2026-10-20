import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelInputRejection } from './judge-request.ts'

export const MODEL_INPUT_LIMITS = Object.freeze({
  maxNodes: 100_000,
  maxDepth: 64,
  maxStringLength: 8_388_608,
  maxTotalStringLength: 16_777_216,
  maxArrayLength: 16_384,
  maxObjectMembers: 64,
  maxKeyLength: 128,
})

export function rejected(field: string, reason: ModelInputRejection['reason']) {
  return fail<ModelInputRejection>({ field, reason })
}

type Captured = { keys: readonly PropertyKey[]; array: boolean }
function inspect(value: object, field: string): Outcome<Captured, ModelInputRejection> {
  let array: boolean
  let prototype: unknown
  let keys: readonly PropertyKey[]
  try {
    array = Array.isArray(value)
    prototype = Object.getPrototypeOf(value)
    keys = Reflect.ownKeys(value)
  } catch {
    return rejected(field, 'unreadable')
  }
  if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype)
    return rejected(field, 'prototype')
  return succeed({ keys, array })
}
export function dataField(
  value: object,
  key: PropertyKey,
  field: string,
  arrayLength = false,
): Outcome<PropertyDescriptor, ModelInputRejection> {
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key)
  } catch {
    return rejected(field, 'unreadable')
  }
  if (descriptor === undefined) return rejected(field, 'missing')
  if (!('value' in descriptor)) return rejected(field, 'accessor')
  if (!descriptor.enumerable && !arrayLength) return rejected(field, 'non-enumerable')
  return succeed(descriptor)
}

/** One budget per public boundary. Shared DAGs consume a budget for every occurrence. */
export class InputTree {
  private nodes: number
  private strings = 0
  private readonly ancestors = new Set<object>()
  constructor(admit = false) {
    this.nodes = admit ? 1 : 0
  }
  key(key: string, field: string): ModelInputRejection | null {
    if (key.length > MODEL_INPUT_LIMITS.maxKeyLength) return { field, reason: 'budget-key' }
    this.strings += key.length
    return this.strings > MODEL_INPUT_LIMITS.maxTotalStringLength
      ? { field, reason: 'budget-strings' }
      : null
  }
  copy(value: unknown, field: string, depth = 1): Outcome<unknown, ModelInputRejection> {
    this.nodes += 1
    if (this.nodes > MODEL_INPUT_LIMITS.maxNodes) return rejected(field, 'budget-nodes')
    if (typeof value === 'string') {
      if (value.length > MODEL_INPUT_LIMITS.maxStringLength) return rejected(field, 'budget-string')
      this.strings += value.length
      if (this.strings > MODEL_INPUT_LIMITS.maxTotalStringLength)
        return rejected(field, 'budget-strings')
      return succeed(value)
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number')
      return succeed(value)
    if (typeof value !== 'object') return rejected(field, 'type')
    if (depth > MODEL_INPUT_LIMITS.maxDepth) return rejected(field, 'budget-depth')
    if (this.ancestors.has(value)) return rejected(field, 'cycle')
    const observed = inspect(value, field)
    if ('failure' in observed) return observed
    this.ancestors.add(value)
    const copied = observed.ok.array
      ? this.array(value, observed.ok.keys, field, depth)
      : this.record(value, observed.ok.keys, field, depth)
    this.ancestors.delete(value)
    return copied
  }
  private array(
    value: object,
    keys: readonly PropertyKey[],
    field: string,
    depth: number,
  ): Outcome<unknown, ModelInputRejection> {
    const length = dataField(value, 'length', field, true)
    if ('failure' in length) return length
    const size: unknown = length.ok.value
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
      return rejected(field, 'type')
    if (size > MODEL_INPUT_LIMITS.maxArrayLength) return rejected(field, 'budget-array')
    if (keys.some(key => typeof key === 'symbol')) return rejected(field, 'symbol-key')
    for (const key of keys) {
      if (key === 'length') continue
      if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= size)
        return rejected(field, 'unknown-field')
    }
    if (keys.length !== size + 1) return rejected(field, 'sparse')
    const result: unknown[] = []
    for (let index = 0; index < size; index += 1) {
      const entry = dataField(value, String(index), field)
      if ('failure' in entry) return entry
      const copied = this.copy(entry.ok.value, field, depth + 1)
      if ('failure' in copied) return copied
      result.push(copied.ok)
    }
    return succeed(result)
  }
  private record(
    value: object,
    keys: readonly PropertyKey[],
    field: string,
    depth: number,
  ): Outcome<unknown, ModelInputRejection> {
    if (keys.length > MODEL_INPUT_LIMITS.maxObjectMembers) return rejected(field, 'budget-members')
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      if (typeof key !== 'string') return rejected(field, 'symbol-key')
      const budget = this.key(key, field)
      if (budget) return fail(budget)
      const entry = dataField(value, key, field)
      if ('failure' in entry) return entry
      const copied = this.copy(entry.ok.value, field, depth + 1)
      if ('failure' in copied) return copied
      Object.defineProperty(result, key, {
        value: copied.ok,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return succeed(result)
  }
}

/** Only call on owned, already bounded data. It never sees principal or tenant. */
export function freezeTree<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeTree(child)
    Object.freeze(value)
  }
  return value
}

export function captureRoot(
  value: object,
  keys: readonly string[],
): Outcome<void, ModelInputRejection> {
  const observed = inspect(value, '')
  if ('failure' in observed) return observed
  if (observed.ok.array) return rejected('', 'type')
  for (const key of observed.ok.keys) {
    if (typeof key !== 'string') return rejected('', 'symbol-key')
    if (!keys.includes(key)) return rejected('', 'unknown-field')
  }
  for (const key of keys) if (!observed.ok.keys.includes(key)) return rejected(`/${key}`, 'missing')
  return succeed(undefined)
}
