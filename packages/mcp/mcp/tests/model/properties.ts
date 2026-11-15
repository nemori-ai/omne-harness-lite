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

export const CALL_OPS: ReadonlySet<OpKind> = new Set<OpKind>(['invoke', 'continue'])

export type OpView = Readonly<{
  name: string
  kind: OpKind
  key: string | undefined
  status: 'waiting' | 'answered' | 'rejected'
  result: string
  aborted: boolean
  stopped: boolean
  stoppedBeforeSend: boolean
  afterShut: boolean
  sends: number
  sentOk: number
  cancelRequests: number
  taskRequests: number
  taskUnsent: number
}>

export type ReservationView = Readonly<{
  key: string
  op: string
  phase: 'reserved' | 'sent' | 'closed'
  endings: number
}>

export type KeyObservation = Readonly<{ key: string; state: string; core: string; current: string }>

export interface RunView {
  readonly ledger: Ledger
  readonly ops: readonly OpView[]
  readonly pending: readonly ScriptedPortCall[]
  readonly bounds: number
  readonly shutAsked: boolean
  readonly reservations: readonly ReservationView[]
  readonly tasksOf: ReadonlySet<string>
  boundsOf(op: string): Readonly<{ started: number; fired: number }>
  observe(): readonly KeyObservation[]
  refuses(transport: string): boolean
}

const NONE = '{"kind":"none"}'
const LOST_UNCONFIRMED_WITH_RESIDUAL = '{"kind":"lost","reason":"close-unconfirmed","residual":['

export const ABANDONED_RESULT = 'sent unknown abandoned'
const TASK_UNKNOWN_RESULT = 'fail unknown'

export function unhandledSignature(reason: unknown): string {
  return reason instanceof PortFault ? 'P7-port-throw-escaped' : 'P7-internal-error'
}

export function describeReason(reason: unknown): string {
  if (reason instanceof PortFault) return `${reason.message} (at ${reason.call.site})`
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
}

export function unhandledRejection(reason: unknown): Found {
  return {
    property: 'P7',
    signature: unhandledSignature(reason),
    detail: `unhandled rejection: ${describeReason(reason)}`,
  }
}

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

export function answeredWithReservation(view: RunView, op: OpView): Found[] {
  return view.reservations
    .filter(item => item.op === op.name && item.phase !== 'closed')
    .map(item => ({
      property: 'P11' as const,
      signature: 'P11-answered-with-open-reservation',
      detail: `${op.name} answered ${op.result} while its reservation is ${item.phase}`,
    }))
}

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

const TAKING_REQUESTS = /^\{"kind":"(preparing|ready|degraded)"/

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

function answersAfterShutdown(op: OpView): readonly string[] | undefined {
  if (CALL_OPS.has(op.kind)) {
    if (!op.result.startsWith('not-sent')) return undefined
    return op.afterShut ? [...CALL_AFTER_SHUT, 'not-sent correlation-key-in-use'] : CALL_AFTER_SHUT
  }
  if (op.kind !== 'task' || op.taskRequests > op.taskUnsent) return undefined
  return op.afterShut ? [...TASK_AFTER_SHUT, 'fail unknown'] : TASK_AFTER_SHUT
}

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

export const REQUEST_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'transport.call',
  'transport.answer',
  ...TASK_PORTS,
])

const READY = '{"kind":"ready"}'
const LOST = '{"kind":"lost"'

function lossPort(port: PortName): boolean {
  return TEARDOWN_PORTS.has(port) || port === 'store.read' || port === 'store.write'
}

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

function atRest(view: RunView): boolean {
  return view.pending.length === 0 && view.bounds === 0
}

function releasedTwice(view: RunView): Found[] {
  return view.ledger.handles
    .filter(handle => handle.releases > 1)
    .map(handle => ({
      property: 'P1',
      signature: 'P1-released-twice',
      detail: `${handle.name} release() called ${handle.releases} times`,
    }))
}

function releasedBeforeStop(view: RunView): Found[] {
  return view.ledger.earlyReleases.splice(0).map(detail => ({
    property: 'P1',
    signature: 'P1-released-before-stop',
    detail,
  }))
}

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

function ofBuild(call: ScriptedPortCall): boolean {
  return call.context?.op.startsWith('e') === true
}

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

function pendingOf(view: RunView, op: OpView): readonly ScriptedPortCall[] {
  return view.pending.filter(call => call.context?.op === op.name)
}

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
      const behind = [...new Set(pending.map(call => call.port))].sort().join(',') || 'nothing'
      return {
        property: 'P14' as const,
        signature: `P14-stopped-waits[${behind}]`,
        detail: `${op.name} still waits after its stop and every bound fired; pending: ${describePending(pending)}`,
      }
    })
}

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
  for (const { key, state } of view.observe())
    if (state !== NONE && !state.startsWith(LOST_UNCONFIRMED_WITH_RESIDUAL))
      found.push({
        property: 'P2',
        signature: 'P2-entry-left',
        detail: `key ${key} reports ${state} at rest after the shutdown`,
      })
  return found
}

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

export function closeWaitsUnbounded(view: RunView): boolean {
  return (
    view.bounds === 0 &&
    view.ops.some(
      op => (op.kind === 'release' || op.kind === 'closeAll') && op.status === 'waiting',
    )
  )
}
