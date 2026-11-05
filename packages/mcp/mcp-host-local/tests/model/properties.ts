// The observable projections of V1–V6 (SPEC「性质与证据」) on one run of the explorer. Each check
// reads only what a caller or a port can see: the answers of the client operations, the ledger
// of the port doubles, the pending port calls with their context, and the timers. None reads
// the session's fields. Each check names the invariant of `verification/models/TransportSession.tla`
// it projects.
import type { Context, Ledger, PortCall, PortName } from './ports.ts'

export type Property = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6'

/** One violation of a property: which check, and what it saw. */
export type Found = Readonly<{ property: Property; signature: string; detail: string }>

export type OpKind = 'discover' | 'call' | 'list' | 'update' | 'cancel' | 'close'

/**
 * What a client operation looks like to its caller. A `call` is `sent` once `call()` answered
 * `ok` and its `answer` is still pending; `answered` once every promise of the operation settled.
 */
export type OpView = Readonly<{
  name: string
  kind: OpKind
  status: 'waiting' | 'sent' | 'answered' | 'rejected'
  /** The failure or answer, in short: `not-sent/connection-unavailable`, `no-answer/abandoned`, `ok` … */
  result: string
  /** Whether the call's own signal fired. */
  signalled: boolean
  /** The request ids the line saw for this operation, in order. */
  requests: readonly string[]
}>

/** The phase of a request in flight, as inferred from the pending port calls (SPEC V6). */
export type Phase = 'authorizing' | 'sent' | 'discovery' | 'none'

/** What the properties read from a run. */
export interface RunView {
  readonly ledger: Ledger
  readonly ops: readonly OpView[]
  readonly pending: readonly PortCall[]
  readonly timers: number
  /** `close()` was called. */
  readonly closeCalled: boolean
  /** `close()` resolved. */
  readonly closeReturned: boolean
  /** The `line.close` call was answered. */
  readonly lineCloseAnswered: boolean
  /** The phase of each operation's current request when `close()` was called. */
  readonly phasesAtClose: ReadonlyMap<string, Phase> | undefined
}

const DISCOVERY_PORTS: ReadonlySet<PortName> = new Set<PortName>([
  'credential.reportRejection',
  'fetchMetadata',
])

export function describeReason(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
}

function isRequestSend(call: PortCall): boolean {
  return call.port === 'line.send' && !call.subject.includes('/')
}

/** The phase of an operation's current request: which port call it waits on. */
export function phaseOf(pending: readonly PortCall[], op: string): Phase {
  const own = pending.filter(call => call.context?.op === op)
  if (own.some(call => call.port === 'credential.authorize')) return 'authorizing'
  if (own.some(call => DISCOVERY_PORTS.has(call.port))) return 'discovery'
  // A `line.send` of a notification (its subject is the method, not a request id) is no request.
  if (own.some(call => call.port === 'stream.next' || isRequestSend(call))) return 'sent'
  return 'none'
}

/** V4: a rejection nobody handled, or an operation that rejected: the session threw. */
export function unhandledRejection(reason: unknown): Found {
  return {
    property: 'V4',
    signature: 'V4-unhandled-rejection',
    detail: `unhandled rejection: ${describeReason(reason)}`,
  }
}

export function operationRejected(op: OpView, reason: unknown): Found {
  return {
    property: 'V4',
    signature: 'V4-operation-rejected',
    detail: `${op.name} rejected with ${describeReason(reason)}`,
  }
}

/**
 * V1: no port call is made on behalf of a request whose answer settled: a credential call, a
 * metadata fetch or a new `send` in its context. `stream.next` is allowed: the answer stream is
 * read to its end in the background (SPEC「资源释放」).
 */
export function callAfterSettled(call: PortCall, settled: ReadonlySet<string>): Found[] {
  const request = call.context?.request
  if (request === undefined || !settled.has(request) || call.port === 'stream.next') return []
  if (call.port === 'line.close') return []
  return [
    {
      property: 'V1',
      signature: `V1-${call.port}-after-settle`,
      detail: `${call.port} ${call.subject} made for ${request} after it settled (at ${call.site})`,
    },
  ]
}

/** V2: once `close()` resolved, the credential handle is not called. */
export function credentialAfterClose(view: RunView): Found[] {
  return view.ledger.credentialCallsAfterClose.map(method => ({
    property: 'V2',
    signature: `V2-${method}-after-close`,
    detail: `${method} called after close() resolved`,
  }))
}

/**
 * V3: `reportRejection` is called at most once per 401 or scoped 403 answer, never for any
 * other answer, and only when the material has a handle. The explorer counts the refusals it
 * delivered to authorized requests; the ledger counts the calls.
 */
export function rejectionsBounded(view: RunView, refusals: number, hasHandle: boolean): Found[] {
  const calls = view.ledger.rejections
  if (!hasHandle && calls > 0)
    return [
      {
        property: 'V3',
        signature: 'V3-no-handle',
        detail: `reportRejection called ${calls} times with no credential handle`,
      },
    ]
  if (calls > refusals)
    return [
      {
        property: 'V3',
        signature: 'V3-more-than-refusals',
        detail: `reportRejection called ${calls} times for ${refusals} refused answers`,
      },
    ]
  return []
}

