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

/** Why the shared stream went away: what the session reads from the line's `ended` or `broken` event. */
export type LineEndCause = 'stream-broken' | 'process-exited'

/** What the properties read from a run. */
export interface RunView {
  readonly ledger: Ledger
  readonly ops: readonly OpView[]
  /** The port calls not answered yet, the hung ones included. */
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
  /** The phase of each call's current request when its signal fired. */
  readonly phasesAtSignal: ReadonlyMap<string, Phase>
  /** The phase of each operation's current request when the shared stream went away, and why. */
  readonly lineEnd:
    | Readonly<{ cause: LineEndCause; phases: ReadonlyMap<string, Phase> }>
    | undefined
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

/**
 * V4: every promise a caller can see settles once the caller's signal fired or `close()` was
 * called: the result of `discover`, `listActions`, `updateTask` and `cancelRequest`, `call()`
 * and its `answer`. At the next quiescent state they have all settled, whatever port call is
 * still pending or hung: the credential handle, the metadata fetch, the line and the peer may
 * hang; the caller does not wait for them (SPEC V4, contract T5). `close()` itself is held by
 * `closeOrder`: the one thing it still waits for is the line's `close`.
 */
export function unsettledAfterStop(view: RunView): Found[] {
  const found: Found[] = []
  for (const op of view.ops) {
    if (op.kind === 'close') continue
    const stopped = view.closeCalled || op.signalled
    if (!stopped) continue
    if (op.status === 'answered' || op.status === 'rejected') continue
    const pending = view.pending
      .filter(call => call.context?.op === op.name)
      .map(call => `${call.port} ${call.subject}`)
    found.push({
      property: 'V4',
      signature: `V4-unsettled-${op.kind}-${phaseOf(view.pending, op.name)}`,
      detail: `${op.name} is ${op.status} after ${view.closeCalled ? 'close()' : 'its signal'}; pending: ${pending.join(', ') || 'nothing'}`,
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
 * V4: `close()` reaches the line at once: at the quiescent state after it was called, the
 * line's `close` has been called, whatever else is pending. Nothing the session waits for
 * stands between `close()` and the line (SPEC「关闭」).
 */
export function closeReachesLine(view: RunView): Found[] {
  if (!view.closeCalled || view.ledger.lineCloses > 0) return []
  return [
    {
      property: 'V4',
      signature: 'V4-close-waits-port',
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

/** What a stop (the signal, or `close()`) answers a request in each phase (contract T5). */
function stopAnswerOf(phase: Exclude<Phase, 'none'>): string {
  switch (phase) {
    case 'authorizing':
      return 'not-sent/connection-unavailable'
    case 'sent':
      return 'no-answer/abandoned'
    case 'discovery':
      return 'not-sent/authorization-required'
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

/**
 * What the line going away answers a request in each phase (contract T8 S01–S04, the SSE mode):
 * only the phases that depend on the line settle by the cause; a discovery goes on to its own
 * conclusion.
 */
function lineGoneAnswerOf(phase: Exclude<Phase, 'none'>, cause: LineEndCause): string {
  switch (phase) {
    case 'authorizing':
      return 'not-sent/connection-unavailable'
    case 'sent':
      return `no-answer/${cause}`
    case 'discovery':
      return 'not-sent/authorization-required'
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

type Stop = Readonly<{
  name: string
  tag: string
  phases: ReadonlyMap<string, Phase> | undefined
  expected: (phase: Exclude<Phase, 'none'>) => string
}>

/**
 * V6: what the signal, `close()` or the line going away answers a request in flight, by the phase
 * it was in when that came: the signal and `close()` answer alike (`not-sent` while authorizing,
 * `abandoned` once handed to the line, `authorization-required` with what was fetched by then
 * while discovering; contract T5), the first of the two decides. The line going away answers
 * `not-sent` while authorizing and the cause once handed to the line; a discovery goes on to
 * `authorization-required` (contract T8).
 */
export function stopAnswers(view: RunView): Found[] {
  const found: Found[] = []
  const stops: readonly Stop[] = [
    { name: 'its signal', tag: '', phases: view.phasesAtSignal, expected: stopAnswerOf },
    { name: 'close()', tag: '', phases: view.phasesAtClose, expected: stopAnswerOf },
    {
      name: `the line end (${view.lineEnd?.cause ?? ''})`,
      tag: 'lineend-',
      phases: view.lineEnd?.phases,
      expected: phase => lineGoneAnswerOf(phase, view.lineEnd?.cause ?? 'stream-broken'),
    },
  ]
  for (const stop of stops) {
    if (stop.phases === undefined) continue
    for (const op of view.ops) {
      const phase = stop.phases.get(op.name)
      if (phase === undefined || phase === 'none' || op.status !== 'answered') continue
      const expected = stop.expected(phase)
      if (!op.result.includes(expected))
        found.push({
          property: 'V6',
          signature: `V6-${stop.tag}${phase}`,
          detail: `${op.name} was ${phase} at ${stop.name} and answered ${op.result}, not ${expected}`,
        })
    }
  }
  return found
}

/** The context an answer is attributed to, in short. */
export function contextLabel(context: Context | undefined): string {
  if (context === undefined) return 'peer'
  return context.request === undefined ? context.op : `${context.op}/${context.request}`
}
