import { fail, succeed } from '@omne-harness/operation-result'
import type { ByteStore } from '../ports.ts'
import { isMediaKey } from '../sniff.ts'

/** What a memory store keeps; a store reopened over the same medium sees the same bytes. */
export type MemoryMedium = {
  readonly sealed: Map<string, Uint8Array>
  readonly writes: Map<string, Map<number, Uint8Array>>
}

export function createMemoryMedium(): MemoryMedium {
  return { sealed: new Map(), writes: new Map() }
}

const noWrite = fail({ kind: 'no-write' } as const)

export function createMemoryByteStore(
  medium: MemoryMedium = createMemoryMedium(),
  name = 'memory',
): ByteStore {
  const writeOf = (key: string): string => `write:${key}`
  const keyOf = (write: string): string => write.slice('write:'.length)
  return {
    name,
    async begin(key) {
      if (!isMediaKey(key)) return fail({ kind: 'invalid-key' })
      if (!medium.sealed.has(key) && !medium.writes.has(key)) medium.writes.set(key, new Map())
      return succeed({ write: writeOf(key) })
    },
    async append(write, sequence, part) {
      const parts = medium.writes.get(keyOf(write))
      if (parts === undefined) return noWrite
      parts.set(sequence, part.slice())
      return succeed(null)
    },
    async seal(write, count) {
      const key = keyOf(write)
      const done = medium.sealed.get(key)
      if (done !== undefined) return succeed({ bytes: done.byteLength })
      const parts = medium.writes.get(key)
      if (parts === undefined) return noWrite
      const ordered: Uint8Array[] = []
      for (let sequence = 0; sequence < count; sequence += 1) {
        const part = parts.get(sequence)
        if (part === undefined) return fail({ kind: 'gap' })
        ordered.push(part)
      }
      const whole = Buffer.concat(ordered)
      medium.sealed.set(key, new Uint8Array(whole))
      medium.writes.delete(key)
      return succeed({ bytes: whole.byteLength })
    },
    async open(key, range) {
      const whole = medium.sealed.get(key)
      if (whole === undefined) return fail({ kind: 'not-found' })
      const slice =
        range === undefined ? whole : whole.subarray(range.offset, range.offset + range.length)
      return succeed(
        (async function* () {
          if (slice.byteLength > 0) yield slice.slice()
        })(),
      )
    },
    async remove(key) {
      medium.sealed.delete(key)
      medium.writes.delete(key)
      return succeed(null)
    },
    async abort(write) {
      medium.writes.delete(keyOf(write))
      return succeed(null)
    },
  }
}
