import type { Access } from '@omne-harness/legal-identity'
import type { SettingsTarget } from '@omne-harness/settings'
import type {
  GovernanceAdoptionCommand,
  GovernanceBasis,
  GovernanceCatalogRequest,
  GovernanceContributionCommand,
  GovernanceContributionRef,
  GovernanceDefinitionBundle,
  GovernanceOperationQuery,
  GovernanceOperationRef,
  GovernanceWithdrawalCommand,
} from './schema.ts'

export type GovernanceFailure =
  | Readonly<{ kind: 'invalid-input'; field: string; reason: string }>
  | Readonly<{ kind: 'limited'; resource: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; owner: string }>
  | Readonly<{ kind: 'conflict'; reason: 'operation' | 'definition' | 'basis' | 'selection' }>
export type GovernanceUnknown = Readonly<{
  kind: 'unknown'
  operation: GovernanceOperationRef
}>
export type GovernanceRegistration = Readonly<{
  kind: 'registered'
  contribution: GovernanceContributionRef
  declarationRevision: number
  state: 'active' | 'closing' | 'released'
}>
export type GovernanceRelease = Readonly<{
  kind: 'released' | 'already-released'
  contribution: GovernanceContributionRef
  adoptionRevision: number
}>
export type GovernanceAdoption = Readonly<{ kind: 'adopted'; basis: GovernanceBasis }>
export type GovernanceContributionOutcome =
  | GovernanceRegistration
  | GovernanceFailure
  | GovernanceUnknown
export type GovernanceWithdrawalOutcome = GovernanceRelease | GovernanceFailure | GovernanceUnknown
export type GovernanceAdoptionOutcome = GovernanceAdoption | GovernanceFailure | GovernanceUnknown
export type GovernanceCommittedOperation =
  | Readonly<{ owner: 'contribute'; result: GovernanceRegistration }>
  | Readonly<{ owner: 'withdraw'; result: GovernanceRelease }>
  | Readonly<{ owner: 'adopt'; result: GovernanceAdoption }>
export type GovernanceOperationOutcome =
  | Readonly<{ kind: 'committed'; original: GovernanceCommittedOperation }>
  | Readonly<{ kind: 'not-committed'; operation: GovernanceOperationRef; sealRef: string }>
  | Readonly<{ kind: 'pending'; operation: GovernanceOperationRef }>
  | GovernanceUnknown
  | GovernanceFailure
export type GovernanceCatalogItem = Readonly<{
  declaration: GovernanceDefinitionBundle
  contributions: readonly Readonly<{
    contribution: GovernanceContributionRef
    state: 'active' | 'closing' | 'released'
  }>[]
  selectedTargets: readonly SettingsTarget[]
  availability: 'available' | 'unavailable'
}>
export type GovernanceCatalogPage = Readonly<{
  kind: 'page'
  items: readonly GovernanceCatalogItem[]
  snapshot: GovernanceBasis
  completeness: 'complete' | 'partial'
  unavailableOwners: readonly string[]
  nextCursor: string | null
}>
export interface GovernanceCommands<Registrar, Assembler> {
  contribute(
    access: Access<Registrar>,
    command: GovernanceContributionCommand,
  ): Promise<GovernanceContributionOutcome>
  withdraw(
    access: Access<Registrar>,
    command: GovernanceWithdrawalCommand,
  ): Promise<GovernanceWithdrawalOutcome>
  adopt(
    access: Access<Assembler>,
    command: GovernanceAdoptionCommand,
  ): Promise<GovernanceAdoptionOutcome>
}
export interface GovernanceQueries<Reader> {
  readCatalog(
    access: Access<Reader>,
    request: GovernanceCatalogRequest,
  ): Promise<GovernanceCatalogPage | GovernanceFailure>
  queryOperation(
    access: Access<Reader>,
    query: GovernanceOperationQuery,
  ): Promise<GovernanceOperationOutcome>
}
export interface GovernanceContributions<Registrar, Assembler, Reader>
  extends GovernanceCommands<Registrar, Assembler>, GovernanceQueries<Reader> {}
