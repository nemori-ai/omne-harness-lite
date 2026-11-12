// Fake ports for session observation: a Session log in memory behind the reader history face, a
// notice hub, a wait that the case drives, and counters for what is still held.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  EntryId,
  HistoryEntry,
  HistoryPage,
  SessionAccess,
  SessionFailure,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'
import {
  DEFAULT_OBSERVATION_REFRESH_POLICY,
  type ObservationDiagnostic,
  type ObservationRefreshPolicy,
  type SessionObservationPorts,
} from '../src/index.ts'

type Outcome<T> = Readonly<{ ok: T }> | Readonly<{ failure: SessionFailure }>

export function json(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 1 << 20,
    maxDepth: 64,
    maxItems: 1 << 16,
    maxMembers: 1 << 10,
    maxStringLength: 1 << 16,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

export const ACCESS = {
  principal: 'person',
  tenant: 'tenant-a',
  session: 'session-1' as SessionId,
} as unknown as SessionAccess<string>

export const started = (run: string) => ({
  kind: 'run.started',
  payload: { run, entry: 'interactive' },
})
export const ended = (run: string) => ({
  kind: 'run.terminal',
  payload: { terminal: { run, outcome: 'completed' } },
})
export const mainCall = (reference: string) => ({
  kind: 'call.bound',
  payload: {
    kind: 'model',
    consumption: 'c',
    registration: {
      kind: 'associated',
      binding: { producer: { kind: 'model', call: reference } },
      purpose: 'main',
    },
    association: null,
  },
})
export const message = (text: string) => ({ kind: 'message.user', payload: { text } })

type Planned = Readonly<{ kind: string; payload: unknown }>
type Call = Readonly<{ face: 'begin' | 'next' | 'since'; input: Readonly<Record<string, unknown>> }>
type Gate = { release: () => void; promise: Promise<void> }

/** A Session log in memory. Pages hold `pageSize` matching entries; `upper` is the newest revision. */
export class FakeLog {
  readonly entries: HistoryEntry[] = []
  readonly calls: Call[] = []
  readonly failures: Partial<Record<Call['face'], SessionFailure[]>> = {}
  pageSize = 2
  gate: Gate | undefined
  readonly #cursors = new Map<
    string,
    Readonly<{ ids: readonly EntryId[]; upper: SessionRevision }>
  >()

  constructor(...planned: Planned[]) {
    this.append(...planned)
  }

  get revision(): SessionRevision {
    return String(this.entries.length) as SessionRevision
  }

  /** One commit: the entries get the next revisions. */
  append(...planned: Planned[]): void {
    for (const { kind, payload } of planned) {
      const n = this.entries.length + 1
      this.entries.push({
        id: `e${String(n)}` as EntryId,
        revision: String(n) as SessionRevision,
        kind,
        schema: {} as never,
        payload: json(payload),
        origin: {} as never,
      })
    }
  }

  /** The next read takes its answer from the log now and hands it over when the case releases it. */
  hold(): Gate {
    let release = (): void => undefined
    const promise = new Promise<void>(resolve => {
      release = resolve
    })
    this.gate = { release, promise }
    return this.gate
  }

  reads(face?: Call['face']): number {
    return this.calls.filter(call => face === undefined || call.face === face).length
  }

  history(): SessionObservationPorts<string>['history'] {
    return {
      begin: input =>
        this.#read('begin', input, () => {
          const ids = this.#matching(input.kinds).reverse()
          return this.#page(ids, this.revision)
        }),
      since: input =>
        this.#read('since', input, () => {
          const all = this.entries.map(entry => entry.id)
          const at = all.indexOf(input.after)
          if (at < 0)
            return {
              failure: { kind: 'invalid', field: 'from', reason: 'not an entry of this session' },
            }
          const ids = this.#matching(input.kinds).filter(id => all.indexOf(id) > at)
          return this.#page(ids, this.revision)
        }),
      next: input =>
        this.#read('next', input, () => {
          const state = this.#cursors.get(input.cursor)
          if (state === undefined)
            return { failure: { kind: 'invalid', field: 'cursor', reason: 'expired' } }
          return this.#page(state.ids, state.upper)
        }),
    }
  }

  async #read(
    face: Call['face'],
    input: Readonly<Record<string, unknown>>,
    answer: () => Outcome<HistoryPage>,
  ): Promise<Outcome<HistoryPage>> {
    this.calls.push({ face, input })
    const failure = this.failures[face]?.shift()
    const read = failure === undefined ? answer() : { failure }
    const gate = this.gate
    if (gate !== undefined) {
      this.gate = undefined
      await gate.promise
    }
    return read
  }

  #matching(kinds: unknown): EntryId[] {
    const wanted = new Set(kinds as readonly string[])
    return this.entries.filter(entry => wanted.has(entry.kind)).map(entry => entry.id)
  }

  #page(ids: readonly EntryId[], upper: SessionRevision): Outcome<HistoryPage> {
    const here = ids.slice(0, this.pageSize)
    const rest = ids.slice(this.pageSize)
    let next: string | null = null
    if (rest.length > 0) {
      next = `cursor-${String(this.#cursors.size)}`
      this.#cursors.set(next, { ids: rest, upper })
    }
    return {
      ok: {
        source: 'fake',
        interpreter: {} as never,
        upper,
        entries: here.map(id => this.entries.find(entry => entry.id === id) as HistoryEntry),
        scannedThrough: '',
        next,
        exhausted: next === null,
        annotations: [],
      },
    }
  }
}

