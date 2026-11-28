import type {
  LiveCommand,
  LiveCommandOutcome,
  LiveCommandReceipt,
  LiveEvent,
  LiveFrame,
  LivePhaseRefusal,
  ModelFaultCause,
  ModelOperationId,
  Termination,
} from '@omne-harness/model-contract'
import type { CallAccountReport } from '@omne-harness/model-contract/provider'

export type LiveCommandState = 'pending' | LiveCommandOutcome
export type LiveClose =
  | Readonly<{ closeFor: 'cancel'; control: ModelOperationId }>
  | Readonly<{ closeFor: 'end' | 'stop' }>
export type LiveDeadline = 'open' | 'session' | 'close' | 'drain'
export type LiveDeliveryAnswer = 'saved' | 'unknown' | 'waiting' | 'refused'
type UpstreamEvent = Extract<LiveEvent, { t: 'transcript' | 'delegation' | 'asleep' }>
export type LiveAccount = Readonly<{ event: string; value: CallAccountReport }>

type Shared = Readonly<{
  commands: ReadonlyMap<ModelOperationId, LiveCommandState>
  frames: readonly LiveFrame[]
  floor: number
  next: number
  /** The last number of the delivery in flight; the frames up to it stay until it is saved. */
  flying: number | null
  refused: boolean
  capacity: number
  /** The last usage the upstream reported; it is the call's only once the upstream's close is seen. */
  account: LiveAccount | null
}>
export type LiveBody = Shared &
  (
    | Readonly<{ phase: 'connecting'; cancel: ModelOperationId | null }>
    | Readonly<{ phase: 'open' }>
    | (Readonly<{ phase: 'closing' }> & LiveClose)
    | Readonly<{ phase: 'settling'; last: number }>
    | Readonly<{ phase: 'draining' }>
    | Readonly<{ phase: 'exited' }>
  )

export type LiveInput =
  | Readonly<{ kind: 'opened'; at: string; expiresAt: string | null }>
  | Readonly<{ kind: 'event'; at: string; event: UpstreamEvent }>
  | Readonly<{ kind: 'outcome'; at: string; id: ModelOperationId; outcome: LiveCommandOutcome }>
  | Readonly<{ kind: 'account'; account: LiveAccount }>
  | Readonly<{ kind: 'closed' }>
  | Readonly<{ kind: 'lost' }>
  | Readonly<{ kind: 'deadline'; which: LiveDeadline }>
  | Readonly<{ kind: 'cancel'; control: ModelOperationId }>
  | Readonly<{ kind: 'end' }>
  | Readonly<{ kind: 'stop' }>
  | Readonly<{ kind: 'answer'; answer: LiveDeliveryAnswer }>
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'superseded' }>

export type LiveEffect =
  | Readonly<{ kind: 'send'; id: ModelOperationId; command: LiveCommand }>
  | Readonly<{ kind: 'close' }>
  | Readonly<{ kind: 'drop' }>
  | Readonly<{ kind: 'deliver'; from: number; to: number; frames: readonly LiveFrame[] }>
  | Readonly<{ kind: 'record-control' }>
  | Readonly<{
      kind: 'settle'
      termination: Termination
      last: number
      account: LiveAccount | null
    }>
  | Readonly<{ kind: 'deadline'; which: LiveDeadline; at?: string }>
  | Readonly<{ kind: 'exit' }>

export type LiveStep = Readonly<{ body: LiveBody; effects: readonly LiveEffect[] }>

export function connecting(capacity: number): LiveBody {
  return {
    phase: 'connecting',
    cancel: null,
    commands: new Map(),
    frames: [],
    floor: 0,
    next: 1,
    flying: null,
    refused: false,
    capacity,
    account: null,
  }
}

type PlainCause = Exclude<ModelFaultCause, 'input-over-limit' | 'replay-rejected'>
const failed = (cause: PlainCause, diagnostic: string): Termination => ({
  kind: 'failed',
  fault: { cause, diagnostic, upstreamStatus: null },
})
const PROTOCOL = failed('upstream-protocol', 'live-message-out-of-phase')

const lastOf = (frame: LiveFrame) => ('gap' in frame ? frame.gap.to : frame.seq)
const firstOf = (frame: LiveFrame) => ('gap' in frame ? frame.gap.from : frame.seq)

/** Numbers one event; when more events wait than the buffer holds, the oldest not in flight becomes a gap. */
function push(body: LiveBody, at: string, event: LiveEvent): LiveBody {
  const frames = [...body.frames, { seq: body.next, at, event }]
  const held = () => frames.filter(frame => !('gap' in frame)).length
  while (held() > body.capacity) {
    const index = frames.findIndex(frame => !('gap' in frame) && frame.seq > (body.flying ?? 0))
    const dropped = frames[index]
    if (dropped === undefined || 'gap' in dropped) break
    const before = frames[index - 1]
    const merges = before !== undefined && 'gap' in before && firstOf(before) > (body.flying ?? 0)
    if (merges) frames.splice(index - 1, 2, { gap: { from: before.gap.from, to: dropped.seq } })
    else frames.splice(index, 1, { gap: { from: dropped.seq, to: dropped.seq } })
  }
  return { ...body, frames, next: body.next + 1 }
}

