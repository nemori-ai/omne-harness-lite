import type {
  DispatchId,
  DurableEvidence,
  ModelFault,
  RetryPosition,
  Supplier,
  Termination,
} from '@omne-harness/model-contract'
import type { RecoveryRecord } from '@omne-harness/model-contract/provider'

export type AfterDispatch =
  | Readonly<{ kind: 'settle'; termination: Termination }>
  | Readonly<{ kind: 'position'; dispatch: DispatchId }>
  | Readonly<{ kind: 'ask-policy'; position: RetryPosition; failure: ModelFault }>
  | Readonly<{ kind: 'wait'; until: string }>
  | Readonly<{ kind: 'redispatch'; supplier: Supplier; decision: DurableEvidence }>

type RetryRecord = Pick<RecoveryRecord, 'state' | 'retry' | 'retryPosition' | 'retrySource'>
type Failed = Extract<Termination, { kind: 'failed' }>

export function afterDispatch(
  input: Readonly<{ recovery: RetryRecord; termination: Termination; now: string }>,
): AfterDispatch {
  const { recovery, termination, now } = input
  if (recovery.state.phase === 'settled' || termination.kind !== 'failed')
    return { kind: 'settle', termination }
  if (recovery.retry?.kind === 'stop')
    return { kind: 'settle', termination: { kind: 'failed', fault: recovery.retry.fault } }
  if (recovery.state.control.kind !== 'none') return { kind: 'settle', termination }
  return decidedDispatch(recovery, now) ?? undecided(recovery, termination)
}

function decidedDispatch(recovery: RetryRecord, now: string): AfterDispatch | null {
  const { retry } = recovery
  const decision = recovery.retrySource ?? null
  if (retry === null || retry.kind === 'stop' || decision === null) return null
  // The resend after a refusal of reasoning state goes out at once.
  if (retry.kind === 'resend-without-replay')
    return { kind: 'redispatch', supplier: retry.supplier, decision }
  return Date.parse(now) < Date.parse(retry.notBefore)
    ? { kind: 'wait', until: retry.notBefore }
    : { kind: 'redispatch', supplier: retry.supplier, decision }
}

function undecided(recovery: RetryRecord, termination: Failed): AfterDispatch {
  const { state, retryPosition } = recovery
  if (retryPosition !== null)
    return { kind: 'ask-policy', position: retryPosition, failure: termination.fault }
  if (state.phase === 'running' && state.firstContent === 'none-proven')
    return { kind: 'position', dispatch: state.dispatch }
  return { kind: 'settle', termination }
}
