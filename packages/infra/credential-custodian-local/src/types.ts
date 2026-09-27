import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { LoginStateId, TenantId } from '@omne-harness-lite/identity-values'
import type { Clock, Instant } from '@omne-harness-lite/offer-expiry'
import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'

export type CredentialBindingRead =
  | { readonly binding: { readonly credentialRef: CredentialRef; readonly boundAt: Instant } }
  | { readonly absent: true }
export type ReadCredentialBindingIn = (
  unit: StorageUnit,
  tenant: TenantId,
) => Promise<CredentialBindingRead>
export type BoundReplicaRead = { readonly body: Uint8Array } | { readonly absent: true }
export type ReadBoundReplicaIn = (
  unit: StorageUnit,
  tenant: TenantId,
  expectedRef: CredentialRef,
) => Promise<BoundReplicaRead>
export interface StoreBoundReplicaInput {
  readonly loginState: LoginStateId
  readonly tenant: TenantId
  readonly sourceRef: CredentialRef
  readonly body: Uint8Array
}
export type StoreBoundReplicaResult =
  | { readonly stored: true; readonly tenant: TenantId }
  | { readonly stored: false }
  | { readonly failure: 'invalidInput' | 'custodianWithdrawn' | 'unavailable' }
export interface ReplicaObservation {
  readonly operation: 'start' | 'store' | 'read' | 'close'
  readonly phase: 'key' | 'admission' | 'binding' | 'replica' | 'unit' | 'drain'
  readonly outcome:
    | 'ready'
    | 'accepted'
    | 'stored'
    | 'absent'
    | 'body'
    | 'withdrawn'
    | 'unavailable'
    | 'defect'
    | 'closed'
    | 'invalidInput'
    | 'unopenable'
  readonly tenant?: TenantId
  readonly sourceMatch?: boolean
}
/** Synchronous, value-free diagnostics; the assembly owns retention and correlation. */
export interface ReplicaDiagnostics {
  record(event: ReplicaObservation): void
  sinkFailure(): void
}
export interface ModelReplicaOptions {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly keyFile: string
  readonly readCredentialBindingIn: ReadCredentialBindingIn
  readonly diagnostics: ReplicaDiagnostics
}
export interface ModelReplicaCustodian {
  readonly storeBoundReplica: (input: StoreBoundReplicaInput) => Promise<StoreBoundReplicaResult>
  readonly readBoundReplicaIn: ReadBoundReplicaIn
  readonly close: () => Promise<void>
}