/** Whether the discovery ports of `op` are at rest: `reportRejection` answered, `fetchMetadata` done. */
function discoveryAtRest(view: RunView, op: string): boolean {
  return !view.pending.some(
    call =>
      call.context?.op === op &&
      (call.port === 'credential.reportRejection' ||
        (call.port === 'fetchMetadata' && call.signal?.aborted !== true)),
  )
}

/**
 * V4: once the caller's signal fired, or `close()` was called, the request in flight settles
 * without waiting for the wire. A request that reached the wire (`sent`) must be settled at the
 * next quiescent state: the signal, or `close()`, abandons it there and then, even while the
 * answer stream or the write stays pending (SPEC V4). A request still discovering authorization
 * settles once its discovery ports come to rest. A request still authorizing is blocked on the
 * credential handle, which takes no signal: that handle may hang and is carried by its holder
 * (SPEC V4「端口调用本身可以挂着，由拥有者承接」), so it is not flagged here.
 */
export function unsettledAfterStop(view: RunView): Found[] {
  const found: Found[] = []
  for (const op of view.ops) {
    if (op.kind === 'close' || op.kind === 'cancel') continue
    const stopped = view.closeCalled || op.signalled
    if (!stopped) continue
    if (op.status === 'answered' || op.status === 'rejected') continue
    const phase = phaseOf(view.pending, op.name)
    if (phase === 'sent' || (phase === 'discovery' && discoveryAtRest(view, op.name)))
      found.push({
        property: 'V4',
        signature: `V4-unsettled-${phase}`,
        detail: `${op.name} is ${op.status} in phase ${phase} after ${view.closeCalled ? 'close()' : 'its signal'}`,
      })
  }
  return found
}

/** V4: `close()` resolves once the line's `close` answered, and not before. */
export function closeOrder(view: RunView): Found[] {
  if (!view.closeCalled) return []
  if (view.closeReturned && !view.lineCloseAnswered)
    return [
      {
        property: 'V4',
        signature: 'V4-close-before-line',
        detail: 'close() resolved before the line answered its close',
      },
    ]
  if (view.lineCloseAnswered && !view.closeReturned)
    return [
      {
        property: 'V4',
        signature: 'V4-close-after-line',
        detail: 'the line answered its close and close() did not resolve',
      },
    ]
  return []
}

/**
 * V4: after `close()`, once every pending port call is aborted (its signal fired) or there is
 * none, the line's `close` has been called: nothing the session waits for can still answer.
 */
export function closeReachesLine(view: RunView): Found[] {
  if (!view.closeCalled || view.ledger.lineCloses > 0) return []
  // A call the session may still settle through: one with no signal (a credential call it awaits),
  // or one whose signal has not fired. Only when none is left should the line have been closed.
  const live = view.pending.filter(call => call.signal === undefined || !call.signal.aborted)
  if (live.length > 0) return []
  return [
    {
      property: 'V4',
      signature: 'V4-close-waits-aborted-port',
      detail: `close() has not closed the line; pending: ${view.pending.map(call => `${call.port} ${call.subject}`).join(', ')}`,
    },
  ]
}

const WRITE_METHODS: ReadonlySet<string> = new Set(['tools/call', 'tasks/update', 'tasks/cancel'])

/**
 * V5: a write request goes out once; a read request goes out at most twice, the second time with
 * a new id and, on a material with a handle, its own authorization.
 */
export function resendBounded(view: RunView): Found[] {
  const found: Found[] = []
  for (const op of view.ops) {
    if (op.kind === 'close' || op.kind === 'cancel') continue
    const byMethod = new Map<string, number>()
    for (const id of op.requests) {
      const sent = view.ledger.sent.find(message => message.id === id)
      if (sent === undefined) continue
      byMethod.set(sent.method, (byMethod.get(sent.method) ?? 0) + 1)
    }
    for (const [method, count] of byMethod) {
      const limit = WRITE_METHODS.has(method) ? 1 : 2
      if (count > limit)
        found.push({
          property: 'V5',
          signature: `V5-${WRITE_METHODS.has(method) ? 'write' : 'read'}-resent`,
          detail: `${op.name} sent ${method} ${count} times`,
        })
    }
    if (new Set(op.requests).size !== op.requests.length)
      found.push({
        property: 'V5',
        signature: 'V5-same-id',
        detail: `${op.name} re-used a request id: ${op.requests.join(', ')}`,
      })
  }
  return found
}

/**
 * V6: what `close()` answers a request in flight: `not-sent` while authorizing, `abandoned` once
 * sent, `authorization-required` once the discovery it entered ends.
 */
export function closeAnswers(view: RunView): Found[] {
  const phases = view.phasesAtClose
  if (phases === undefined) return []
  const found: Found[] = []
  for (const op of view.ops) {
    const phase = phases.get(op.name)
    if (phase === undefined || phase === 'none' || op.status !== 'answered') continue
    const expected =
      phase === 'authorizing'
        ? 'not-sent/connection-unavailable'
        : phase === 'sent'
          ? 'no-answer/abandoned'
          : 'not-sent/authorization-required'
    if (!op.result.includes(expected))
      found.push({
        property: 'V6',
        signature: `V6-${phase}`,
        detail: `${op.name} was ${phase} at close() and answered ${op.result}, not ${expected}`,
      })
  }
  return found
}

/** The context an answer is attributed to, in short. */
export function contextLabel(context: Context | undefined): string {
  if (context === undefined) return 'peer'
  return context.request === undefined ? context.op : `${context.op}/${context.request}`
}
