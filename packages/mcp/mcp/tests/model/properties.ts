// The observable projections of P1–P14 (SPEC「性质与证据」) on one run of the explorer, and P15,
// which projects contract S7 (a failure without the `unusable` mark leaves the connection as it
// is). Each check reads only what a consumer or a port can see: the ledger of the port doubles
// (what was acquired, released, stopped, closed, sent, told to cancel), the answers of the
// operations, `stateOf` and `current`, the pending port calls and bounds, the rejections nobody
// handled, and the counting view of the in-flight table (P11). None reads the table's entries.
// Each state check names the invariant of `verification/models/ConnectionTable.tla` or
// `Calls.tla` it projects; P15 has none (`verification/README.md`).
import type { Answer, Ledger, PortName, ScriptedPortCall } from './ports.ts'
import { PortFault, TASK_PORTS, TEARDOWN_PORTS, USABLE_FAILURE } from './ports.ts'

export type Property =
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'P7'
  | 'P8'
  | 'P9'
  | 'P10'
  | 'P11'
  | 'P12'
  | 'P13'
  | 'P14'
  | 'P15'
  | 'P16'

/** One violation of a property: which check, and what it saw. */
export type Found = Readonly<{ property: Property; signature: string; detail: string }>

export type OpKind =
  | 'ensure'
  | 'release'
  | 'closeAll'
  | 'lose'
  | 'invoke'
  | 'continue'
  | 'cancel'
  | 'task'

/** The operations of the call port that reserve a place and may send (SPEC MC-16). */
export const CALL_OPS: ReadonlySet<OpKind> = new Set<OpKind>(['invoke', 'continue'])

export type OpView = Readonly<{
  name: string
  kind: OpKind
  key: string | undefined
  status: 'waiting' | 'answered' | 'rejected'
  result: string
  /** The caller's signal fired (`abort`). */
  aborted: boolean
  /** A stop signal fired for the call: `cancel` answered `signalled` on it, or `abort`. */
  stopped: boolean
  /** The stop fired while the call had made no `transport.call` yet (P9). */
  stoppedBeforeSend: boolean
  /** The operation started after `closeAll` was called (P13). */
  afterShut: boolean
  /** `transport.call` calls made under the operation, and how many of them answered `ok`. */
  sends: number
  sentOk: number
  /** `cancelRequest` calls made under the operation. */
  cancelRequests: number
  /** Task requests (a transport task method) made under the operation, and how many answered `not-sent`. */
  taskRequests: number
  taskUnsent: number
}>

/** One reservation of the in-flight table, as the counting view saw it (P11). */
export type ReservationView = Readonly<{
  key: string
  op: string
  phase: 'reserved' | 'sent' | 'closed'
  /** How often it was concluded (`conclude`). */
  endings: number
}>

/** What one key looks like to a consumer: `stateOf` with and without the residual, and `current`. */
export type KeyObservation = Readonly<{ key: string; state: string; core: string; current: string }>

/** What the properties read from a run. */
export interface RunView {
  readonly ledger: Ledger
  readonly ops: readonly OpView[]
  readonly pending: readonly ScriptedPortCall[]
  /** Bounds not fired yet. */
  readonly bounds: number
  readonly shutAsked: boolean
  readonly reservations: readonly ReservationView[]
  /** The keys whose `invoke` answered a task, so their principal is the task's initiator. */
  readonly tasksOf: ReadonlySet<string>
  /** How many bounds were started for the client operation `op`, and how many of them fired. */
  boundsOf(op: string): Readonly<{ started: number; fired: number }>
  observe(): readonly KeyObservation[]
  /**
   * True once the connection of the transport refuses requests (P16): the close of its key began
   * (`release`, `closeAll`) after the transport's `transports.open` was called, or the explorer's
   * own `lose` or `drop` step lost its generation. A loss the product reads from a marked answer
   * is not counted, so a request it sends in the turns before that loss is not reported.
   */
  refuses(transport: string): boolean
}