function delivering(body: LiveBody): LiveStep {
  if (body.flying !== null || body.refused) return { body, effects: [] }
  const last = body.frames[body.frames.length - 1]
  if (last === undefined) return { body, effects: [] }
  const to = lastOf(last)
  return {
    body: { ...body, flying: to },
    effects: [{ kind: 'deliver', from: body.floor + 1, to, frames: body.frames }],
  }
}

function then(first: LiveStep, next: (body: LiveBody) => LiveStep): LiveStep {
  const second = next(first.body)
  return { body: second.body, effects: [...first.effects, ...second.effects] }
}

/** The call settles: the connection goes; the termination, the last number and a usage seen closed are written. */
function settle(body: LiveBody, termination: Termination, closeSeen = false): LiveStep {
  const last = body.next - 1
  const account = closeSeen ? body.account : null
  return {
    body: { ...body, phase: 'settling', last },
    effects: [{ kind: 'drop' }, { kind: 'settle', termination, last, account }],
  }
}

/** How a close the body asked for ends, once the upstream closed, the connection went or the deadline came. */
function closedFor(
  body: Extract<LiveBody, { phase: 'closing' }>,
  seen: boolean,
  diagnostic: string,
): Termination {
  switch (body.closeFor) {
    case 'cancel':
      return { kind: 'interrupted', control: body.control }
    case 'stop':
      return failed('runtime-lost', 'live-stopped-with-its-runtime')
    case 'end':
      return seen ? { kind: 'completed', reason: 'stop' } : failed('stream-lost', diagnostic)
  }
}

function closing(body: LiveBody, close: LiveClose): LiveStep {
  return {
    body: { ...shared(body), phase: 'closing', ...close },
    effects: [{ kind: 'close' }, { kind: 'deadline', which: 'close' }],
  }
}

function shared(body: LiveBody): Shared {
  const { commands, frames, floor, next, flying, refused, capacity, account } = body
  return { commands, frames, floor, next, flying, refused, capacity, account }
}

const running = (body: LiveBody) => body.phase === 'open' || body.phase === 'closing'

function opened(body: LiveBody, at: string, expiresAt: string | null): LiveStep {
  if (body.phase !== 'connecting') return settle(body, PROTOCOL)
  const open: LiveBody = { ...push(body, at, { t: 'started', expiresAt }), phase: 'open' }
  const session: LiveEffect = { kind: 'deadline', which: 'session' }
  const timed = expiresAt === null ? [] : [{ ...session, at: expiresAt }]
  const step = then({ body: open, effects: timed }, delivering)
  const { cancel } = body
  if (cancel === null) return step
  return then(step, next => closing(next, { closeFor: 'cancel', control: cancel }))
}

function outcome(body: LiveBody, at: string, id: ModelOperationId, result: LiveCommandOutcome) {
  if (!running(body) || !body.commands.has(id)) return settle(body, PROTOCOL)
  const commands = new Map(body.commands).set(id, result)
  return delivering(push({ ...body, commands }, at, { t: 'command', id, outcome: result }))
}

function accounted(body: LiveBody, account: LiveAccount): LiveStep {
  if (body.phase === 'connecting') return settle(body, PROTOCOL)
  return running(body) ? { body: { ...body, account }, effects: [] } : { body, effects: [] }
}

function gone(body: LiveBody, closeSeen: boolean): LiveStep {
  switch (body.phase) {
    case 'connecting':
      return settle(
        body,
        failed(
          'upstream-unavailable',
          closeSeen ? 'live-session-refused' : 'live-lost-before-open',
        ),
      )
    case 'open':
      return closeSeen
        ? settle(body, { kind: 'completed', reason: 'stop' }, true)
        : settle(body, failed('stream-lost', 'live-connection-lost'))
    case 'closing':
      return settle(body, closedFor(body, closeSeen, 'live-connection-lost'), closeSeen)
    default:
      return { body, effects: [] }
  }
}

function upstream(body: LiveBody, input: LiveInput): LiveStep | null {
  switch (input.kind) {
    case 'opened':
      return opened(body, input.at, input.expiresAt)
    case 'event':
      return running(body) ? delivering(push(body, input.at, input.event)) : settle(body, PROTOCOL)
    case 'outcome':
      return outcome(body, input.at, input.id, input.outcome)
    case 'account':
      return accounted(body, input.account)
    case 'closed':
      return gone(body, true)
    case 'lost':
      return gone(body, false)
    default:
      return null
  }
}

