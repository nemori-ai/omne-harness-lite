import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityRequest,
  OutputChunk,
  ProcessHandle,
  ResidueReport,
  RetainedOutput,
  RetainedProcessInformation,
  RetainedProcessRef,
  RetainedStreamTail,
} from '../index.ts'
import { createScriptedProcess } from './scripted-process.ts'

export type ScriptedCommandAnswer =
  | Readonly<{
      kind: 'started'
      /** Chunks in order. `observedOffset` is counted per stream. Strings are UTF-8 encoded. */
      output?: readonly Readonly<{ stream: OutputChunk['stream']; data: string | Uint8Array }>[]
      /** Default: completed, exit code 0, `durationMs` 0, counts from `output`. */
      outcome?: CommandOutcome
      /** `untilStop`: output stays open and `result` waits until a confirmed stop. Default `exit`. */
      runs?: 'exit' | 'untilStop'
      /** What `stop` answers. Default `confirmed`. */
      stop?: 'confirmed' | 'unconfirmed'
      /**
       * Processes the main process leaves behind when it exits (a count, or `'unknown'`). Only with
       * `runs: 'exit'`. The facility then disposes like a retaining provider: see
       * `ScriptedCommandOptions.retention`. A script that gives no `leaves` leaves nothing. An
       * explicit `outcome` that carries its own `residue` keeps it.
       */
      leaves?: number | 'unknown'
      /**
       * Chunks the retained process writes once the domain was handed over. Only with `leaves`;
       * `retention.output` gives them as the tail, after the bytes `output` already counted.
       */
      afterHandover?: readonly Readonly<{
        stream: OutputChunk['stream']
        data: string | Uint8Array
      }>[]
    }>
  | Readonly<{ kind: 'rejected'; reason: FacilityReason }>
  | Readonly<{ kind: 'unknown' }>

type StartRequest<P> = Parameters<CommandFacility<P>['start']>[0]

export type CommandScript<P = unknown> = (
  request: StartRequest<P>,
) => ScriptedCommandAnswer | Promise<ScriptedCommandAnswer>

/**
 * The retention scopes of scripted facilities. Facilities that share one store and name the same
 * scope share one retention scope; a store of its own is a scope of its own. Not durable.
 */
export type ScriptedRetentionStore = Readonly<{
  /** Closes the scope: its retained processes stop, and a later leftover there is stopped for `closed`. */
  closeScope(scope: string): void
  /** True once the retained process's domain was stopped, by closing its scope or by `retention.stop`. */
  stopped(process: RetainedProcessRef): boolean
  /** How many domain stops `retention.stop` issued for the retained process. */
  stopsIssued(process: RetainedProcessRef): number
}>

type RetainedStream = { readonly savedFrom: number; data: Uint8Array }
type RetentionEntry = Readonly<{
  scope: string
  tenant: string
  information: RetainedProcessInformation
  streams: ReadonlyMap<OutputChunk['stream'], RetainedStream>
}>
type RetentionInternals = Readonly<{
  entries: RetentionEntry[]
  closed: Set<string>
  stopped: Set<string>
  /** End facts: scope, tenant and reference of every retained process whose stop was confirmed. */
  ended: Set<string>
  stopsIssued: Map<string, number>
  /** Process numbers across the facilities that share the store, so references never collide. */
  processes: { count: number }
}>
const internals = new WeakMap<ScriptedRetentionStore, RetentionInternals>()

export function createScriptedRetentionStore(): ScriptedRetentionStore {
  const state: RetentionInternals = {
    entries: [],
    closed: new Set(),
    stopped: new Set(),
    ended: new Set(),
    stopsIssued: new Map(),
    processes: { count: 0 },
  }
  const store: ScriptedRetentionStore = {
    closeScope(scope) {
      state.closed.add(scope)
      for (const entry of state.entries) if (entry.scope === scope) end(state, entry)
    },
    stopped: process => state.stopped.has(refKey(process)),
    stopsIssued: process => state.stopsIssued.get(refKey(process)) ?? 0,
  }
  internals.set(store, state)
  return store
}
const refKey = (ref: RetainedProcessRef) => `${ref.id}\u0000${ref.generation}`
const endKey = (scope: string, tenant: string, ref: RetainedProcessRef) =>
  JSON.stringify([scope, tenant, ref.id, ref.generation])