const NONE = '{"kind":"none"}'
const LOST_UNCONFIRMED_WITH_RESIDUAL = '{"kind":"lost","reason":"close-unconfirmed","residual":['

/** The result text of a call the caller abandoned (MC-16 step 12, T9). */
export const ABANDONED_RESULT = 'sent unknown abandoned'
const TASK_UNKNOWN_RESULT = 'fail unknown'

/** The signature of a rejection nobody handled: a port's throw that escaped, or an own error. */
export function unhandledSignature(reason: unknown): string {
  return reason instanceof PortFault ? 'P7-port-throw-escaped' : 'P7-internal-error'
}

export function describeReason(reason: unknown): string {
  if (reason instanceof PortFault) return `${reason.message} (at ${reason.call.site})`
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
}

/** P7: a rejection nobody handled crashes the host under Node's default mode. */
export function unhandledRejection(reason: unknown): Found {
  return {
    property: 'P7',
    signature: unhandledSignature(reason),
    detail: `unhandled rejection: ${describeReason(reason)}`,
  }
}

/** P7: an error of this package reached a caller (an illegal transition, for instance). */
export function internalError(op: OpView, reason: unknown): Found[] {
  if (reason instanceof PortFault) return []
  return [
    {
      property: 'P7',
      signature: 'P7-internal-error',
      detail: `${op.name} rejected with ${describeReason(reason)}`,
    },
  ]
}

/** P4: after `closeAll` began, no process is started and no transport is opened. */
export function connectsAfterShutdown(view: RunView, call: ScriptedPortCall): Found[] {
  if (!view.shutAsked || (call.port !== 'landing.start' && call.port !== 'transports.open'))
    return []
  return [
    {
      property: 'P4',
      signature: 'P4-connect-after-closeAll',
      detail: `${call.port} for ${call.key} after closeAll (at ${call.site})`,
    },
  ]
}

/** P4 (decision 23): an `ensure` that answers after `closeAll` began does not answer a connection. */
export function connectedAfterShutdown(view: RunView, op: OpView): Found[] {
  if (!view.shutAsked) return []
  return [
    {
      property: 'P4',
      signature: 'P4-ok-after-closeAll',
      detail: `${op.name} answered a connection after closeAll`,
    },
  ]
}

/** P5: a call made for one key's operation names that key only. */
export function crossesKeys(
  view: RunView,
  call: ScriptedPortCall,
  opKey: string | undefined,
): Found[] {
  const found: Found[] = view.ledger.crossings
    .splice(0)
    .map(detail => ({ property: 'P5', signature: 'P5-crossing', detail }))
  if (opKey !== undefined && opKey !== call.key)
    found.push({
      property: 'P5',
      signature: 'P5-crossing',
      detail: `${call.port} ${call.subject} for key ${call.key} made by an operation of key ${opKey}`,
    })
  return found
}

/** P5: an `ensure` of a key answers a transport of that key only. */
export function foreignTransport(op: OpView, transportKey: string | undefined): Found[] {
  if (op.key === undefined || transportKey === undefined || transportKey === op.key) return []
  return [
    {
      property: 'P5',
      signature: 'P5-crossing',
      detail: `${op.name} answered a transport of key ${transportKey}`,
    },
  ]
}

/** P3: when `closeAll` answers, every process the landing handed over was asked to stop. */
export function unstoppedAtShutdown(view: RunView, op: OpView): Found[] {
  if (op.kind !== 'closeAll') return []
  return view.ledger.processes
    .filter(process => process.stops === 0)
    .map(process => ({
      property: 'P3',
      signature: 'P3-not-asked',
      detail: `${op.name} answered while ${process.name} was never asked to stop`,
    }))
}

