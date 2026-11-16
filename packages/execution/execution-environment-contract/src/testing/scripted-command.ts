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
      output?: readonly Readonly<{ stream: OutputChunk['stream']; data: string | Uint8Array }>[]
      outcome?: CommandOutcome
      runs?: 'exit' | 'untilStop'
      stop?: 'confirmed' | 'unconfirmed'
      leaves?: number | 'unknown'
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

export type ScriptedRetentionStore = Readonly<{
  closeScope(scope: string): void
  stopped(process: RetainedProcessRef): boolean
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
  ended: Set<string>
  stopsIssued: Map<string, number>
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
  retention?: Readonly<{
    store: ScriptedRetentionStore
    scope: string
    ledger?: boolean
    ended?: boolean
    refuse?: readonly ('stop' | 'output')[]
  }>
}>

export type ScriptedCommandFacility<P = unknown> = Readonly<{
  durability: 'none'
  facility: CommandFacility<P>
  calls: readonly StartRequest<P>[]
  stops: readonly StopRecord[]
  close(): void
}>

type StopRecord = Readonly<{
  process: ProcessHandle['process']
  mode: 'graceful' | 'forced'
  answer: 'confirmed' | 'unconfirmed'
}>

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

const modes: readonly unknown[] = ['graceful', 'forced']
const streamNames: readonly string[] = ['stdout', 'stderr', 'terminal']
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isName = (value: unknown) => typeof value === 'string' && value.length > 0
const isRef = (value: unknown) =>
  isRecord(value) && isName(value['id']) && isName(value['generation'])
const isOffset = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
const isFrom = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    Object.entries(value).every(
      ([stream, offset]) => streamNames.includes(stream) && isOffset(offset),
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

function decode(data: Uint8Array): { value: string; replaced: boolean } {
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(data), replaced: false }
  } catch {
    return { value: new TextDecoder().decode(data), replaced: true }
  }
}
