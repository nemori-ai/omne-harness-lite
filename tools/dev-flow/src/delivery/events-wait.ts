import { closeSync, mkdirSync, openSync, readSync, statSync, watch, type Stats } from 'node:fs'
import { basename, dirname } from 'node:path'
import {
  errorCode,
  matchedMember,
  parseEventLine,
  type AtomicPredicate,
  type EventPredicate,
  type EventRecord,
} from './events.ts'
import { commentIdOf, type Reconcile } from './events-gh.ts'
import { InputError } from './protocol.ts'

/** The wait ended at its timeout without a matching event. */
export class WaitTimeout extends Error {
  override name = 'WaitTimeout'
}

/** `matched` is the kind of the satisfied member and is present only for an `any` predicate. */
export type WaitResult = EventRecord & {
  source: 'event' | 'reconcile'
  matched?: AtomicPredicate['kind']
}

export type WaitOptions = {
  /** JSONL event file written by the receiver. It need not exist yet. */
  file: string
  repository?: string
  predicate: EventPredicate
  /**
   * An ISO time or a delivery id. An ISO time counts records at or after it; the event file is
   * judged by `receivedAt`, GitHub by `created_at`. A delivery id counts the lines after it.
   * Absent: every record counts.
   */
  since?: string
  /** Ids of comments that the caller has handled. Neither the event file nor GitHub hands them back. */
  seen?: readonly string[]
  timeoutMs?: number
  /** Reads authoritative state at startup and on channel events or reconnection. */
  reconcile?: Reconcile
  signal?: AbortSignal
}

/**
 * What to pass to the next wait after a hit: the start point exactly as the caller gave it, and
 * the handled comment ids with the one that this hit carries. The start point never moves, so no
 * time is converted between the clock of the event file and the clock of GitHub.
 */
export type NextWait = { since?: string; seen: string[] }

export function nextWait(
  input: { since?: string | undefined; seen?: readonly string[] | undefined },
  hit: EventRecord,
): NextWait {
  const id = hit.event === 'issue_comment' ? commentIdOf(hit.html_url) : undefined
  const seen = [...new Set([...(input.seen ?? []), ...(id === undefined ? [] : [id])])]
  return { ...(input.since === undefined ? {} : { since: input.since }), seen }
}

/** Interval of the local re-read of the event file, in case a watch event is lost. */
const LOCAL_RECHECK_MS = 5000

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
 * that exist, then watches the directory of the file and reads each appended range once. It also
 * re-reads the file every 5 s in case a watch event is lost. A line is parsed only when its
 * newline has arrived. A delivery id counts once. A comment whose id is in `seen` never counts,
 * in the file or on GitHub. The reconcile runs once after the first read, once per member for an
 * `any` predicate, and stops at the first member that holds or when an event has already matched.
 * At the timeout the file is read once more and the reconcile runs once more before the wait gives
 * up; a record that this last read finds is a hit. Channel events are hints and require
 * authoritative reconciliation. Connected and reconnected diagnostics request one bounded
 * reconciliation. Local file checks do not poll GitHub. Reconciliation calls run serially; hints
 * received during a read are retained.
 *
 * Rejects with `WaitTimeout` at the timeout when the last read finds nothing, `InputError` when a
 * delivery id in `since` is not in the file, and the reconcile error when the reconcile fails.
 */