/** P6: a late answer changes no consumer-visible state but the residual it reports. */
export function lateChanged(
  call: ScriptedPortCall,
  before: readonly KeyObservation[],
  after: readonly KeyObservation[],
): Found[] {
  return after
    .filter((item, index) => {
      const earlier = before[index]
      return earlier?.core !== item.core || earlier.current !== item.current
    })
    .map(item => ({
      property: 'P6',
      signature: 'P6-late-changed',
      detail: `late answer of ${call.port} ${call.subject} changed key ${item.key} to ${item.core} ${item.current}`,
    }))
}

/** P6: `lose` with a generation that is not current answers `not-current` and changes nothing. */
export function staleLoseChanged(
  op: OpView,
  before: readonly KeyObservation[],
  after: readonly KeyObservation[],
): Found[] {
  const found: Found[] = []
  if (op.status !== 'answered' || op.result !== 'not-current')
    found.push({
      property: 'P6',
      signature: 'P6-stale-lose',
      detail: `${op.name} on a generation that is not current answered ${op.status} ${op.result}`,
    })
  if (JSON.stringify(before) !== JSON.stringify(after))
    found.push({
      property: 'P6',
      signature: 'P6-stale-lose',
      detail: `${op.name} on a generation that is not current changed the table`,
    })
  return found
}

/**
 * P9 (`P9_NotSentNotSent`), at the answer of a call: a call that answers "not sent" has no
 * `transport.call` that answered `ok`; a call that answers "sent" made exactly one; a stop that
 * came before any `transport.call` leaves it so (count 0, or answered `not-sent`).
 */
export function sentMismatch(op: OpView): Found[] {
  const found: Found[] = []
  if (op.result.startsWith('not-sent') && op.sentOk > 0)
    found.push({
      property: 'P9',
      signature: 'P9-sent-but-not-sent',
      detail: `${op.name} answered ${op.result} after transport.call answered ok`,
    })
  if (op.result.startsWith('sent') && op.sends !== 1)
    found.push({
      property: 'P9',
      signature: 'P9-sent-without-one-call',
      detail: `${op.name} answered ${op.result} with ${op.sends} transport.call calls`,
    })
  if (op.stoppedBeforeSend && op.sentOk > 0)
    found.push({
      property: 'P9',
      signature: 'P9-sent-after-stop',
      detail: `${op.name} was stopped before any transport.call, yet one answered ok`,
    })
  return found
}

/** P10 (`P10_CancelOnce`), at the answer: a call that told the peer to cancel answers `abandoned`. */
export function cancelledOtherwise(op: OpView): Found[] {
  if (op.cancelRequests === 0 || op.result === ABANDONED_RESULT) return []
  return [
    {
      property: 'P10',
      signature: 'P10-cancelled-but-answered-otherwise',
      detail: `${op.name} called cancelRequest and answered ${op.result}`,
    },
  ]
}

/** P10: `cancelRequest` only for a request the transport sent, and at most once for each. */
function cancelledTwice(view: RunView): Found[] {
  const found: Found[] = view.ledger.strayCancels.splice(0).map(id => ({
    property: 'P10' as const,
    signature: 'P10-cancel-unknown-request',
    detail: `cancelRequest(${id}) for a request the transport never sent`,
  }))
  for (const request of view.ledger.requests)
    if (request.cancels > 1)
      found.push({
        property: 'P10',
        signature: 'P10-cancelled-twice',
        detail: `cancelRequest(${request.id}) called ${request.cancels} times`,
      })
  return found
}

/** P11 (`P11_ReservationEnded`), at the answer: the call's reservation ended before it answered. */
export function answeredWithReservation(view: RunView, op: OpView): Found[] {
  return view.reservations
    .filter(item => item.op === op.name && item.phase !== 'closed')
    .map(item => ({
      property: 'P11' as const,
      signature: 'P11-answered-with-open-reservation',
      detail: `${op.name} answered ${op.result} while its reservation is ${item.phase}`,
    }))
}

