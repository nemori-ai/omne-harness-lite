import type { EventsConfig, EventType, McpClock } from '@omne-harness/mcp-contract'
import { eventParamHeadersOf, readOccurrence } from '@omne-harness/mcp-contract'
import type {
  EventRecords,
  EventRequest,
  EventStreamMessage,
  GapReason,
  McpTransport,
  Occurrence,
  SubscriptionKey,
  SubscriptionRow,
  SubscriptionState,
  TerminationReason,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { fail } from '@omne-harness/operation-result'
import type { TaskTimer } from '../watch.ts'
import type { Pause } from './follow.ts'
import { ask } from './port.ts'

export type Ready =
  | Readonly<{ kind: 'ready'; transport: McpTransport; type: EventType; refetch(): Promise<void> }>
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'ended'; reason: TerminationReason }>

export type ReceiverContext = Readonly<{
  key: SubscriptionKey
  records: EventRecords
  bounds: EventsConfig
  clock: McpClock
  pause: Pause
  timer: TaskTimer
  signal: AbortSignal
  /** A subscription made by this receiver's subscribe starts where the peer is; any other one with no position may have missed some. */
  fresh: boolean
  ready(): Promise<Ready>
  changed(): void
}>

type Gap = Extract<GapReason, 'peer-truncated' | 'possibly-missed'> | null

type RunEnd =
  | Readonly<{ kind: 'stopped' }>
  | Readonly<{ kind: 'terminated'; reason: TerminationReason }>
  | Readonly<{ kind: 'header-mismatch' }>
  | Readonly<{ kind: 'broken'; progressed: boolean }>

const FORBIDDEN = -32024
const NOT_FOUND = -32023
const HEADER_MISMATCH = -32020
const UNSUPPORTED = -32026
const STOPPED: RunEnd = { kind: 'stopped' }
const ABANDONED: TransportFailure = { kind: 'no-answer', cause: 'abandoned' }

const terminationOf = (code: number | null): TerminationReason =>
  code === NOT_FOUND ? 'type-gone' : code === UNSUPPORTED ? 'schema-changed' : 'refused'

function refusedEnd(failure: TransportFailure, progressed: boolean): RunEnd {
  if (failure.kind !== 'error-answer') return { kind: 'broken', progressed }
  if (failure.code === HEADER_MISMATCH) return { kind: 'header-mismatch' }
  if ([FORBIDDEN, NOT_FOUND, UNSUPPORTED].includes(failure.code))
    return { kind: 'terminated', reason: terminationOf(failure.code) }
  return { kind: 'broken', progressed }
}

/** Takes in what one open request brings: each batch is stored, with the position after it, before anyone hears of it. */
class Intake {
  progressed = false
  private last: string | null
  private readonly context: ReceiverContext

  constructor(context: ReceiverContext, row: SubscriptionRow) {
    this.context = context
    this.last = row.cursor
  }

  async store(
    events: readonly Occurrence[],
    cursor: string | null,
    gap: Gap,
  ): Promise<'ok' | 'absent' | 'failed'> {
    const { context } = this
    if (events.length === 0 && gap === null && (cursor === null || cursor === this.last))
      return 'ok'
    const at = context.clock.now().toISOString()
    const batch = { events, cursor, gap, at }
    const bounds = { maxEvents: context.bounds.maxEvents, maxAgeMs: context.bounds.maxAgeMs }
    const got = await ask(
      () => context.records.receive(context.key, batch, bounds),
      fail('unavailable' as const),
    )
    if ('failure' in got) return 'failed'
    if (got.ok === 'absent') return 'absent'
    if (cursor !== null) this.last = cursor
    this.progressed = true
    if (got.ok.stored > 0 || gap !== null) context.changed()
    return 'ok'
  }
}

function requestOf(type: EventType, row: SubscriptionRow): EventRequest {
  return {
    name: type.name,
    arguments: row.arguments,
    cursor: row.cursor,
    headers: eventParamHeadersOf(type.inputSchema, row.arguments),
  }
}

