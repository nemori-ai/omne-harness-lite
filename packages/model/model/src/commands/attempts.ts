import type {
  DispatchProgress,
  DurableEvidence,
  RetryDecision,
  RetryPosition,
} from '@omne-harness/model-contract'
import type { FixedRequestHead } from '@omne-harness/model-contract/provider'
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