/** P11: at rest no reservation is open; the counting view also reports conclusions other than one. */
function reservationsLeft(view: RunView): Found[] {
  const found: Found[] = view.reservations
    .filter(item => item.endings > 1)
    .map(item => ({
      property: 'P11' as const,
      signature: 'P11-concluded-twice',
      detail: `the reservation of ${item.op} was concluded ${item.endings} times`,
    }))
  if (!atRest(view)) return found
  return [
    ...found,
    ...view.reservations
      .filter(item => item.phase !== 'closed')
      .map(item => ({
        property: 'P11' as const,
        signature: 'P11-reservation-left',
        detail: `the reservation of ${item.op} is still ${item.phase} at rest`,
      })),
  ]
}

/** P12 (`P12_Isolation`): a `cancel` or a task operation asks no port unless it may send. */
export function askedByIsolated(view: RunView, call: ScriptedPortCall, op: OpView): Found[] {
  if (op.kind === 'cancel')
    return [
      {
        property: 'P12',
        signature: 'P12-cancel-asked-port',
        detail: `${op.name} made ${call.port} ${call.subject} (at ${call.site})`,
      },
    ]
  if (op.kind !== 'task' || op.key === undefined) return []
  const found: Found[] = []
  if (!view.tasksOf.has(op.key))
    found.push({
      property: 'P12',
      signature: 'P12-task-asked-port-for-nobody',
      detail: `${op.name} of a principal that started no task made ${call.port} ${call.subject}`,
    })
  if (TASK_PORTS.has(call.port) && call.key !== op.key)
    found.push({
      property: 'P12',
      signature: 'P12-task-on-foreign-connection',
      detail: `${op.name} sent ${call.port} on the transport ${call.subject} of key ${call.key}`,
    })
  return found
}

/** P12, at the answer of a task operation: anyone but the initiator gets `unknown`. */
export function taskAnsweredForeign(view: RunView, op: OpView): Found[] {
  if (op.key === undefined || view.tasksOf.has(op.key) || op.result === TASK_UNKNOWN_RESULT)
    return []
  return [
    {
      property: 'P12',
      signature: 'P12-task-answered-nobody',
      detail: `${op.name} of a principal that started no task answered ${op.result}`,
    },
  ]
}

/** P12, when a `cancel` answers `signalled`: a call of the same tenant and principal was waiting. */
export function stoppedForeignCall(op: OpView, target: OpView | undefined): Found[] {
  if (op.result !== 'signalled' || target !== undefined) return []
  return [
    {
      property: 'P12',
      signature: 'P12-stopped-foreign-call',
      detail: `${op.name} answered signalled while key ${op.key ?? '?'} had no call in flight`,
    },
  ]
}

/**
 * P16 (MC-10, `ConnectionTable.tla` and `Calls.tla` `P16_NoRequestOnRefusing`): no request goes to
 * a transport once its connection refuses requests: its close began, or it was lost. The close
 * refuses requests before it waits for the build, and every request reads the connection in the
 * same synchronous run as the send.
 */
export function sendsOnRefusing(view: RunView, call: ScriptedPortCall): Found[] {
  if (call.transport === undefined || !view.refuses(call.transport)) return []
  return [
    {
      property: 'P16',
      signature: `P16-${call.port}-on-refusing`,
      detail: `${call.port} on ${call.transport} of ${call.key} after its connection refuses requests (at ${call.site})`,
    },
  ]
}

