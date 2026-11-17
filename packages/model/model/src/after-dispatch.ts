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
  | Readonly<{ kind: 'ended' }>
  | Readonly<{ kind: 'settle'; termination: Termination }>
  | Readonly<{ kind: 'position'; dispatch: DispatchId }>
  | Readonly<{ kind: 'ask-policy'; position: RetryPosition; failure: ModelFault }>
  | Readonly<{ kind: 'wait'; until: string }>
  | Readonly<{ kind: 'redispatch'; supplier: Supplier; decision: DurableEvidence }>

export function afterDispatch(
  input: Readonly<{
    recovery: Pick<RecoveryRecord, 'state' | 'retry' | 'retryPosition' | 'retrySource'>
    termination: Termination
    now: string
  }>,
): AfterDispatch {
  const { state, retry, retryPosition } = input.recovery
  const retrySource = input.recovery.retrySource ?? null
  const settle = { kind: 'settle', termination: input.termination } as const
  if (state.phase === 'settled') return { kind: 'ended' }
  if (input.termination.kind !== 'failed') return settle
  if (retry?.kind === 'stop')
    return { kind: 'settle', termination: { kind: 'failed', fault: retry.fault } }
  if (state.control.kind !== 'none') return settle
  if (retry?.kind === 'retry' && retrySource !== null)
    return Date.parse(input.now) < Date.parse(retry.notBefore)
      ? { kind: 'wait', until: retry.notBefore }
      : { kind: 'redispatch', supplier: retry.supplier, decision: retrySource }
  if (retryPosition !== null)
    return { kind: 'ask-policy', position: retryPosition, failure: input.termination.fault }
  if (state.phase === 'running' && state.firstContent === 'none-proven')
    return { kind: 'position', dispatch: state.dispatch }
  return settle
}
