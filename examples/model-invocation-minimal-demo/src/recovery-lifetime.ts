import type { SessionRef } from '@omne-harness-lite/messages'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type {
  AnchoredInvocationHandle,
  ModelLogSettlementTarget,
  ModelRuntimeExecutionCapture,
  ModelRuntimeExecutionSource,
  RuntimeRecoveryScope,
  SessionRuntimeBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { createRequestOwner } from './model-request-owner.ts'

/** One actual preparation row. Scope issuance transfers this same row, not a copy. */
export interface DemoRecoveryReady {
  readonly binding: Pick<SessionRuntimeBinding, 'log'>
  readonly owner: ReturnType<typeof createRequestOwner>
  readonly captures: readonly ModelRuntimeExecutionCapture[]
  readonly originals: Map<
    string,
    {
      readonly target: ModelLogSettlementTarget
      readonly handle: AnchoredInvocationHandle
    }
  >
  readonly coldTargets: ReadonlyMap<string, ModelLogSettlementTarget>
  readonly coldAbsent: boolean
  scopeIssued: boolean
}

interface RecoveryLifetimeInputs {
  readonly executions: () => ModelRuntimeExecutionSource | undefined
  readonly readyRows: Map<SessionRef, DemoRecoveryReady>
  readonly admission: Set<SessionRef>
  readonly coldStopped: Map<SessionRef, ReadonlyMap<string, ModelLogSettlementTarget>>
  readonly onClosed: () => void
}

/** Only the original host's unissued preparation may be discarded here. */
export function discardUnissuedRecovery(
  session: SessionRef,
  rows: Map<SessionRef, DemoRecoveryReady>,
): void {
  const ready = rows.get(session)
  if (ready === undefined || ready.scopeIssued) return
  ready.originals.clear()
  for (const capture of ready.captures) capture.release()
  rows.delete(session)
}

/** Called after the host validates current admission, binding and actual writer ownership. */
export function createDemoRecoveryScope(
  session: SessionRef,
  ready: DemoRecoveryReady,
  inputs: RecoveryLifetimeInputs,
): { readonly scope: RuntimeRecoveryScope } {
  let closed = false
  const entered: { readonly scope: RuntimeRecoveryScope } = {
    scope: {
      binding: ready.binding,
      owner: ready.owner.owner,
      originalInvocation(key, target) {
        if (closed) return { unavailable: true } as const
        if (key.session !== session || key.callId !== target.call) return { unavailable: true }
        const original = ready.originals.get(key.callId)
        if (original !== undefined) {
          if (
            original.target.response !== target.response ||
            !modelLogJsonEqual(original.target.dispatch, target.dispatch)
          )
            return { unavailable: true }
          return { original: original.handle }
        }
        const cold = ready.coldTargets.get(key.callId)
        if (
          !ready.coldAbsent ||
          cold === undefined ||
          cold.response !== target.response ||
          !modelLogJsonEqual(cold.dispatch, target.dispatch) ||
          inputs
            .executions()
            ?.snapshot(key.session)
            .some(record => record.key.callId === key.callId)
        )
          return { unavailable: true }
        return { absent: true }
      },
      async close() {
        if (closed) return
        await ready.owner.drain()
        if (
          ready.owner.retained() ||
          ready.owner.owner.unresolvedWrites().length !== 0 ||
          ready.binding.log.currentGeneration() !== ready.binding.log.generation
        )
          throw new Error('recovery owner retained')
        closed = true
        ready.originals.clear()
        for (const capture of ready.captures) capture.release()
        inputs.readyRows.delete(session)
        inputs.admission.delete(session)
        // Every unresolved dispatch of the covered cold worker is now settled.
        if (inputs.coldStopped.has(session)) inputs.coldStopped.set(session, new Map())
        inputs.onClosed()
      },
    },
  }
  // No external callback or await after the actual scope ownership transfer.
  ready.scopeIssued = true
  return entered
}