/** A reported state in which a connection takes requests, or is being built to take them. */
const TAKING_REQUESTS = /^\{"kind":"(preparing|ready|degraded)"/

/**
 * P16, at the step that begins a close (`release`, `closeAll`): before the step yields, no
 * connection of the closed keys takes requests or is still being built (MC-10: the close refuses
 * requests first, then waits for the build). Every connection of the closed keys at once, not
 * one after the other.
 */
export function closeNotAtOnce(
  op: OpView,
  observed: readonly KeyObservation[],
  closed: ReadonlySet<string>,
): Found[] {
  return observed
    .filter(item => closed.has(item.key))
    .filter(item => item.current !== '-' || TAKING_REQUESTS.test(item.state))
    .map(item => ({
      property: 'P16' as const,
      signature: 'P16-close-not-at-once',
      detail: `${op.name}: ${item.key} is ${item.state}, current ${item.current}, in the step its close began`,
    }))
}

/** P13 (`P13_NoSendAfterShut`): after `closeAll` was called, no `transport.call` is made. */
export function sendsAfterShutdown(view: RunView, call: ScriptedPortCall): Found[] {
  if (!view.shutAsked || call.port !== 'transport.call') return []
  return [
    {
      property: 'P13',
      signature: 'P13-call-after-closeAll',
      detail: `transport.call on ${call.subject} for ${call.key} after closeAll (at ${call.site})`,
    },
  ]
}

/** P13, at the answer: a call that started after `closeAll` answers "not sent". */
export function sentAfterShutdown(op: OpView): Found[] {
  if (!op.afterShut || !op.result.startsWith('sent')) return []
  return [
    {
      property: 'P13',
      signature: 'P13-sent-after-closeAll',
      detail: `${op.name}, started after closeAll, answered ${op.result}`,
    },
  ]
}

const CALL_AFTER_SHUT = ['not-sent connection-unavailable', 'not-sent cancelled']
const TASK_AFTER_SHUT = ['fail effect-unknown no-connection']

/**
 * What an operation that did not send may answer once `closeAll` was called (S8, MC-16, MC-17),
 * or `undefined` when it sent. One that started before `closeAll` answers as one that started
 * after it: a call `connection-unavailable` (`cancelled` when its stop signal fired), a task
 * operation `effect-unknown` (`no-connection`). One that started after it may also answer what
 * comes before the shutdown in the order: a call `correlation-key-in-use` (step 2), a task
 * operation the `unknown` of the initiator check (step 1).
 */
function answersAfterShutdown(op: OpView): readonly string[] | undefined {
  if (CALL_OPS.has(op.kind)) {
    if (!op.result.startsWith('not-sent')) return undefined
    return op.afterShut ? [...CALL_AFTER_SHUT, 'not-sent correlation-key-in-use'] : CALL_AFTER_SHUT
  }
  if (op.kind !== 'task' || op.taskRequests > op.taskUnsent) return undefined
  return op.afterShut ? [...TASK_AFTER_SHUT, 'fail unknown'] : TASK_AFTER_SHUT
}

/**
 * P13, at the answer (the answer side of `P13_NoSendAfterShut`; `Calls.tla` has no reasons): an
 * operation that answers after `closeAll` was called and did not send answers one way, whatever
 * step it was at when the shutdown landed.
 */
export function answeredOtherwiseAfterShutdown(view: RunView, op: OpView): Found[] {
  if (!view.shutAsked) return []
  const allowed = answersAfterShutdown(op)
  if (allowed === undefined || allowed.includes(op.result)) return []
  return [
    {
      property: 'P13',
      signature: 'P13-answer-after-closeAll',
      detail: `${op.name} answered ${op.result} after closeAll; expected ${allowed.join(' or ')}`,
    },
  ]
}

/** The transport methods a request on a ready connection waits for: the call port's and the task operations'. */
export const REQUEST_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.call',
  'transport.answer',
  ...TASK_PORTS,
])

const READY = '{"kind":"ready"}'
const LOST = '{"kind":"lost"'

/** The ports a loss reaches first: the teardown, and the store for the catalog mark (S7). */
function lossPort(port: PortName): boolean {
  return TEARDOWN_PORTS.has(port) || port === 'store.read' || port === 'store.write'
}

/**
 * P15 (contract S7, T1; member `lostOf` rule 3): a request on a ready connection whose transport
 * answers a failure without the `unusable` mark (`not-sent` (`connection-unavailable`) or
 * `no-answer`) leaves the connection as it is. After the step that hands the answer over, the
 * key's state is not `lost`, and the step made no call that a loss makes first: no teardown port
 * and no store call for the catalog mark of that key. `call` is the answered port call, `made`
 * the port calls the step made. The rule's other exception, `not-sent` (`authorization-required`),
 * loses the connection; the model's stdio transport never answers it, so the check needs no case
 * for it.
 */
