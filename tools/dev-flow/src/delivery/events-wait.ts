import { closeSync, mkdirSync, openSync, readSync, statSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { matchEvent, parseEventLine, type EventPredicate, type EventRecord } from './events.ts'
import type { Reconcile } from './events-gh.ts'
import { InputError } from './protocol.ts'

/** The wait ended at its timeout without a matching event. */
export class WaitTimeout extends Error {
  override name = 'WaitTimeout'
}

export type WaitResult = EventRecord & { source: 'event' | 'reconcile' }

export type WaitOptions = {
  /** JSONL event file written by the receiver. It need not exist yet. */
  file: string
  predicate: EventPredicate
  /** An ISO time or a delivery id. Only events after it count. Absent: every line counts. */
  since?: string
  timeoutMs?: number
  /** One read of GitHub at the start. Not called again. */
  reconcile?: Reconcile
  signal?: AbortSignal
}

type Since = { kind: 'time'; ms: number; iso: string } | { kind: 'delivery'; id: string }

function parseSince(value: string | undefined): Since | undefined {
  if (value === undefined) return undefined
  const ms = Date.parse(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(ms))
    return { kind: 'time', ms, iso: new Date(ms).toISOString() }
  if (value.trim() === '') throw new InputError('--since is empty')
  return { kind: 'delivery', id: value }
}

/**
 * Blocks until a record that satisfies the predicate is in the event file. It reads the lines
 * that exist, then watches the directory of the file and reads each appended range once. A line
 * is parsed only when its newline has arrived. A delivery id counts once. The reconcile runs
 * once after the first read. The wait never calls GitHub again.
 *
 * Rejects with `WaitTimeout` at the timeout, `InputError` when a delivery id in `since` is not
 * in the file, and the reconcile error when the reconcile fails.
 */
export function waitForEvent(options: WaitOptions): Promise<WaitResult> {
  const { file, predicate, timeoutMs, reconcile, signal } = options
  const since = parseSince(options.since)
  return new Promise<WaitResult>((resolve, reject) => {
    mkdirSync(dirname(file), { recursive: true })
    let offset = 0,
      partial: Buffer = Buffer.alloc(0),
      gateOpen = since?.kind !== 'delivery',
      reconcileSince = since?.kind === 'time' ? since.iso : undefined,
      finished = false
    const seen = new Set<string>()

    /** Reads the bytes appended since the last read; returns the first matching record. */
    function drain(): WaitResult | undefined {
      let size: number
      try {
        size = statSync(file).size
      } catch {
        return undefined
      }
      if (size < offset) {
        offset = 0
        partial = Buffer.alloc(0)
      }
      if (size === offset) return undefined
      const data = Buffer.alloc(size - offset)
      const fd = openSync(file, 'r')
      try {
        readSync(fd, data, 0, data.length, offset)
      } finally {
        closeSync(fd)
      }
      offset = size
      const all = Buffer.concat([partial, data]),
        end = all.lastIndexOf(0x0a)
      if (end < 0) {
        partial = all
        return undefined
      }
      partial = all.subarray(end + 1)
      for (const line of all.subarray(0, end).toString('utf8').split('\n')) {
        const record = parseEventLine(line)
        if (record === undefined) continue
        if (record.delivery !== null) {
          if (seen.has(record.delivery)) continue
          seen.add(record.delivery)
        }
        if (!gateOpen) {
          if (since?.kind === 'delivery' && record.delivery === since.id) {
            gateOpen = true
            reconcileSince = record.receivedAt
          }
          continue
        }
        if (since?.kind === 'time' && Date.parse(record.receivedAt) <= since.ms) continue
        if (matchEvent(record, predicate)) return { ...record, source: 'event' }
      }
      return undefined
    }

    const watcher = watch(dirname(file), (_type, name) => {
      if (name === null || name === basename(file)) check()
    })
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(
            () => settle(() => reject(new WaitTimeout(`No matching event within ${timeoutMs} ms`))),
            timeoutMs,
          )
    const onAbort = () => settle(() => reject(signal?.reason ?? new Error('aborted')))
    function settle(finish: () => void): void {
      if (finished) return
      finished = true
      watcher.close()
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      finish()
    }
    function check(): void {
      if (finished) return
      try {
        const hit = drain()
        if (hit !== undefined) settle(() => resolve(hit))
      } catch (error) {
        settle(() => reject(error))
      }
    }
    watcher.on('error', error => settle(() => reject(error)))
    if (signal?.aborted === true) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })

    check()
    if (finished) return
    if (!gateOpen) {
      settle(() =>
        reject(new InputError('The --since delivery id is not in the event file. Nothing waited.')),
      )
      return
    }
    if (reconcile === undefined) return
    void (async () => reconcile(predicate, reconcileSince))().then(
      hit => {
        if (hit !== undefined) settle(() => resolve({ ...hit, source: 'reconcile' }))
      },
      (error: unknown) => settle(() => reject(error)),
    )
  })
}