function end(state: RetentionInternals, entry: RetentionEntry): void {
  state.stopped.add(refKey(entry.information.process))
  state.ended.add(endKey(entry.scope, entry.tenant, entry.information.process))
}

export type ScriptedCommandOptions = Readonly<{
  /**
   * Makes the facility dispose like a provider that retains. Without it nothing changes: no
   * `retention` extension, no `residue` unless the script's own `outcome` has one.
   *
   * With it, a `started` answer with `leaves` ends `completed` with `residue`: `retained` when the
   * scope is open, with the process identity as the reference; `stopping/closed` when the scope is
   * closed; `stopping/unbound` when `ledger` is `false`. An answer without `leaves` gets `none`.
   * A retained domain is handed over: the handle's `stop` answers `unconfirmed` in both modes and
   * changes nothing. `retention.list` lists the scope's processes for the request's tenant.
   * `retention.stop` stops one at once and confirms; a stopped one answers `confirmed` from its
   * end fact. `retention.output` gives the chunks of the script's `afterHandover` as the tail.
   */
  retention?: Readonly<{
    store: ScriptedRetentionStore
    scope: string
    /** `false`: the acquisition has no retention process ledger view. Default `true`. */
    ledger?: boolean
    /** `false`: the ledger view has no `ended`, so a stopped process's end fact is unreadable. */
    ended?: boolean
    /** Operations of the extension the facility guard refuses, answered `notAuthorized`. */
    refuse?: readonly ('stop' | 'output')[]
  }>
}>

export type ScriptedCommandFacility<P = unknown> = Readonly<{
  durability: 'none'
  /** The facility to put in a scripted lease: `lease: { command: cmd.facility }`. */
  facility: CommandFacility<P>
  calls: readonly StartRequest<P>[]
  stops: readonly StopRecord[]
  /** After `close`, `start` answers `rejected/closed` without calling the script. Running processes go on. */
  close(): void
}>

type StopRecord = Readonly<{
  process: ProcessHandle['process']
  mode: 'graceful' | 'forced'
  answer: 'confirmed' | 'unconfirmed'
}>

/**
 * A scripted command facility for tests. The script answers each accepted `start`. It starts no real
 * process and reads nothing from the host. Not durable; never assemble in production.
 *
 * To put it in a lease, give the scripted provider `facilities` that include `'command'` and
 * `lease: { command: cmd.facility }`. A given `lease` replaces the whole default facility table, so
 * the lease has no default `command` and no `terminal`. The caller writes the provider's `retire`
 * script and calls `cmd.close()` in it.
 */