export function lostOnUsableFailure(
  call: ScriptedPortCall,
  answer: Answer,
  before: readonly KeyObservation[],
  after: readonly KeyObservation[],
  made: readonly ScriptedPortCall[],
): Found[] {
  if (answer !== USABLE_FAILURE || !REQUEST_PORTS.has(call.port)) return []
  const was = before.find(item => item.key === call.key)
  if (was?.state !== READY) return []
  const found: Found[] = []
  const now = after.find(item => item.key === call.key)
  if (now?.state.startsWith(LOST) === true)
    found.push({
      property: 'P15',
      signature: 'P15-lost-on-usable-failure',
      detail: `${call.port} ${call.subject} failed without the mark and key ${call.key} became ${now.state}`,
    })
  const losing = made.filter(item => item.key === call.key && lossPort(item.port))
  if (losing.length > 0)
    found.push({
      property: 'P15',
      signature: 'P15-teardown-on-usable-failure',
      detail: `${call.port} ${call.subject} failed without the mark and the step made ${losing.map(item => `${item.port} ${item.subject}`).join(', ')}`,
    })
  return found
}

/**
 * The witness of P15 and of its marked counterpart: how a failure of a request on a ready
 * connection ended, as `<port> <answer> <state kind after the step>` (`transport.call fail lost`).
 * Undefined for any other answer or port, or when the connection was not ready.
 */
export function failureEnding(
  call: ScriptedPortCall,
  answer: Answer,
  before: readonly KeyObservation[],
  after: readonly KeyObservation[],
): string | undefined {
  if ((answer !== 'fail' && answer !== USABLE_FAILURE) || !REQUEST_PORTS.has(call.port))
    return undefined
  if (before.find(item => item.key === call.key)?.state !== READY) return undefined
  const state = after.find(item => item.key === call.key)?.state ?? ''
  return `${call.port} ${answer} ${/^\{"kind":"([a-z-]+)"/.exec(state)?.[1] ?? '?'}`
}

/** Nothing can happen any more without a client call: no port call pending, no bound left. */
function atRest(view: RunView): boolean {
  return view.pending.length === 0 && view.bounds === 0
}

/** P1 (`P1_AtMostOnce`): no handle is released twice. */
function releasedTwice(view: RunView): Found[] {
  return view.ledger.handles
    .filter(handle => handle.releases > 1)
    .map(handle => ({
      property: 'P1',
      signature: 'P1-released-twice',
      detail: `${handle.name} release() called ${handle.releases} times`,
    }))
}

/** P1 with S9: a handle is released only after every process that carries it answered `stop()`. */
function releasedBeforeStop(view: RunView): Found[] {
  return view.ledger.earlyReleases.splice(0).map(detail => ({
    property: 'P1',
    signature: 'P1-released-before-stop',
    detail,
  }))
}

/**
 * P2 (`P2_NoneHoldsNothing`): a key the status view reports as `none`, with nothing of it in
 * flight (no operation, no port call), holds nothing: every handle released, every transport
 * closed, every process confirmed stopped. Otherwise an entry left the table while it held a
 * resource, or the resource belongs to nobody. The model also checks the entries that left the
 * table directly (`P2_ForgetHoldsNothing`).
 */
function heldWithoutEntry(view: RunView): Found[] {
  const found: Found[] = []
  const { handles, processes, transports } = view.ledger
  for (const { key, state } of view.observe()) {
    if (state !== NONE) continue
    const busy =
      view.ops.some(op => op.key === key && op.status === 'waiting') ||
      view.pending.some(call => call.key === key)
    if (busy) continue
    const held = [
      ...handles.filter(item => item.key === key && item.releases === 0).map(item => item.name),
      ...transports.filter(item => item.key === key && item.closes === 0).map(item => item.name),
      ...processes
        .filter(item => item.key === key && item.lastStop !== 'tree-confirmed')
        .map(item => item.name),
    ]
    if (held.length > 0)
      found.push({
        property: 'P2',
        signature: 'P2-held-without-entry',
        detail: `key ${key} reports none and still holds ${held.join(', ')}`,
      })
  }
  return found
}