function draining(body: LiveBody): LiveStep {
  const drain: LiveStep = {
    body: { ...body, phase: 'draining' },
    effects: [{ kind: 'deadline', which: 'drain' }],
  }
  return then(then(drain, delivering), drained)
}

function deadline(body: LiveBody, which: LiveDeadline): LiveStep {
  if (which === 'drain') return { body: { ...body, phase: 'exited' }, effects: [{ kind: 'exit' }] }
  if (body.phase === 'connecting' && which === 'open')
    return settle(body, failed('upstream-unavailable', 'live-open-deadline'))
  if (body.phase === 'open' && which === 'session')
    return settle(body, failed('stream-lost', 'live-session-expired'))
  if (body.phase === 'closing' && (which === 'close' || which === 'session'))
    return settle(body, closedFor(body, false, 'live-close-deadline'))
  return { body, effects: [] }
}

function control(body: LiveBody, input: LiveInput): LiveStep | null {
  switch (input.kind) {
    case 'cancel':
      if (body.phase === 'connecting')
        return { body: { ...body, cancel: input.control }, effects: [] }
      return body.phase === 'open'
        ? closing(body, { closeFor: 'cancel', control: input.control })
        : { body, effects: [] }
    case 'end':
      return body.phase === 'open' ? closing(body, { closeFor: 'end' }) : { body, effects: [] }
    case 'stop':
      if (body.phase === 'connecting' || body.phase === 'open')
        return closing(body, { closeFor: 'stop' })
      if (body.phase === 'closing')
        return { body: { ...shared(body), phase: 'closing', closeFor: 'stop' }, effects: [] }
      return { body, effects: [] }
    default:
      return null
  }
}

function drained(body: LiveBody): LiveStep {
  if (body.phase !== 'draining') return { body, effects: [] }
  const done = body.refused || body.frames.length === 0
  return done
    ? { body: { ...body, phase: 'exited' }, effects: [{ kind: 'exit' }] }
    : { body, effects: [] }
}

function answered(body: LiveBody, answer: LiveDeliveryAnswer): LiveStep {
  const { flying } = body
  if (flying === null) return { body, effects: [] }
  switch (answer) {
    case 'saved': {
      const frames = body.frames.filter(frame => firstOf(frame) > flying)
      return then(delivering({ ...body, frames, floor: flying, flying: null }), drained)
    }
    case 'unknown':
    case 'waiting': {
      const frames = body.frames.filter(frame => lastOf(frame) <= flying)
      return { body, effects: [{ kind: 'deliver', from: body.floor + 1, to: flying, frames }] }
    }
    case 'refused': {
      const refused = { ...body, flying: null, refused: true }
      return then({ body: refused, effects: [{ kind: 'record-control' }] }, drained)
    }
  }
}

export function step(body: LiveBody, input: LiveInput): LiveStep {
  if (body.phase === 'exited') return { body, effects: [] }
  return upstream(body, input) ?? control(body, input) ?? own(body, input)
}

function own(body: LiveBody, input: LiveInput): LiveStep {
  switch (input.kind) {
    case 'deadline':
      return deadline(body, input.which)
    case 'answer':
      return answered(body, input.answer)
    case 'settled':
      return draining(body)
    case 'superseded':
      return { body: { ...body, phase: 'exited' }, effects: [{ kind: 'drop' }, { kind: 'exit' }] }
    default:
      return { body, effects: [] }
  }
}

const REFUSAL: Readonly<Record<'connecting' | 'closing', LivePhaseRefusal>> = {
  connecting: 'not-open',
  closing: 'closing',
}
export type LiveSubmit =
  | Readonly<{ kind: 'receipt'; receipt: LiveCommandReceipt; step: LiveStep }>
  | Readonly<{ kind: 'refused'; reason: LivePhaseRefusal }>

/** A command said into the call: taken once while open, seen again by its identity. */
export function submit(body: LiveBody, id: ModelOperationId, command: LiveCommand): LiveSubmit {
  if (body.phase === 'settling' || body.phase === 'draining' || body.phase === 'exited')
    return { kind: 'refused', reason: 'settled' }
  const known = body.commands.get(id)
  if (known !== undefined) {
    return {
      kind: 'receipt',
      receipt: { state: 'seen', outcome: known },
      step: { body, effects: [] },
    }
  }
  if (body.phase !== 'open') return { kind: 'refused', reason: REFUSAL[body.phase] }
  const commands = new Map(body.commands).set(id, 'pending')
  return {
    kind: 'receipt',
    receipt: { state: 'taken' },
    step: { body: { ...body, commands }, effects: [{ kind: 'send', id, command }] },
  }
}