export function createScriptedCommandFacility<P = unknown>(
  script: CommandScript<P>,
  options: ScriptedCommandOptions = {},
): ScriptedCommandFacility<P> {
  const retention = options.retention
  const retaining = retention !== undefined && retention.ledger !== false
  const state = retention === undefined ? undefined : internals.get(retention.store)
  if (retention !== undefined && state === undefined)
    throw new TypeError(
      'scripted command: the retention store is not from createScriptedRetentionStore',
    )
  let processes = 0
  let closed = false
  const calls: StartRequest<P>[] = []
  const stops: StopRecord[] = []

  const facility: CommandFacility<P> = {
    ...(retaining && state !== undefined && retention !== undefined
      ? { retention: retentionExtension<P>(state, retention) }
      : {}),
    async start(request) {
      if (closed) return { kind: 'rejected', requestId: request.requestId, reason: 'closed' }
      calls.push(request)
      const answer = await script(request)
      switch (answer.kind) {
        case 'started': {
          if (answer.leaves !== undefined && answer.runs === 'untilStop')
            throw new TypeError('scripted command: `leaves` needs `runs: exit`')
          const identity = {
            id: `scripted-${state === undefined ? ++processes : ++state.processes.count}`,
            generation: '1',
          }
          const residue =
            state === undefined || retention === undefined
              ? undefined
              : dispose({ state, retention, retaining, identity, request, answer })
          const { handle } = createScriptedProcess({
            mode: request.outputMode,
            answer: residue?.kind === 'retained' ? { ...answer, stop: 'unconfirmed' } : answer,
            identity,
            onStop: record => stops.push(record),
          })
          return {
            kind: 'done',
            requestId: request.requestId,
            value: residue === undefined ? handle : withResidue(handle, residue),
          }
        }
        case 'rejected':
          return { kind: 'rejected', requestId: request.requestId, reason: answer.reason }
        case 'unknown':
          return { kind: 'unknown', requestId: request.requestId }
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    },
  }

  return {
    durability: 'none',
    facility,
    calls,
    stops,
    close() {
      closed = true
    },
  }
}

type Started = Extract<ScriptedCommandAnswer, { kind: 'started' }>

/** The disposition a retaining provider reports; the handover is recorded in the store. */
function dispose<P>(input: {
  state: RetentionInternals
  retention: NonNullable<ScriptedCommandOptions['retention']>
  retaining: boolean
  identity: ProcessHandle['process']
  request: StartRequest<P>
  answer: Started
}): ResidueReport {
  const { state, retention, identity, request, answer } = input
  if (answer.leaves === undefined) return { kind: 'none' }
  if (!input.retaining) return { kind: 'stopping', reason: 'unbound' }
  if (state.closed.has(retention.scope)) return { kind: 'stopping', reason: 'closed' }
  state.entries.push({
    scope: retention.scope,
    tenant: JSON.stringify(request.access.tenant),
    streams: retainedStreams(answer),
    information: {
      process: identity,
      origin: request.origin,
      handedOverAtMs:
        /* wall-clock: operation-timing -- a scripted handover time for a test double */ Date.now(),
      state: 'running',
      processes: answer.leaves,
    },
  })
  return { kind: 'retained', process: identity, processes: answer.leaves }
}

/** The same handle whose completed outcome reports the disposition, unless the script gave one. */
function withResidue(handle: ProcessHandle, residue: ResidueReport): ProcessHandle {
  const result = handle.result.then(outcome =>
    outcome.kind === 'completed' && outcome.residue === undefined
      ? { ...outcome, residue }
      : outcome,
  )
  return { ...handle, result }
}

const bytes = (data: string | Uint8Array) =>
  typeof data === 'string' ? new TextEncoder().encode(data) : data

/** Per stream: the bytes `output` counted before the handover, and the bytes written after it. */
function retainedStreams(answer: Started): ReadonlyMap<OutputChunk['stream'], RetainedStream> {
  const counted = new Map<OutputChunk['stream'], number>()
  for (const chunk of answer.output ?? [])
    counted.set(chunk.stream, (counted.get(chunk.stream) ?? 0) + bytes(chunk.data).length)
  const streams = new Map<OutputChunk['stream'], RetainedStream>()
  for (const chunk of answer.afterHandover ?? []) {
    const stream = streams.get(chunk.stream) ?? {
      savedFrom: counted.get(chunk.stream) ?? 0,
      data: new Uint8Array(),
    }
    stream.data = new Uint8Array([...stream.data, ...bytes(chunk.data)])
    streams.set(chunk.stream, stream)
  }
  return streams
}

type Retention = NonNullable<ScriptedCommandOptions['retention']>

/*
 * The payload shapes of `stop` and `output`. They are checked before the guard and the index, so a
 * malformed request is `invalidInput` whatever the reference names.
 */
const modes: readonly unknown[] = ['graceful', 'forced']
const streamNames: readonly string[] = ['stdout', 'stderr', 'terminal']
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isName = (value: unknown) => typeof value === 'string' && value.length > 0
const isRef = (value: unknown) =>
  isRecord(value) && isName(value['id']) && isName(value['generation'])
const isOffset = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
/** An absent offset is no offset, as for an optional field: `{ stdout: undefined }` reads from the first saved byte. */
const isFrom = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    Object.entries(value).every(
      ([stream, offset]) =>
        streamNames.includes(stream) && (offset === undefined || isOffset(offset)),
    ))

