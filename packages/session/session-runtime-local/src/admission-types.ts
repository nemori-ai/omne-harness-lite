import type { AccountId, LoginStateId, TenantId } from '@omne-harness-lite/identity-values'
import type { GovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'

export interface AdmissionSource {
  readonly centerId: GovernanceCenterId
  readonly accountId: AccountId
  readonly loginStateHandle: LoginStateId
}
export interface AdmissionTarget {
  readonly tenant: TenantId
  readonly session: string | null
  readonly purpose: 'createSession' | 'startRun'
  readonly operationKey: string
  readonly inputPosition: string | null
}
/** A durable coordinate. This value alone grants no permission. */
export interface AdmissionTicket {
  readonly root: string
  readonly id: string
  readonly sequence: string
  readonly source: AdmissionSource
  readonly target: AdmissionTarget
}
export type AdmissionState =
  | 'waiting'
  | 'querying'
  | 'ready'
  | 'consumed'
  | 'rejected'
  | 'memberRejected'
  | 'unavailable'
  | 'notUsed'
export interface AdmissionReading {
  readonly ticket: AdmissionTicket
  readonly state: AdmissionState
}
export interface AdmissionPolicy {
  readonly maxLogins: number
  readonly maxTickets: number
  readonly maxRecordBytes: number
}
/** Trusted construction port. A returned decision proves this owned query has actually ended. */
export interface AdmissionProbe {
  readonly verify: (
    source: AdmissionSource,
    target: AdmissionTarget,
  ) => Promise<{
    readonly kind: 'valid' | 'memberValid' | 'memberRejected' | 'rejected' | 'unavailable'
  }>
}
declare const guardBrand: unique symbol
/** Private live callback reference. Never serialize this reference. */
export interface AdmissionGuard {
  readonly [guardBrand]: true
}
export type AdmissionConsumption =
  | { readonly kind: 'consumed'; readonly receipt: string }
  | { readonly kind: 'unknownCommit'; readonly ticket: AdmissionTicket }
  | { readonly kind: 'blocked'; readonly state: AdmissionState }
export interface LocalAdmission {
  readonly reserve: (source: AdmissionSource, target: AdmissionTarget) => Promise<AdmissionReading>
  readonly read: (ticket: AdmissionTicket) => Promise<AdmissionReading>
  readonly query: (ticket: AdmissionTicket) => Promise<AdmissionReading>
  /** No external IO in callback. The receipt and exact ticket usage commit in the tenant unit. */
  readonly consume: (
    ticket: AdmissionTicket,
    tenantStorage: AtomicStorage,
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<string>,
  ) => Promise<AdmissionConsumption>
  /** Requires actual tenant quiescence under the root order. A timeout or one absent read is insufficient. */
  readonly abandon: (
    ticket: AdmissionTicket,
    tenantStorage: AtomicStorage,
  ) => Promise<AdmissionConsumption | { readonly kind: 'notUsed' }>
  readonly withCurrent: <T>(
    source: AdmissionSource,
    tenant: TenantId,
    tenantStorage: AtomicStorage,
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<T>,
  ) => Promise<T>
  /** Current member visibility without requiring a fresh login query. Internal original Run work uses its own grant. */
  readonly withMember: <T>(
    source: AdmissionSource,
    tenant: TenantId,
    tenantStorage: AtomicStorage,
    stage: (unit: StorageUnit, guard: AdmissionGuard) => Promise<T>,
  ) => Promise<T>
  readonly authorizeIn: (
    unit: StorageUnit,
    guard: AdmissionGuard,
    source: AdmissionSource,
    tenant: TenantId,
  ) => boolean
  /** Borrowed storage and probe remain open. Unsettled owned query results retain responsibility. */
  readonly close: () => Promise<void>
}
export class AdmissionFailure extends Error {
  constructor(
    readonly reason:
      'invalid-input' | 'invalid-record' | 'capacity' | 'denied' | 'closed' | 'pending-result',
  ) {
    super(`local admission: ${reason}`)
    this.name = 'AdmissionFailure'
  }
}
