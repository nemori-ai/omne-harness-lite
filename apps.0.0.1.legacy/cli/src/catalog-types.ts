import type { GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import type { CenterProfile } from './center-preparation.ts'
import type { RunLoginBinding } from './session-preparation.ts'
import type { TenantBinding } from './state-layout.ts'
import type { CreatedTenantPreparation } from './tenant-preparation.ts'

export interface CatalogPolicy {
  readonly maxCenters: number
  readonly maxCreations: number
  readonly maxRecordBytes: number
}
export interface CatalogSnapshot {
  readonly storeId: string
  readonly revision: number
  readonly operationId: string | null
  readonly selected: TenantBinding | null
}
export interface CapturedCreation {
  readonly login: RunLoginBinding
  readonly name: string
  readonly creationKey: string
}
export interface CreationRecord {
  readonly request: CapturedCreation
  /** A local execution claim, never proof that a remote request was sent. */
  readonly status: 'prepared' | 'submitted' | 'settled'
  readonly result: CreatedTenantPreparation | null
}
export type CreationExecutionOutcome =
  | { readonly kind: 'recorded'; readonly record: CreationRecord }
  | { readonly kind: 'existing'; readonly record: CreationRecord }
  | {
      readonly kind: 'unconfirmed'
      readonly creationKey: string
      readonly result: CreatedTenantPreparation | null
    }
export interface CliCatalog {
  readSelection(): Promise<CatalogSnapshot>
  selectTenant(
    expected: CatalogSnapshot,
    binding: TenantBinding,
    operationId: string,
  ): Promise<'selected' | 'conflict' | 'unconfirmed'>
  listCenters(): Promise<readonly CenterProfile[]>
  registerCenter(
    profile: CenterProfile,
  ): Promise<'saved' | 'already-saved' | 'conflict' | 'unconfirmed'>
  captureCreation(
    request: CapturedCreation,
  ): Promise<'captured' | 'already-captured' | 'conflict' | 'unconfirmed'>
  readCreation(request: CapturedCreation): Promise<CreationRecord | null>
  executeCreation(request: CapturedCreation, use: GovernanceUse): Promise<CreationExecutionOutcome>
  /** Stop admission and await complete creation work; borrowed Storage stays open. */
  close(): Promise<void>
}
export class CliCatalogFailure extends Error {
  override readonly name = 'CliCatalogFailure'
  constructor(
    readonly reason:
      | 'invalid-input'
      | 'invalid-record'
      | 'unsupported-format'
      | 'capacity'
      | 'closed'
      | 'pending-result',
  ) {
    super(`omne-catalog: ${reason}`)
  }
}