function retentionExtension<P>(
  state: RetentionInternals,
  retention: Retention,
): NonNullable<CommandFacility<P>['retention']> {
  const own = (request: FacilityRequest<P>, ref?: RetainedProcessRef) => {
    const tenant = JSON.stringify(request.access.tenant)
    return state.entries.filter(
      entry =>
        entry.scope === retention.scope &&
        entry.tenant === tenant &&
        !state.stopped.has(refKey(entry.information.process)) &&
        (ref === undefined || refKey(entry.information.process) === refKey(ref)),
    )
  }
  const refuse = (requestId: string, reason: FacilityReason) =>
    ({ kind: 'rejected', requestId, reason }) as const
  return {
    async list(request) {
      const value = own(request).map(entry => entry.information)
      return { kind: 'done', requestId: request.requestId, value }
    },
    async stop(request) {
      if (!isRef(request.process) || !modes.includes(request.mode))
        return refuse(request.requestId, 'invalidInput')
      if (retention.refuse?.includes('stop')) return refuse(request.requestId, 'notAuthorized')
      const [entry] = own(request, request.process)
      if (entry !== undefined) {
        end(state, entry)
        const key = refKey(entry.information.process)
        state.stopsIssued.set(key, (state.stopsIssued.get(key) ?? 0) + 1)
        return { kind: 'done', requestId: request.requestId, value: { status: 'confirmed' } }
      }
      if (retention.ended === false) return refuse(request.requestId, 'unavailable')
      const tenant = JSON.stringify(request.access.tenant)
      return state.ended.has(endKey(retention.scope, tenant, request.process))
        ? { kind: 'done', requestId: request.requestId, value: { status: 'confirmed' } }
        : refuse(request.requestId, 'notFound')
    },
    async output(request) {
      if (!isRef(request.process) || !isFrom(request.from))
        return refuse(request.requestId, 'invalidInput')
      if (retention.refuse?.includes('output')) return refuse(request.requestId, 'notAuthorized')
      const [entry] = own(request, request.process)
      if (entry === undefined) return refuse(request.requestId, 'notFound')
      const value: RetainedOutput =
        entry.streams.size === 0
          ? { kind: 'none' }
          : {
              kind: 'tail',
              version: 1,
              streams: [...entry.streams].map(([stream, kept]) =>
                streamTail(stream, kept, request.from?.[stream]),
              ),
            }
      return { kind: 'done', requestId: request.requestId, value }
    },
  }
}

/** The tail of one stream from `from` on. Nothing is discarded: the double keeps every byte. */
function streamTail(
  stream: OutputChunk['stream'],
  kept: RetainedStream,
  from: number | undefined,
): RetainedStreamTail {
  const end = kept.savedFrom + kept.data.length
  const start = Math.min(Math.max(from ?? kept.savedFrom, kept.savedFrom), end)
  const data = kept.data.slice(start - kept.savedFrom)
  let skipped = 0
  while (skipped < 3 && skipped < data.length && (data[skipped] ?? 0) >> 6 === 0b10) skipped++
  return {
    stream,
    savedFrom: kept.savedFrom,
    start,
    end,
    discardedBytes: 0,
    data,
    text: { encoding: 'utf-8', start: start + skipped, ...decode(data.subarray(skipped)) },
  }
}

/** Strict decoding decides `replaced`, as the host does: a U+FFFD the source wrote is not a replacement. */
function decode(data: Uint8Array): { value: string; replaced: boolean } {
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(data), replaced: false }
  } catch {
    return { value: new TextDecoder().decode(data), replaced: true }
  }
}