/** Waits that the case ends one by one. */
export class FakeClock {
  readonly waits: number[] = []
  #pending: { resolve: (value: 'elapsed' | 'cancelled') => void; signal: AbortSignal }[] = []

  wait = (milliseconds: number, signal: AbortSignal): Promise<'elapsed' | 'cancelled'> => {
    this.waits.push(milliseconds)
    return new Promise(resolve => {
      if (signal.aborted) return resolve('cancelled')
      const held = { resolve, signal }
      this.#pending.push(held)
      signal.addEventListener('abort', () => {
        this.#pending = this.#pending.filter(other => other !== held)
        resolve('cancelled')
      })
    })
  }

  get pending(): number {
    return this.#pending.length
  }

  /** The oldest pending wait runs out. */
  elapse(): void {
    const held = this.#pending.shift()
    if (held === undefined) throw new Error('no pending wait')
    held.resolve('elapsed')
  }
}

export class FakeNotices {
  readonly #listeners = new Set<(kinds: readonly string[]) => void>()
  subscriptions = 0

  port: SessionObservationPorts<string>['notices'] = (_target, onCommit) => {
    this.subscriptions += 1
    this.#listeners.add(onCommit)
    return () => {
      this.#listeners.delete(onCommit)
    }
  }

  get active(): number {
    return this.#listeners.size
  }

  commit(...kinds: string[]): void {
    for (const listener of this.#listeners) listener(kinds)
  }
}

type ModelAnswer =
  | Readonly<{
      ok: Readonly<{
        state: Readonly<{ phase: string }>
        current: Readonly<{ ref: string }> | null
      }>
    }>
  | Readonly<{ failure: Readonly<{ kind: string; reason?: string }> }>
  | 'hang'

/** One subscription the fake Model handed out: the case pushes frames and ends it. */
export class FakeStream {
  readonly ref: string
  readonly signal: AbortSignal
  readonly #queue: unknown[] = []
  #wake: (() => void) | undefined
  #done = false

  constructor(ref: string, signal: AbortSignal) {
    this.ref = ref
    this.signal = signal
    signal.addEventListener('abort', () => this.#poke())
  }

  push(...frames: unknown[]): void {
    this.#queue.push(...frames)
    this.#poke()
  }

  /** The iterator returns without an `ended` frame. */
  stop(): void {
    this.#done = true
    this.#poke()
  }

  #poke(): void {
    const wake = this.#wake
    this.#wake = undefined
    wake?.()
  }