/** A call a build makes: under the context of the `ensure` that started it. */
function ofBuild(call: ScriptedPortCall): boolean {
  return call.context?.op.startsWith('e') === true
}

/**
 * What a waiting `ensure` is stuck behind: a step of a build's own teardown (P2: the teardown
 * before the attempt, or after a failure), else the build's mark of the catalog (N1).
 */
function stuckSignature(pending: readonly ScriptedPortCall[]): string {
  const building = pending.filter(ofBuild)
  if (building.some(call => TEARDOWN_PORTS.has(call.port) && call.site.includes('closeOrder@')))
    return 'P2'
  if (building.some(call => call.port === 'store.read')) return 'N1'
  return 'P8-other'
}

function describePending(pending: readonly ScriptedPortCall[]): string {
  return pending.map(call => `${call.port} ${call.subject}`).join(', ') || 'nothing'
}

/** The pending calls made under the operation. */
function pendingOf(view: RunView, op: OpView): readonly ScriptedPortCall[] {
  return view.pending.filter(call => call.context?.op === op.name)
}

/**
 * P8 theorem T2 (`P8_BoundedEnsure`): an `ensure` whose own bounds all fired has answered,
 * whatever the ports still pending do (they may hang) and whatever bounds of other calls are
 * left. An `ensure` that waits with no bound of its own breaks it too: each one starts its section
 * bound before it first waits, so `fired === started` with none started is a violation.
 */
function ensureUnbounded(view: RunView): Found[] {
  const waiting = view.ops.filter(op => {
    if (op.kind !== 'ensure' || op.status !== 'waiting') return false
    const { started, fired } = view.boundsOf(op.name)
    return fired === started
  })
  if (waiting.length === 0) return []
  return [
    {
      property: 'P8',
      signature: stuckSignature(view.pending),
      detail: `${waiting.map(op => op.name).join(', ')} waiting after its own bounds fired (or with none started); pending: ${describePending(view.pending)}`,
    },
  ]
}

/**
 * P8 theorem T1 (`P8_EveryCallerAnswers`) and P14 T1 (`P14_EveryCallAnswers`): at rest, every
 * caller has answered. The operations of the call port report under P14.
 */
function callerUnanswered(view: RunView): Found[] {
  if (!atRest(view)) return []
  const waiting = view.ops.filter(op => op.status === 'waiting')
  if (waiting.length === 0) return []
  const lifecycle = waiting.filter(op => !CALL_OPS.has(op.kind) && op.kind !== 'task')
  const calls = waiting.filter(op => CALL_OPS.has(op.kind) || op.kind === 'task')
  const found: Found[] = []
  if (lifecycle.length > 0)
    found.push({
      property: 'P8',
      signature: 'P8-T1-unanswered',
      detail: `${lifecycle.map(op => op.name).join(', ')} waiting with no port call pending and no bound left`,
    })
  if (calls.length > 0)
    found.push({
      property: 'P14',
      signature: 'P14-T1-unanswered',
      detail: `${calls.map(op => op.name).join(', ')} waiting with no port call pending and no bound left`,
    })
  return found
}

/**
 * P14 T2 (`P14_BoundedAfterStop`, the global form of P8 T2 for the call port): once a stop
 * signal fired for a call (`cancel` or the caller's abort) and every bound fired, the call has
 * answered, whatever the ports still pending do. One port is a premise, not a wait of the call
 * port: the transport's `call` answers once the signal fired (contract T5, SPEC WF5), so a call
 * behind its own `transport.call` alone is not stuck.
 */
