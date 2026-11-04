import type { ModelObservationLimits } from './stream-types.ts'

export type StreamMeasure = Readonly<{ bytes: number; nodes: number; containers: number }>

/** Counts canonical JSON incrementally. A rejected value never allocates its encoded text. */
export function measureStreamValue(value: unknown, limit: number): StreamMeasure | null {
  let bytes = 0
  let nodes = 0
  let containers = 0
  function add(count: number): boolean {
    bytes += count
    return bytes <= limit
  }
  function string(text: string): boolean {
    if (!add(2)) return false
    for (const char of text) {
      const point = char.codePointAt(0) ?? 0
      const count =
        point === 34 || point === 92 || [8, 9, 10, 12, 13].includes(point)
          ? 2
          : point < 32 || (point >= 0xd800 && point <= 0xdfff)
            ? 6
            : Buffer.byteLength(char, 'utf8')
      if (!add(count)) return false
    }
    return true
  }
  function visit(item: unknown): boolean {
    nodes += 1
    if (typeof item === 'string') return string(item)
    if (item === null || typeof item === 'boolean') return add(String(item).length)
    if (typeof item === 'number' && Number.isFinite(item)) return add(JSON.stringify(item).length)
    if (typeof item !== 'object' || item === null) return false
    containers += 1
    if (!add(2)) return false
    return Array.isArray(item) ? array(item) : record(item)
  }
  /** Arrays must be dense; each element after the first adds its comma. */
  function array(items: readonly unknown[]): boolean {
    for (let index = 0; index < items.length; index += 1) {
      if (!Object.hasOwn(items, index) || (index > 0 && !add(1)) || !visit(items[index]))
        return false
    }
    return true
  }
  /** Keys in sorted order; only data properties count, an accessor rejects the value. */
  function record(item: object): boolean {
    let first = true
    for (const key of Object.keys(item).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)
      if (!descriptor || !('value' in descriptor)) return false
      if ((!first && !add(1)) || !string(key) || !add(1) || !visit(descriptor.value)) return false
      first = false
    }
    return true
  }
  return visit(value) ? { bytes, nodes, containers } : null
}

export function freezeStreamValue<T>(value: T): T {
  const copy: T = structuredClone(value)
  function freeze(item: unknown): void {
    if (item === null || typeof item !== 'object' || Object.isFrozen(item)) return
    for (const child of Object.values(item)) freeze(child)
    Object.freeze(item)
  }
  freeze(copy)
  return copy
}

export function createStreamBudget(limit: number) {
  let used = 0
  return {
    used: () => used,
    reserve(bytes: number): (() => void) | null {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit - used) return null
      used += bytes
      let released = false
      return () => {
        if (released) return
        released = true
        used -= bytes
      }
    },
  }
}

export function checkStreamLimits(limits: ModelObservationLimits): void {
  const fields = [
    'maxSnapshotBytes',
    'maxDeltaBytes',
    'maxQueuedFrames',
    'maxQueuedBytes',
    'maxObserversPerTenant',
    'maxObservers',
    'maxPendingSourceOperations',
    'maxRetainedCalls',
    'maxRetainedBytes',
    'maxTotalBytes',
    'maxQueueResidenceMs',
    'checkIntervalMs',
  ] satisfies readonly (keyof ModelObservationLimits)[]
  for (const field of fields) {
    const value = limits[field]
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new RangeError(`${field} must be a positive safe integer`)
  }
}

// Logical storage units, not RSS: iterator identity/control plus a maximum encoded terminal slot.
export const STREAM_OBSERVER_BYTES = 256 + 16384