  async *frames(): AsyncGenerator<never> {
    for (;;) {
      if (this.signal.aborted) return
      const frame = this.#queue.shift()
      if (frame !== undefined) {
        yield frame as never
        continue
      }
      if (this.#done) return
      await new Promise<void>(resolve => {
        this.#wake = resolve
      })
    }
  }
}

/** The public Model stream: `current` answers per reference, `observe` hands out FakeStreams. */
export class FakeModel {
  readonly answers = new Map<string, ModelAnswer[]>()
  readonly asked: string[] = []
  readonly streams: FakeStream[] = []
  fallback: ModelAnswer = { ok: { state: { phase: 'accepted' }, current: null } }

  answer(reference: string, ...answers: ModelAnswer[]): void {
    this.answers.set(reference, [...(this.answers.get(reference) ?? []), ...answers])
  }

  /** The newest subscription to `ref`. */
  stream(ref: string): FakeStream {
    const found = this.streams.filter(stream => stream.ref === ref).at(-1)
    if (found === undefined) throw new Error(`no subscription to ${ref}`)
    return found
  }

  get open(): number {
    return this.streams.filter(stream => !stream.signal.aborted).length
  }

  ports(): Pick<SessionObservationPorts<string>, 'streams' | 'observer'> {
    return {
      streams: {
        current: input => {
          const reference = String(input.reference)
          this.asked.push(reference)
          const answer = this.answers.get(reference)?.shift() ?? this.fallback
          if (answer === 'hang') return new Promise(() => undefined)
          return Promise.resolve(answer as never)
        },
      },
      observer: {
        observe: input => {
          const stream = new FakeStream(String(input.ref), input.signal)
          this.streams.push(stream)
          return stream.frames()
        },
      },
    }
  }
}

const cursor = (n: number) => String(n)

/** A Model snapshot value of `phase` at output cursor `n`. */
export function snapshot(ref: string, n: number, phase = 'running') {
  return {
    kind: 'snapshot',
    cursor: `c${String(n)}`,
    value: {
      ref,
      dispatch: 'mdisp_a',
      value: {
        call: 'mcall_a',
        cursor: cursor(n),
        blocks: [],
        state: { phase, revision: cursor(n) },
      },
    },
  }
}

/** A Model delta value from cursor `n - 1` to `n`, now in `phase`. */
export function delta(ref: string, n: number, phase = 'running') {
  return {
    kind: 'delta',
    from: `c${String(n - 1)}`,
    cursor: `c${String(n)}`,
    value: {
      ref,
      dispatch: 'mdisp_a',
      from: { outputCursor: cursor(n - 1), revision: cursor(n - 1) },
      outputCursor: cursor(n),
      state: { phase, revision: cursor(n) },
      blocks: [],
    },
  }
}

export const stream = (ref: string, phase = 'running') => ({
  ok: { state: { phase }, current: { ref } },
})

export type World = Readonly<{
  log: FakeLog
  clock: FakeClock
  notices: FakeNotices
  model: FakeModel
  diagnostics: ObservationDiagnostic[]
  ports: SessionObservationPorts<string>
}>

export function world(
  log: FakeLog,
  policy: Partial<ObservationRefreshPolicy> = {},
  locatePages = 4,
): World {
  const clock = new FakeClock()
  const notices = new FakeNotices()
  const model = new FakeModel()
  const diagnostics: ObservationDiagnostic[] = []
  const ports: SessionObservationPorts<string> = {
    history: log.history(),
    ...model.ports(),
    notices: notices.port,
    wait: clock.wait,
    policy: { ...DEFAULT_OBSERVATION_REFRESH_POLICY, ...policy },
    locatePages,
    historyKinds: ['message.user', 'message.assistant', 'run.started', 'run.terminal'],
    diagnose: diagnostic => {
      diagnostics.push(diagnostic)
    },
  }
  return { log, clock, notices, model, diagnostics, ports }
}

/** Lets every queued promise job run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve))
}
