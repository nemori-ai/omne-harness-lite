import type {
  AccountId,
  OrganizationId,
  TenantId,
  TenantRole,
  LoginStateId,
} from '@omne-harness-lite/identity-values'
import type { AccountParticipation, LoginParticipation } from '@omne-harness-lite/account-identity'
import type { Instant, SettledState } from '@omne-harness-lite/offer-expiry'
import type { InvitationId, AffiliationRequestId } from '@omne-harness-lite/organization-governance'
// Raw records remain undecoded until the original policy observation.
type EpochColumn = number | string | bigint

export interface OrganizationTable {
  organization_id: string
  kind: string
  name: string | null
  parent: string | null
  owner_account: string | null
  created_at: EpochColumn
}
export interface MembershipTable {
  organization_id: string
  account_id: string
  effective: number
  role: string
}
export interface InvitationTable {
  invitation_id: string
  issuer_organization: string
  invited_account: string
  role: string
  issued_at: EpochColumn
  expires_at: EpochColumn
  settled: string | null
}
export interface AffiliationRequestTable {
  affiliation_request_id: string
  initiator: string
  recipient: string
  direction: string
  issued_at: EpochColumn
  expires_at: EpochColumn
  settled: string | null
}
export interface CurrentTenantSelectionTable {
  login_state_id: string
  organization_id: string
  account_id: string
}
export interface TeamCreationKeyTable {
  creator_account: string
  creation_key: string
  organization_id: string
  registered_at: EpochColumn
}

export const OG_TABLES = {
  organization: 'organization',
  membership: 'membership',
  invitation: 'invitation',
  affiliationRequest: 'affiliation_request',
  currentTenantSelection: 'current_tenant_selection',
  teamCreationKey: 'team_creation_key',
} as const

type OrganizationRow = Pick<
  OrganizationTable,
  'organization_id' | 'kind' | 'parent' | 'owner_account' | 'name'
>
export interface OrgRead {
  organization(id: OrganizationId): Promise<OrganizationRow | undefined>
  ownedOrganization(account: AccountId): Promise<OrganizationRow | undefined>
  membership(tenant: TenantId): Promise<MembershipTable | undefined>
  superAdministratorCount(org: OrganizationId): Promise<number | string | bigint>
  organizationIdsPresent(ids: readonly OrganizationId[]): Promise<readonly string[]>
  invitation(id: InvitationId): Promise<InvitationTable | undefined>
  affiliation(id: AffiliationRequestId): Promise<AffiliationRequestTable | undefined>
  invitationsForAccount(account: AccountId): Promise<readonly InvitationTable[]>
  invitationsForIssuer(org: OrganizationId): Promise<readonly InvitationTable[]>
  affiliationsFrom(org: OrganizationId): Promise<readonly AffiliationRequestTable[]>
  affiliationsTo(org: OrganizationId): Promise<readonly AffiliationRequestTable[]>
  creationKey(
    creator: AccountId,
    key: string,
  ): Promise<Pick<TeamCreationKeyTable, 'organization_id' | 'registered_at'> | undefined>
  currentSelection(
    login: LoginStateId,
  ): Promise<Pick<CurrentTenantSelectionTable, 'organization_id' | 'account_id'> | undefined>
  effectiveMemberships(account: AccountId): Promise<readonly MembershipTable[]>
  organizationMemberships(
    org: OrganizationId,
    includeIneffective: boolean,
  ): Promise<readonly MembershipTable[]>
  selectionBatch(after: string | undefined, batch: number): Promise<readonly string[]>
}
export interface OrgWrite extends OrgRead {
  lockOrganization(org: OrganizationId): Promise<void>
  lockInvitation(id: InvitationId): Promise<void>
  lockAffiliation(id: AffiliationRequestId): Promise<void>
  lockCreationKey(creator: AccountId, key: string): Promise<void>
  lockAffiliationGraph(): Promise<void>
  insertOrganization(row: OrganizationTable): Promise<void>
  insertMembership(row: MembershipTable): Promise<void>
  insertInvitation(row: InvitationTable): Promise<void>
  insertAffiliation(row: AffiliationRequestTable): Promise<void>
  insertCreationKey(row: TeamCreationKeyTable): Promise<void>
  replaceCreationKey(
    creator: AccountId,
    key: string,
    organization: OrganizationId,
    registeredAt: Instant,
  ): Promise<void>
  setParent(child: OrganizationId, parent: OrganizationId | null): Promise<void>
  setMembershipRole(tenant: TenantId, role: TenantRole): Promise<void>
  deactivateMembership(tenant: TenantId): Promise<void>
  establishMembership(tenant: TenantId, role: TenantRole): Promise<void>
  settleInvitation(id: InvitationId, settled: SettledState): Promise<void>
  settleAffiliation(id: AffiliationRequestId, settled: SettledState): Promise<void>
  setCurrentSelection(login: LoginStateId, tenant: TenantId): Promise<void>
  deleteCurrentSelection(login: LoginStateId): Promise<void>
  deleteOrganizationMemberships(org: OrganizationId): Promise<void>
  deleteOrganization(org: OrganizationId): Promise<void>
}
export interface OrgParticipants {
  readonly accounts: AccountParticipation
  readonly logins: LoginParticipation
}
export interface OrgDataUnit {
  run<T>(work: (faces: OrgParticipants) => Promise<T>): Promise<T>
  query<T>(work: (data: OrgRead) => Promise<T>): Promise<T>
  mutate<T>(work: (data: OrgWrite) => Promise<T>): Promise<T>
  afterCommit(work: () => void): void
}
export interface OrgPersistence {
  read<T>(work: (data: OrgRead) => Promise<T>): Promise<T>
  atomic<T>(work: (unit: OrgDataUnit) => Promise<T>): Promise<T>
}
