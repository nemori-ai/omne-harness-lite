import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityRequest,
  FacilityResult,
  OutputChunk,
  ProcessHandle,
  ResidueReport,
  RetainedProcessInformation,
  RetainedProcessRef,
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
  /** True once the retained process's domain was stopped, by closing its scope. */
  stopped(process: RetainedProcessRef): boolean
}>

type RetentionEntry = Readonly<{
  scope: string
  tenant: string
  information: RetainedProcessInformation
}>
type RetentionInternals = Readonly<{
  entries: RetentionEntry[]
  closed: Set<string>
  stopped: Set<string>
  /** Process numbers across the facilities that share the store, so references never collide. */
  processes: { count: number }
}>
const internals = new WeakMap<ScriptedRetentionStore, RetentionInternals>()

export function createScriptedRetentionStore(): ScriptedRetentionStore {
  const state: RetentionInternals = {
    entries: [],
    closed: new Set(),
    stopped: new Set(),
    processes: { count: 0 },
  }
  const store: ScriptedRetentionStore = {
    closeScope(scope) {
      state.closed.add(scope)
      for (const entry of state.entries)
        if (entry.scope === scope) state.stopped.add(refKey(entry.information.process))
    },
    stopped: process => state.stopped.has(refKey(process)),
  }
  internals.set(store, state)
  return store
}
const refKey = (ref: RetainedProcessRef) => `${ref.id}\u0000${ref.generation}`

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
   */
  retention?: Readonly<{
    store: ScriptedRetentionStore
    scope: string
    /** `false`: the acquisition has no retention process ledger view. Default `true`. */
    ledger?: boolean
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
      ? { retention: { list: request => listRetained(state, retention.scope, request) } }
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

async function listRetained<P>(
  state: RetentionInternals,
  scope: string,
  request: FacilityRequest<P>,
): Promise<FacilityResult<readonly RetainedProcessInformation[]>> {
  const tenant = JSON.stringify(request.access.tenant)
  const value = state.entries
    .filter(
      entry =>
        entry.scope === scope &&
        entry.tenant === tenant &&
        !state.stopped.has(refKey(entry.information.process)),
    )
    .map(entry => entry.information)
  return { kind: 'done', requestId: request.requestId, value }
}
