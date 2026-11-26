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

const RUN_KINDS = ['run.started', 'run.terminal'] as const

export const LOCATE_KINDS = ['call.bound', ...RUN_KINDS] as const

const PAGE_BYTES = 65_536

export type Located = Readonly<{
  revision: SessionRevision
  run: RunId | null
  mainCall: ModelInvocationRef | null
}>

export type LocateResult =
  | Readonly<{ kind: 'located'; view: Located; transient?: true }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

type Read = Awaited<ReturnType<SessionObservationPorts<unknown>['history']['begin']>>

type Failed = Readonly<{ failure: SessionFailure; face: 'begin' | 'since' | 'next' }>
type Scanned = Readonly<{ ok: Located }> | Failed
type Swept =
  | Readonly<{ ok: Readonly<{ scan: BackwardScan; revision: SessionRevision; whole: boolean }> }>
  | Failed

function mainCallOf(entry: HistoryEntry): ModelInvocationRef | undefined {
  const found = readCallRegistration(entry.payload)
  if (found?.purpose !== 'main') return undefined
  const decoded = decodeModelInvocationRef(found.reference)
  return 'ok' in decoded ? decoded.ok : undefined
}

class BackwardScan {
  newest: EntryId | null = null
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
}

const hasRun = (scan: BackwardScan): boolean => scan.run !== undefined
const hasRunAndCall = (scan: BackwardScan): boolean => hasRun(scan) && scan.mainCall !== undefined

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

  note(): void {
    this.#pending = true
  }

  take(): boolean {
    const pending = this.#pending
    this.#pending = false
    return pending
  }

  async open(): Promise<LocateResult> {
    const read = await this.#backward()
    if ('failure' in read)
      return { kind: read.failure.kind === 'unavailable' ? 'unavailable' : 'denied' }
    return { kind: 'located', view: read.ok }
  }

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
    const calls = await this.#sweep(LOCATE_KINDS, hasRunAndCall, this.#ports.locatePages)
    if ('failure' in calls) return calls
    const runs =
      hasRun(calls.ok.scan) || calls.ok.whole
        ? calls
        : await this.#sweep(RUN_KINDS, hasRun, Number.POSITIVE_INFINITY)
    if ('failure' in runs) return runs
    this.#after = calls.ok.scan.newest
    this.#run = runs.ok.scan.run ?? null
    this.#open = runs.ok.scan.open
    return { ok: this.#settle(runs.ok.revision, calls.ok.scan.mainCall ?? null) }
  }

  async #sweep(
    kinds: readonly string[],
    enough: (scan: BackwardScan) => boolean,
    pages: number,
  ): Promise<Swept> {
    const at = this.#access
    let read: Read = await this.#ports.history.begin({
      ...at,
      kinds,
      from: null,
      direction: 'backward',
      pageBytes: PAGE_BYTES,
    })
    if ('failure' in read) return { failure: read.failure, face: 'begin' }
    const revision = read.ok.upper
    const scan = new BackwardScan()
    for (let page = 1; ; page++) {
      for (const entry of read.ok.entries) scan.add(entry)
      const whole = this.#done(read.ok)
      if (whole || enough(scan) || page >= pages) return { ok: { scan, revision, whole } }
      read = await this.#ports.history.next({ ...at, cursor: read.ok.next as string })
      if ('failure' in read) return { failure: read.failure, face: 'next' }
    }
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
