// 定位 (RFC-0015 §8, §13): reads the Session log as the observer and keeps where it read up to, the
// run in progress, the newest main Model call and the log revision. Pure reading; it owns the flag
// 「有新提交待看」 so that a notice during a locate is not lost.
import { decodeModelInvocationRef, type ModelInvocationRef } from '@omne-harness/model-contract'
import {
  readCallRegistration,
  readRunBoundary,
  type EntryId,
  type HistoryEntry,
  type HistoryPage,
  type RunId,
  type SessionAccess,
  type SessionFailure,
  type SessionRevision,
} from '@omne-harness/session-contract'
import type { SessionObservationPorts } from './ports.ts'

/** The kinds a locate reads. */
export const LOCATE_KINDS = ['call.bound', 'run.started', 'run.terminal'] as const

const PAGE_BYTES = 65_536

export type Located = Readonly<{
  revision: SessionRevision
  /** The run in progress: the newest run.started with no run.terminal of the same run after it. */
  run: RunId | null
  /** The reference of the newest main Model call. */
  mainCall: ModelInvocationRef | null
}>

export type LocateResult =
  /** `transient`: the log could not be read this time; the view is the one before. */
  | Readonly<{ kind: 'located'; view: Located; transient?: true }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

type Read = Awaited<ReturnType<SessionObservationPorts<unknown>['history']['begin']>>

/** A read that failed, and the face that answered: `since` and `next` carry a cursor of this observation, `begin` carries none. */
type Failed = Readonly<{ failure: SessionFailure; face: 'begin' | 'since' | 'next' }>
type Scanned = Readonly<{ ok: Located }> | Failed

/**
 * The reference of a main Model call registration. The session contract keeps a
 * `ModelInvocationRef` text there; a text that does not decode is no main call.
 */
function mainCallOf(entry: HistoryEntry): ModelInvocationRef | undefined {
  if (entry.kind !== 'call.bound') return undefined
  const found = readCallRegistration(entry.payload)
  if (found?.kind !== 'model' || found.purpose !== 'main' || found.reference === null)
    return undefined
  const decoded = decodeModelInvocationRef(found.reference)
  return 'ok' in decoded ? decoded.ok : undefined
}

/** What a backward read found so far, newest entry first. */
class BackwardScan {
  newest: EntryId | null = null
  /** The newest run.started; undefined until one is seen. */
  run: RunId | undefined
  open = false
  mainCall: ModelInvocationRef | undefined
  readonly #ended = new Set<RunId>()

  add(entry: HistoryEntry): void {
    this.newest ??= entry.id
    this.mainCall ??= mainCallOf(entry)
    if (this.run !== undefined) return
    const boundary = readRunBoundary(entry)
    if (boundary === null) return
    if (boundary.kind === 'terminal') {
      this.#ended.add(boundary.run)
      return
    }
    this.run = boundary.run
    this.open = !this.#ended.has(boundary.run)
  }

  complete(): boolean {
    return this.run !== undefined && this.mainCall !== undefined
  }
}

export class Locator<P> {
  readonly #access: SessionAccess<P>
  readonly #ports: SessionObservationPorts<P>
  #after: EntryId | null = null
  #run: RunId | null = null
  #open = false
  #view: Located | undefined
  #pending = false

  constructor(access: SessionAccess<P>, ports: SessionObservationPorts<P>) {
    this.#access = access
    this.#ports = ports
  }

  /** A notice with a matching kind came. */
  note(): void {
    this.#pending = true
  }

  /** Takes the flag down; true when a notice came since the last take. */
  take(): boolean {
    const pending = this.#pending
    this.#pending = false
    return pending
  }

  /**
   * The first locate: a backward read. Every failure ends the observation before it opens; an
   * invalid answer is the session or tenant identity, so it reads as denied.
   */
  async open(): Promise<LocateResult> {
    const read = await this.#backward()
    if ('failure' in read)
      return { kind: read.failure.kind === 'unavailable' ? 'unavailable' : 'denied' }
    return { kind: 'located', view: read.ok }
  }

  /**
   * A later locate: only the entries after the last one read. Session `unavailable` and an invalid
   * cursor of its own count as nothing new (the cursor is dropped, so the next locate reads
   * backward again); `denied` ends. An `invalid` of `since` or `next` is the cursor of this
   * observation; an `invalid` of `begin`, which carries no cursor, is another reason and ends.
   */
  async locate(): Promise<LocateResult> {
    const view = this.#view
    if (view === undefined) throw new Error('locate before open')
    const read = this.#after === null ? await this.#backward() : await this.#forward(this.#after)
    if ('ok' in read) return { kind: 'located', view: read.ok }
    switch (read.failure.kind) {
      case 'denied':
        return { kind: 'denied' }
      case 'invalid':
        if (read.face === 'begin') return { kind: 'unavailable' }
        this.#after = null
        return { kind: 'located', view, transient: true }
      case 'unavailable':
        return { kind: 'located', view, transient: true }
      default:
        return { kind: 'unavailable' }
    }
  }

  async #backward(): Promise<Scanned> {
    const at = this.#access
    let read: Read = await this.#ports.history.begin({
      ...at,
      kinds: LOCATE_KINDS,
      from: null,
      direction: 'backward',
      pageBytes: PAGE_BYTES,
    })
    if ('failure' in read) return { failure: read.failure, face: 'begin' }
    const revision = read.ok.upper
    const scan = new BackwardScan()
    for (let pages = 1; ; pages++) {
      for (const entry of read.ok.entries) scan.add(entry)
      if (scan.complete() || this.#done(read.ok) || pages >= this.#ports.locatePages) break
      read = await this.#ports.history.next({ ...at, cursor: read.ok.next as string })
      if ('failure' in read) return { failure: read.failure, face: 'next' }
    }
    this.#after = scan.newest
    this.#run = scan.run ?? null
    this.#open = scan.open
    return { ok: this.#settle(revision, scan.mainCall ?? null) }
  }

  async #forward(after: EntryId): Promise<Scanned> {
    const at = this.#access
    let read: Read = await this.#ports.history.since({
      ...at,
      after,
      kinds: LOCATE_KINDS,
      pageBytes: PAGE_BYTES,
    })
    let face: Failed['face'] = 'since'
    let last = after
    let run = this.#run
    let open = this.#open
    let mainCall = this.#view?.mainCall ?? null
    for (;;) {
      if ('failure' in read) return { failure: read.failure, face }
      for (const entry of read.ok.entries) {
        last = entry.id
        mainCall = mainCallOf(entry) ?? mainCall
        const boundary = readRunBoundary(entry)
        if (boundary?.kind === 'started') {
          run = boundary.run
          open = true
        }
        if (boundary?.kind === 'terminal' && boundary.run === run) open = false
      }
      if (this.#done(read.ok)) break
      read = await this.#ports.history.next({ ...at, cursor: read.ok.next as string })
      face = 'next'
    }
    this.#after = last
    this.#run = run
    this.#open = open
    return { ok: this.#settle(read.ok.upper, mainCall) }
  }

  #done(page: HistoryPage): boolean {
    return page.exhausted || page.next === null
  }

  #settle(revision: SessionRevision, mainCall: ModelInvocationRef | null): Located {
    this.#view = { revision, run: this.#open ? this.#run : null, mainCall }
    return this.#view
  }
}