function stoppedWaits(view: RunView): Found[] {
  if (view.bounds > 0) return []
  return view.ops
    .filter(op => CALL_OPS.has(op.kind) && op.stopped && op.status === 'waiting')
    .filter(op => {
      const pending = pendingOf(view, op)
      return pending.length === 0 || pending.some(call => call.port !== 'transport.call')
    })
    .map(op => {
      const pending = pendingOf(view, op)
      // One signature per set of ports waited for: each is a distinct finding.
      const behind = [...new Set(pending.map(call => call.port))].sort().join(',') || 'nothing'
      return {
        property: 'P14' as const,
        signature: `P14-stopped-waits[${behind}]`,
        detail: `${op.name} still waits after its stop and every bound fired; pending: ${describePending(pending)}`,
      }
    })
}

/** P14 T3: a task operation whose own bounds all fired has answered (MC-17, like P8 T2). */
function taskUnbounded(view: RunView): Found[] {
  return view.ops
    .filter(op => {
      if (op.kind !== 'task' || op.status !== 'waiting') return false
      const { started, fired } = view.boundsOf(op.name)
      return started > 0 && fired === started
    })
    .map(op => ({
      property: 'P14' as const,
      signature: 'P14-task-unbounded',
      detail: `${op.name} waiting after its own bounds fired; pending: ${describePending(pendingOf(view, op))}`,
    }))
}

/**
 * P1, P2, P3 at rest after the shutdown answered (`P1_ShutdownReleasesAll`,
 * `P3_EveryProcessAsked`): every handle released exactly once, every transport closed, every
 * process asked to stop, every key `none`.
 */
function leftAfterShutdown(view: RunView): Found[] {
  const shutdown = view.ops.some(op => op.kind === 'closeAll' && op.status !== 'waiting')
  if (!shutdown || !atRest(view)) return []
  const { handles, processes, transports } = view.ledger
  const found: Found[] = [
    ...handles
      .filter(item => item.releases === 0)
      .map(item => ({
        property: 'P1' as const,
        signature: 'P1-never-released',
        detail: `${item.name} never released after the shutdown`,
      })),
    ...processes
      .filter(item => item.stops === 0)
      .map(item => ({
        property: 'P3' as const,
        signature: 'P3-not-asked',
        detail: `${item.name} never asked to stop after the shutdown`,
      })),
    ...transports
      .filter(item => item.closes === 0)
      .map(item => ({
        property: 'P2' as const,
        signature: 'P2-transport-left',
        detail: `${item.name} never closed after the shutdown`,
      })),
  ]
  // An entry may stay after the shutdown only to keep a process whose stop was not confirmed (S7).
  for (const { key, state } of view.observe())
    if (state !== NONE && !state.startsWith(LOST_UNCONFIRMED_WITH_RESIDUAL))
      found.push({
        property: 'P2',
        signature: 'P2-entry-left',
        detail: `key ${key} reports ${state} at rest after the shutdown`,
      })
  return found
}

/** The invariants checked in every state the explorer reaches. */
export function stateViolations(view: RunView): Found[] {
  return [
    ...releasedTwice(view),
    ...releasedBeforeStop(view),
    ...heldWithoutEntry(view),
    ...ensureUnbounded(view),
    ...callerUnanswered(view),
    ...leftAfterShutdown(view),
    ...cancelledTwice(view),
    ...reservationsLeft(view),
    ...stoppedWaits(view),
    ...taskUnbounded(view),
  ]
}

/**
 * P8 anti-theorem A1 (`P8_BoundedClose`, a probe): a `release` or `closeAll` still waits after
 * every bound fired, behind a port that does not answer. Its witness is expected; it is a known
 * limitation, not a violation.
 */
export function closeWaitsUnbounded(view: RunView): boolean {
  return (
    view.bounds === 0 &&
    view.ops.some(
      op => (op.kind === 'release' || op.kind === 'closeAll') && op.status === 'waiting',
    )
  )
}
