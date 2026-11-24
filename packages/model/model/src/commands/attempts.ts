import type {
  DispatchId,
  DispatchProgress,
  DispatchRecord,
  DurableEvidence,
  ModelOperationId,
  RetryDecision,
  RetryPosition,
  Supplier,
} from '@omne-harness/model-contract'
import type { FixedRequestHead } from '@omne-harness/model-contract/provider'
import { NO_INSTANTS } from './instants.ts'
import type { CallDocument, DispatchDocument } from './types.ts'

export function initialAttempts(
  request: Pick<FixedRequestHead, 'fallback' | 'suppliers'>,
): DispatchProgress {
  const allowed = request.fallback ? request.suppliers.length : 2
  return { allowed, made: 0, last: null, notBefore: null }
}
function progress(call: CallDocument, change: Partial<DispatchProgress>): void {
  if (call.state.attempts === undefined) return
  call.state = { ...call.state, attempts: { ...call.state.attempts, ...change } }
}
export const sentWithoutReplay = (call: CallDocument): boolean =>
  call.dispatches.some(d => d.record.withoutReplay !== undefined)
/** How the next dispatch treats reasoning state: the resend and every dispatch after it carry none. */
export function withoutReplayOf(call: CallDocument): DispatchRecord['withoutReplay'] {
  if (call.retry?.kind === 'resend-without-replay') return 'resend'
  return sentWithoutReplay(call) ? 'later' : undefined
}
/** The next dispatch of the call starts: its record, a cleared retry record, the running state. */
export function beginDispatch(
  call: CallDocument,
  input: Readonly<{ dispatch: DispatchId; supplier: Supplier; operation: ModelOperationId }>,
  messages: NonNullable<DispatchRecord['messages']>,
  prepared: string | null,
): void {
  const withoutReplay = withoutReplayOf(call)
  call.dispatches.push({
    record: {
      dispatch: input.dispatch,
      supplier: structuredClone(input.supplier),
      intent: input.operation,
      send: 'prepared',
      firstContent: 'none-proven',
      terminal: null,
      account: null,
      materialization: null,
      messages: [...messages],
      ...(withoutReplay === undefined ? {} : { withoutReplay }),
      instants: { ...NO_INSTANTS, prepared },
      connectRetries: [],
    },
    logicalTerminal: null,
    windows: new Map(),
    events: new Map(),
    assembly: null,
    blocks: [],
    nextSeq: new Map(),
    trims: new Map(),
    hadContent: new Set(),
    diagnostics: [],
  })
  beginAttempt(call)
  call.state = {
    ...call.state,
    phase: 'running',
    dispatch: input.dispatch,
    firstContent: 'none-proven',
  }
}
export function beginAttempt(call: CallDocument): void {
  call.retry = null
  call.retryPosition = null
  call.retrySource = null
  progress(call, { made: call.dispatches.length, notBefore: null })
}
export function positionRetry(
  call: CallDocument,
  dispatch: DispatchDocument,
  position: RetryPosition,
): void {
  call.retryPosition = position
  call.retry = null
  const terminal = dispatch.logicalTerminal
  if (terminal?.kind === 'failed') progress(call, { last: structuredClone(terminal.fault) })
}
export function recordRetryDecision(
  call: CallDocument,
  decision: RetryDecision,
  source: DurableEvidence,
): void {
  call.retry = structuredClone(decision)
  call.retrySource = structuredClone(source)
  progress(call, { notBefore: decision.kind === 'retry' ? decision.notBefore : null })
}