export function waitForEvent(options: WaitOptions): Promise<WaitResult> {
  const { file, predicate, timeoutMs, reconcile, signal } = options
  const since = parseSince(options.since)
  return new Promise<WaitResult>((resolve, reject) => {
    mkdirSync(dirname(file), { recursive: true })
    let offset = 0,
      partial: Buffer = Buffer.alloc(0),
      gateOpen = since?.kind !== 'delivery',
      finished = false,
      expired = false,
      reconcilePending = false,
      reconciling = false,
      inode: number | undefined
    const deliveries = new Set<string>()
    // Comment ids that never count: the caller's `seen`, and with a delivery id as start point the
    // comments of the lines up to that id. The start point of GitHub is only ever an ISO time.
    const excluded = new Set(options.seen)
    const reconcileSince = since?.kind === 'time' ? since.iso : undefined

    /**
     * Reads the bytes appended since the last read; returns the first matching record. A file
     * that is shorter than the last read, or is another file (another inode), is read from the
     * start. A missing file is no error; every other stat error is thrown.
     */
    function drain(): WaitResult | undefined {
      let stat: Stats
      try {
        stat = statSync(file)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return undefined
        throw error
      }
      const size = stat.size
      if (size < offset || (inode !== undefined && stat.ino !== inode)) {
        offset = 0
        partial = Buffer.alloc(0)
      }
      inode = stat.ino
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
          if (deliveries.has(record.delivery)) continue
          deliveries.add(record.delivery)
        }
        const id = record.event === 'issue_comment' ? commentIdOf(record.html_url) : undefined
        if (!gateOpen) {
          if (id !== undefined) excluded.add(id)
          if (since?.kind === 'delivery' && record.delivery === since.id) gateOpen = true
          continue
        }
        if (since?.kind === 'time' && Date.parse(record.receivedAt) < since.ms) continue
        if (id !== undefined && excluded.has(id)) continue
        if (record.receiver !== undefined) {
          if (options.repository !== record.receiver.repository)
            throw new InputError(
              'Channel event repository does not match the explicit wait repository',
            )
          if (reconcile === undefined)
            throw new InputError('Channel events require authoritative reconciliation')
          const reconnect =
            record.event === 'receiver' &&
            (record.action === 'connected' || record.action === 'reconnected')
          if (reconnect || matchedMember(record, predicate) !== undefined) reconcilePending = true
          continue
        }
        const member = matchedMember(record, predicate)
        if (member !== undefined)
          return {
            ...record,
            source: 'event',
            ...(predicate.kind === 'any' ? { matched: member.kind } : {}),
          }
      }
      return undefined
    }

    const watcher = watch(dirname(file), (_type, name) => {
      if (name === null || name === basename(file)) check()
    })
    const timer = timeoutMs === undefined ? undefined : setTimeout(expire, timeoutMs)
    /** A local fallback for a lost watch event: it reads only the event file, never GitHub. */
    const fallback = setInterval(check, LOCAL_RECHECK_MS)
    const onAbort = () => settle(() => reject(signal?.reason ?? new Error('aborted')))
    function settle(finish: () => void): void {
      if (finished) return
      finished = true
      watcher.close()
      clearInterval(fallback)
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      finish()
    }
    /** The last read before the wait gives up: the file once more and, if there is one, GitHub. */
    function expire(): void {
      if (finished) return
      expired = true
      reconcilePending = reconcile !== undefined
      check()
    }
    function giveUp(): void {
      settle(() => reject(new WaitTimeout(`No matching event within ${timeoutMs} ms`)))
    }
    function check(): void {
      if (finished) return
      try {
        const hit = drain()
        if (hit !== undefined) settle(() => resolve(hit))
        else if (reconcilePending && gateOpen) runReconcile()
        else if (expired && !reconciling) giveUp()
      } catch (error) {
        settle(() => reject(error))
      }
    }
    watcher.on('error', error => settle(() => reject(error)))
    if (signal?.aborted === true) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })

    function runReconcile(): void {
      if (finished || reconciling || reconcile === undefined) return
      const read = reconcile
      reconciling = true
      void (async () => {
        while (reconcilePending && !finished) {
          reconcilePending = false
          for (const member of predicate.kind === 'any' ? predicate.of : [predicate]) {
            if (finished) return
            const hit = await read(member, reconcileSince, excluded)
            if (hit !== undefined) {
              settle(() =>
                resolve({
                  ...hit,
                  source: 'reconcile',
                  ...(predicate.kind === 'any' ? { matched: member.kind } : {}),
                }),
              )
              return
            }
          }
        }
        if (expired && !finished) giveUp()
      })()
        .catch((error: unknown) => settle(() => reject(error)))
        .finally(() => {
          reconciling = false
          if (reconcilePending && !finished) runReconcile()
        })
    }

    reconcilePending = reconcile !== undefined
    check()
    if (finished) return
    if (!gateOpen) {
      settle(() =>
        reject(new InputError('The --since delivery id is not in the event file. Nothing waited.')),
      )
      return
    }
  })
}
