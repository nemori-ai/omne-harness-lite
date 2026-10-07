import type { CallKey, SessionRef } from '@omne-harness-lite/messages'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import type { RuntimeCloseResult, SessionRuntimeBinding } from './service-types.ts'
import type { SettlementOwner } from './settlement-types.ts'

/** Privileged, process-local observation for the physical runtime's assembly owner. */
export interface ModelRuntimeExecutionObservation {
  readonly key: CallKey
  readonly session: SessionRuntimeBinding
  readonly owner: SettlementOwner
  readonly executionGeneration: object
  readonly invocation?: AnchoredInvocationHandle
  readonly registered: boolean
  readonly released: boolean
}

/**
 * Carries original internal capabilities. Do not expose it through business operations,
 * caller-supplied hosts, ordinary caller Contexts, or serializable configuration.
 */
export interface ModelRuntimeExecutionSource {
  readonly lookup: (
    ref: CallKey,
    executionGeneration?: object,
  ) => { readonly execution: ModelRuntimeExecutionObservation } | { readonly unknown: true }
  readonly snapshot: (session: SessionRef) => readonly ModelRuntimeExecutionObservation[]
  /** Requires confirmed overall close and the assembly owner's completed recovery work. */
  readonly release: () => RuntimeCloseResult
}
