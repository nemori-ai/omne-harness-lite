import { randomUUID } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  addInteger,
  checkAppendInput,
  compareInteger,
  type AppendRequest,
  type LogEntry,
  type OwnedLogEntry,
  type SessionLog,
  type SessionLogBackingOperations,
} from '@omne-harness-lite/session-log'

const unavailable = Object.freeze({ failure: 'unavailable' as const })

function sameValue(left: JsonValue, right: JsonValue): boolean {
  if (isJsonNumber(left) || isJsonNumber(right))
    return (
      isJsonNumber(left) &&
      isJsonNumber(right) &&
      ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
    )
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, i) => right[i] !== undefined && sameValue(value, right[i]))
    )
  const a = left as { readonly [key: string]: JsonValue }
  const b = right as { readonly [key: string]: JsonValue }
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(
      ([key, value]) => Object.hasOwn(b, key) && b[key] !== undefined && sameValue(value, b[key]),
    )
  )
}

function sameEntry(expected: OwnedLogEntry, actual: LogEntry): boolean {
  const { position: _position, session: _session, ...entry } = actual
  // Both sides are owned exchange values; this also checks tenant, run, attempt and keys.
  return sameValue(expected as unknown as JsonValue, entry as unknown as JsonValue)
}

/** Construct once per physical owner. The application retains this controller after service disposal. */
export function createSessionLogBacking(source: SessionLog) {
  let admitting = true
  const borrows = new Set<{ readonly release: () => Promise<void> }>()
  const operations: SessionLogBackingOperations = {
    ownerGeneration: randomUUID(),
    borrow() {
      if (!admitting) throw new Error('session log backing stopped')
      let open = true
      let released = false
      let releasing: Promise<void> | undefined
      const active = new Set<Promise<unknown>>()
      const unknown = new Set<AppendRequest>()

      function track<T>(work: () => Promise<T>): Promise<T> {
        const task = Promise.resolve().then(work)
        active.add(task)
        void task.then(
          () => active.delete(task),
          () => active.delete(task),
        )
        return task
      }

      const log = Object.freeze<SessionLog>({
        append(session, entries, fence, condition) {
          if (!open) return Promise.resolve(unavailable)
          const checked = checkAppendInput(session, entries, fence, condition)
          if ('failure' in checked) return Promise.resolve(checked)
          const request = checked.ok
          return track(async () => {
            // Hold the exact batch before invoking the foreign IO operation.
            unknown.add(request)
            try {
              const result = await source.append(
                request.session,
                request.entries,
                request.fence,
                request.condition,
              )
              if (!('failure' in result) || result.failure !== 'unavailable')
                unknown.delete(request)
              return result
            } catch (error) {
              // Exceptions do not prove zero physical writes. Preserve the original defect.
              throw error
            }
          })
        },
        readByKey(session, key) {
          return open ? track(() => source.readByKey(session, key)) : Promise.resolve(unavailable)
        },
        readSince(session, after) {
          return open ? track(() => source.readSince(session, after)) : Promise.resolve(unavailable)
        },
      })

      async function recognize(request: AppendRequest): Promise<boolean> {
        if (request.entries.some(entry => entry.dedupeKey === undefined)) return false
        const result = await source.readSince(request.session, 0)
        if ('failure' in result) return false
        let position: import('@omne-harness-lite/content-blocks').JsonNumber = 0
        for (const entry of result.entries) {
          position = addInteger(position, 1)
          if (entry.session !== request.session || compareInteger(entry.position, position) !== 0)
            return false
        }
        if (compareInteger(position, result.tail) !== 0) return false
        const firstKey = request.entries[0]?.dedupeKey
        const start = result.entries.findIndex(entry => entry.dedupeKey === firstKey)
        if (start < 0) return false
        return request.entries.every((entry, i) => {
          const found = result.entries[start + i]
          return (
            found !== undefined &&
            sameEntry(entry, found) &&
            result.entries.filter(item => item.dedupeKey === entry.dedupeKey).length === 1
          )
        })
      }

      const borrow = Object.freeze({
        log,
        release(): Promise<void> {
          open = false
          if (released) return Promise.resolve()
          if (releasing) return releasing
          const task = Promise.resolve().then(async () => {
            await Promise.allSettled([...active])
            for (const request of unknown) {
              try {
                if (await recognize(request)) unknown.delete(request)
              } catch {
                /* An unavailable or malformed read cannot discharge ownership. */
              }
            }
            if (unknown.size !== 0) throw new Error('session log borrow has unresolved writes')
            released = true
            borrows.delete(borrow)
          })
          releasing = task
          void task.then(
            () => {
              releasing = undefined
            },
            () => {
              releasing = undefined
            },
          )
          return task
        },
      })
      borrows.add(borrow)
      return borrow
    },
  }
  return Object.freeze({
    operations: Object.freeze(operations),
    closeAdmission() {
      admitting = false
    },
    async drain() {
      admitting = false
      const results = await Promise.allSettled([...borrows].map(borrow => borrow.release()))
      if (results.some(result => result.status === 'rejected') || borrows.size !== 0)
        throw new Error('session log backing has unresolved borrows')
    },
    get retained() {
      return borrows.size
    },
  })
}
