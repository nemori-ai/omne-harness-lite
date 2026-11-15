import type { Context, Ledger, PortCall, PortName } from './ports.ts'

export type Property = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6'

export type Found = Readonly<{ property: Property; signature: string; detail: string }>

export type OpKind = 'discover' | 'call' | 'list' | 'update' | 'cancel' | 'close'

export type OpView = Readonly<{
  name: string
  kind: OpKind
  status: 'waiting' | 'sent' | 'answered' | 'rejected'
  result: string
  signalled: boolean
  requests: readonly string[]
}>

export type Phase = 'authorizing' | 'sent' | 'discovery' | 'none'

export type LineEndCause = 'stream-broken' | 'process-exited'

export interface RunView {
  readonly ledger: Ledger
  readonly ops: readonly OpView[]
  readonly pending: readonly PortCall[]
  readonly timers: number
  readonly closeCalled: boolean
  readonly closeReturned: boolean
  readonly lineCloseAnswered: boolean
  readonly phasesAtClose: ReadonlyMap<string, Phase> | undefined
  readonly phasesAtSignal: ReadonlyMap<string, Phase>
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

export function phaseOf(pending: readonly PortCall[], op: string): Phase {
  const own = pending.filter(call => call.context?.op === op)
  if (own.some(call => call.port === 'credential.authorize')) return 'authorizing'
  if (own.some(call => DISCOVERY_PORTS.has(call.port))) return 'discovery'
  if (own.some(call => call.port === 'stream.next' || isRequestSend(call))) return 'sent'
  return 'none'
}

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

export function credentialAfterClose(view: RunView): Found[] {
  return view.ledger.credentialCallsAfterClose.map(method => ({
    property: 'V2',
    signature: `V2-${method}-after-close`,
    detail: `${method} called after close() resolved`,
  }))
}

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

export function contextLabel(context: Context | undefined): string {
  if (context === undefined) return 'peer'
  return context.request === undefined ? context.op : `${context.op}/${context.request}`
}