async function streamed(
  context: ReceiverContext,
  transport: McpTransport,
  request: EventRequest,
  intake: Intake,
  first: Gap,
): Promise<RunEnd> {
  if (transport.streamEvents === undefined) return { kind: 'broken', progressed: false }
  const stop = new AbortController()
  const onStop = () => stop.abort()
  context.signal.addEventListener('abort', onStop)
  let ended: RunEnd | undefined
  let heartbeatMs = 0
  let watch: AbortController | undefined
  let gap = first
  const arm = (): void => {
    watch?.abort()
    if (!(heartbeatMs > 0)) return
    const armed = new AbortController()
    watch = armed
    // Three heartbeats of silence and the stream is taken as dead.
    void context.timer(3 * heartbeatMs, armed.signal).then(() => {
      if (!armed.signal.aborted) stop.abort()
    })
  }
  const stored = async (outcome: Promise<'ok' | 'absent' | 'failed'>): Promise<void> => {
    const result = await outcome
    if (result === 'ok') return
    ended = result === 'absent' ? STOPPED : { kind: 'broken', progressed: intake.progressed }
    stop.abort()
  }
  const take = async (message: EventStreamMessage): Promise<void> => {
    if (ended !== undefined) return
    if (message.kind === 'terminated') {
      ended = { kind: 'terminated', reason: terminationOf(message.code) }
      stop.abort()
      return
    }
    if (message.kind === 'active') heartbeatMs = message.heartbeatMs
    arm()
    if (message.kind === 'active') {
      const opened = message.truncated ? 'peer-truncated' : gap
      gap = null
      return stored(intake.store([], message.cursor, opened))
    }
    if (message.kind === 'event') {
      const occurrence = readOccurrence(message.event)
      return stored(
        intake.store(occurrence === undefined ? [] : [occurrence], message.cursor, null),
      )
    }
    if (message.kind === 'heartbeat') return stored(intake.store([], message.cursor, null))
  }
  let chain = Promise.resolve()
  const end = await transport
    .streamEvents(request, stop.signal, message => {
      chain = chain.then(() => take(message)).catch(() => undefined)
    })
    .catch(() => ({ kind: 'broken' as const }))
  await chain
  watch?.abort()
  context.signal.removeEventListener('abort', onStop)
  if (ended !== undefined) return ended
  if (context.signal.aborted) return STOPPED
  if (end.kind === 'refused') return refusedEnd(end.failure, intake.progressed)
  return { kind: 'broken', progressed: intake.progressed }
}

async function polled(
  context: ReceiverContext,
  transport: McpTransport,
  request: EventRequest,
  intake: Intake,
  first: Gap,
): Promise<RunEnd> {
  const poll = transport.pollEvents
  if (poll === undefined) return { kind: 'broken', progressed: false }
  let { cursor } = request
  let gap = first
  while (!context.signal.aborted) {
    const asked = await ask(() => poll.call(transport, { ...request, cursor }), fail(ABANDONED))
    if ('failure' in asked) return refusedEnd(asked.failure, intake.progressed)
    const answer = asked.ok
    const events = answer.events.flatMap(json => readOccurrence(json) ?? [])
    const opened = answer.truncated ? 'peer-truncated' : gap
    gap = null
    const result = await intake.store(events, answer.cursor, opened)
    if (result === 'absent') return STOPPED
    if (result === 'failed') return { kind: 'broken', progressed: intake.progressed }
    cursor = answer.cursor ?? cursor
    if (answer.hasMore) continue
    const wait = Number.isFinite(answer.nextPollMs) ? answer.nextPollMs : 0
    await context.timer(Math.max(wait, context.bounds.pollFloorMs), context.signal)
  }
  return STOPPED
}

async function rowOf(context: ReceiverContext) {
  return ask(() => context.records.read(context.key), fail('unavailable' as const))
}

/** Writes a new state onto the row as it now is; a row that changed meanwhile is read again, a gone one is left gone. */
async function marked(
  context: ReceiverContext,
  state: SubscriptionState,
  reason: TerminationReason | null,
): Promise<void> {
  for (let tries = 0; tries < 3; tries += 1) {
    const read = await rowOf(context)
    if ('failure' in read || read.ok === 'absent') return
    const row = read.ok
    if (row.state === state && row.reason === reason) return
    const next = { ...row, state, reason, revision: row.revision + 1 }
    const written = await ask(
      () => context.records.write(context.key, next, row.revision),
      fail('unavailable' as const),
    )
    if ('ok' in written) return context.changed()
    if (written.failure === 'unavailable') return
  }
}

/** One subscription being received: opened with its position, opened again after a break, ended when the peer ends it. */
export async function receive(context: ReceiverContext): Promise<void> {
  let attempt = 0
  let opened = false
  const backoff = async (): Promise<void> => {
    await context.pause(Math.min(250 * 2 ** attempt, context.bounds.backoffCapMs))
    attempt += 1
  }
  while (!context.signal.aborted) {
    const read = await rowOf(context)
    if ('failure' in read) {
      await backoff()
      continue
    }
    if (read.ok === 'absent' || read.ok.state === 'terminated') return
    const row = read.ok
    const ready = await context.ready()
    if (context.signal.aborted) return
    if (ready.kind === 'ended') return marked(context, 'terminated', ready.reason)
    if (ready.kind === 'waiting') {
      await marked(context, 'waiting', null)
      await backoff()
      continue
    }
    if (row.state === 'waiting') await marked(context, 'receiving', null)
    const first: Gap = row.cursor === null && (opened || !context.fresh) ? 'possibly-missed' : null
    opened = true
    const intake = new Intake(context, row)
    const request = requestOf(ready.type, row)
    const run = row.delivery === 'push' ? streamed : polled
    const end = await run(context, ready.transport, request, intake, first)
    if (end.kind === 'stopped') return
    if (end.kind === 'terminated') {
      await marked(context, 'terminated', end.reason)
      if (end.reason !== 'refused') await ready.refetch()
      return
    }
    if (end.kind === 'header-mismatch') await ready.refetch()
    if (end.kind === 'broken' && end.progressed) attempt = 0
    await backoff()
  }
}
