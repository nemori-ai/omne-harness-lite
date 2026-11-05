// The observable projections of P1–P8 (SPEC「性质与证据」) on one run of the explorer. Each check
// reads only what a consumer or a port can see: the ledger of the port doubles (what was acquired,
// released, stopped, closed), the answers of the table's operations, `stateOf` and `current`, the
// pending port calls and bounds, and the rejections nobody handled. None reads the table's entries.
// Each state check names the invariant of `verification/models/ConnectionTable.tla` it projects.
import type { Ledger, ScriptedPortCall } from './ports.ts'
import { PortFault, TEARDOWN_PORTS } from './ports.ts'

export type Property = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'

/** One violation of a property: which check, and what it saw. */
export type Found = Readonly<{ property: Property; signature: string; detail: string }>

export type OpKind = 'ensure' | 'release' | 'closeAll' | 'lose'

export type OpView = Readonly<{
  name: string
  kind: OpKind
  key: string | undefined
  status: 'waiting' | 'answered' | 'rejected'
  result: string
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
  /** How many bounds were started for the client operation `op`, and how many of them fired. */
  boundsOf(op: string): Readonly<{ started: number; fired: number }>
  observe(): readonly KeyObservation[]
}

const NONE = '{"kind":"none"}'
const LOST_UNCONFIRMED_WITH_RESIDUAL = '{"kind":"lost","reason":"close-unconfirmed","residual":['

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

/** P8 theorem T1 (`P8_EveryCallerAnswers`): at rest, every caller has answered. */
function callerUnanswered(view: RunView): Found[] {
  if (!atRest(view)) return []
  const waiting = view.ops.filter(op => op.status === 'waiting')
  if (waiting.length === 0) return []
  return [
    {
      property: 'P8',
      signature: 'P8-T1-unanswered',
      detail: `${waiting.map(op => op.name).join(', ')} waiting with no port call pending and no bound left`,
    },
  ]
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
