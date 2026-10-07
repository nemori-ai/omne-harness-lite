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
  readonly registered: boolean
  readonly released: boolean
  readonly copyReleased: boolean
}

/** Original capabilities borrowed by the trusted recovery owner, never a business caller. */
export interface ModelRuntimeCapturedExecution extends ModelRuntimeExecutionObservation {
  readonly invocation?: AnchoredInvocationHandle
}

export interface ModelRuntimeExecutionCapture {
  readonly executions: readonly ModelRuntimeCapturedExecution[]
  /** Drop the owner's escaped handles first. Repeated release has no effect. */
  readonly release: () => void
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
  readonly capture: (
    session: SessionRef,
  ) => { readonly capture: ModelRuntimeExecutionCapture } | { readonly unavailable: true }
  /** Requires confirmed overall close and every capture's release. */
  readonly release: () => RuntimeCloseResult
}
