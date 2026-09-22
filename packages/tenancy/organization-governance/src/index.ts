// capability.organization-governance v1 的服务面类型。契约：.meta_harness/design/spec/capabilities/organization-governance/v1/contract.md；
// 节点设计：.meta_harness/design/realization/packages/tenancy/organization-governance/design.md。
// 失败字面**逐字对契约**（camelCase），每个方法的失败集合恰为契约 ⑥ 所列，无兜底值；tests/types.spec-d.ts 逐条守。
// 输入一律 `unknown`：表示层解析在方法体内做，不合格 ⇒ `invalidInput`（S-16 第三类）。
// 第一程只定形状；插件与实现在第二程。服务名、方法名、方向枚举的取名一律候选。
import type {
  AccountId,
  ChainResult,
  MembershipStandingResult,
  OpaqueIdentifier,
  OrganizationId,
  OrganizationKind,
  ScopeLayerIdentity,
  ShareAncestorResult,
  TenantId,
  TenantRole,
} from '@omne-harness-lite/identity-values'
import type { Duration, OfferState, OfferTiming } from '@omne-harness-lite/offer-expiry'
import type { HandoffWarrant } from '@omne-harness-lite/identity-values'
import type { Ack, Outcome } from '@omne-harness-lite/kernel-basis'

// ---- 本契约拥有的标识与记录形状（S-5、S-8、S-10、S-11） ----
export type InvitationId = OpaqueIdentifier<'InvitationId'>
export type AffiliationRequestId = OpaqueIdentifier<'AffiliationRequestId'>

/** 隶属请求的方向（S-30 ①：请对方作上级 / 请对方作下级）。 */
export const AFFILIATION_DIRECTIONS = ['recipientAsParent', 'recipientAsChild'] as const
export type AffiliationDirection = (typeof AFFILIATION_DIRECTIONS)[number]

export interface OrganizationReading {
  readonly id: OrganizationId
  readonly kind: OrganizationKind
  readonly parent: OrganizationId | null
}

/** S-55 ⑤：邀请的读面形状，派生状态按本次读取时点求出。 */
export interface InvitationReading {
  readonly id: InvitationId
  readonly issuer: OrganizationId
  readonly invitedAccount: AccountId
  readonly role: TenantRole
  readonly timing: OfferTiming
  readonly state: OfferState
}

/** S-56 ⑤：隶属请求的读面形状。 */
export interface AffiliationRequestReading {
  readonly id: AffiliationRequestId
  readonly initiator: OrganizationId
  readonly recipient: OrganizationId
  readonly direction: AffiliationDirection
  readonly timing: OfferTiming
  readonly state: OfferState
}

/** S-59 ⑤：成员关系记录恰三样。 */
export interface MembershipReading {
  readonly tenant: TenantId
  readonly role: TenantRole
  readonly effective: boolean
}

/** S-55 ①：调用方身份，判别式集合封闭。 */
export type OfferReader =
  | { readonly kind: 'account'; readonly accountId: AccountId }
  | { readonly kind: 'tenant'; readonly tenantId: TenantId }

// ---- organizations（S-20／S-21／S-22／S-33／S-34／S-35） ----
export type CreatePersonalFailure =
  'accountDoesNotExist' | 'accountRecordExpired' | 'invalidInput' | 'unavailable'
export type CreateTeamFailure =
  'accountNotActivated' | 'accountDoesNotExist' | 'invalidInput' | 'unavailable'
export type ReadOrganizationFailure = 'organizationDoesNotExist' | 'invalidInput' | 'unavailable'
export type DissolveAffiliationFailure =
  'noSuchAffiliation' | 'notAuthorized' | 'invalidInput' | 'unavailable'
export type AncestorChainFailure = 'organizationDoesNotExist' | 'invalidInput' | 'unavailable'
export type ScopeLayersFailure = 'invalidInput'

export interface CreatedOrganization {
  readonly organization: OrganizationId
  readonly tenant: TenantId
}

export interface OrganizationsService {
  /** 幂等边界 AccountId；幂等那一路仍过 ② 两条判定。 */
  createPersonal(accountId: unknown): Promise<Outcome<CreatedOrganization, CreatePersonalFailure>>
  /** 幂等边界 (创建者, 创建键)；不带键不幂等。 */
  createTeam(
    creatorAccountId: unknown,
    creationKey?: unknown,
  ): Promise<Outcome<CreatedOrganization, CreateTeamFailure>>
  read(organizationId: unknown): Promise<Outcome<OrganizationReading, ReadOrganizationFailure>>
  dissolveAffiliation(
    initiatorTenant: unknown,
    childOrganization: unknown,
  ): Promise<Ack<DissolveAffiliationFailure>>
  /** 链不含自己；任一行读不到 ⇒ `unavailable`，不返回截断链。 */
  ancestorChain(organizationId: unknown): Promise<Outcome<ChainResult, AncestorChainFailure>>
  /** 含自己；调 identity-values 的纯函数，不从返回的链求交。 */
  shareAncestor(a: unknown, b: unknown): Promise<Outcome<ShareAncestorResult, AncestorChainFailure>>
  /** 纯计算，不读存储，失败集合只有 `invalidInput`；会话级那一格不在返回值里（G-1）。 */
  scopeLayers(
    tenantId: unknown,
  ): Outcome<
    { readonly organization: ScopeLayerIdentity; readonly tenant: ScopeLayerIdentity },
    ScopeLayersFailure
  >
}

// ---- offers（S-23／S-24／S-25／S-30／S-31／S-32、读面 S-55～S-58、S-60） ----
export type IssueInvitationFailure =
  | 'issuerIsPersonalOrganization'
  | 'notAuthorized'
  | 'accountNotActivated'
  | 'accountDoesNotExist'
  | 'alreadyAnEffectiveMember'
  | 'invalidOfferDuration'
  | 'invalidInput'
  | 'unavailable'
export type WithdrawInvitationFailure =
  'invitationDoesNotExist' | 'notAuthorized' | 'alreadyConcluded' | 'invalidInput' | 'unavailable'
export type AcceptInvitationFailure =
  | 'invitationDoesNotExist'
  | 'offerNoLongerValid'
  | 'notTheInvitedAccount'
  | 'accountNotActivated'
  | 'accountDoesNotExist'
  | 'alreadyAnEffectiveMember'
  | 'invalidInput'
  | 'unavailable'
export type IssueAffiliationRequestFailure =
  | 'personalOrganizationTakesNoPartInAffiliation'
  | 'notAuthorized'
  | 'organizationDoesNotExist'
  | 'wouldFormACycle'
  | 'invalidOfferDuration'
  | 'invalidInput'
  | 'unavailable'
export type WithdrawAffiliationRequestFailure =
  | 'affiliationRequestDoesNotExist'
  | 'notAuthorized'
  | 'alreadyConcluded'
  | 'invalidInput'
  | 'unavailable'
export type AcceptAffiliationRequestFailure =
  | 'affiliationRequestDoesNotExist'
  | 'offerNoLongerValid'
  | 'notAuthorized'
  | 'alreadyHasAParentOrganization'
  | 'wouldFormACycle'
  | 'personalOrganizationTakesNoPartInAffiliation'
  | 'invalidInput'
  | 'unavailable'
export type ReadInvitationFailure = 'invitationDoesNotExist' | 'invalidInput' | 'unavailable'
export type ReadAffiliationRequestFailure =
  'affiliationRequestDoesNotExist' | 'invalidInput' | 'unavailable'
export type ListReceivedInvitationsFailure = 'invalidInput' | 'unavailable'
export type ListIssuedFailure = 'notAuthorized' | 'invalidInput' | 'unavailable'
export type ListReceivedAffiliationRequestsFailure =
  'notAuthorized' | 'invalidInput' | 'unavailable'

export interface IssuedOffers {
  readonly invitations: readonly InvitationReading[]
  readonly affiliationRequests: readonly AffiliationRequestReading[]
}

export interface OffersService {
  issueInvitation(
    issuerTenant: unknown,
    targetAccount: unknown,
    role?: unknown,
    ttl?: unknown,
  ): Promise<Outcome<InvitationId, IssueInvitationFailure>>
  /** 不属发起者组织 ⇒ 同一个 `invitationDoesNotExist`；已过期不写终结记录 ⇒ `alreadyConcluded`。 */
  withdrawInvitation(
    issuerTenant: unknown,
    invitationId: unknown,
  ): Promise<Ack<WithdrawInvitationFailure>>
  /** 三种来路同收 `offerNoLongerValid`；再加入是同一条成员记录、同一个 TenantId（S-39）。 */
  acceptInvitation(
    accountId: unknown,
    invitationId: unknown,
  ): Promise<Outcome<TenantId, AcceptInvitationFailure>>
  /** 指向自己在此判 `wouldFormACycle`（不读存储）；不发事件。 */
  issueAffiliationRequest(
    initiatorTenant: unknown,
    recipientOrganization: unknown,
    direction: unknown,
    ttl?: unknown,
  ): Promise<Outcome<AffiliationRequestId, IssueAffiliationRequestFailure>>
  withdrawAffiliationRequest(
    initiatorTenant: unknown,
    requestId: unknown,
  ): Promise<Ack<WithdrawAffiliationRequestFailure>>
  /** 部署级序列化（R-3b）；判环两半：`child === newParent ∨ child ∈ ancestorChain(newParent)`，链上任一行读不到 ⇒ `unavailable`。 */
  acceptAffiliationRequest(
    acceptorTenant: unknown,
    requestId: unknown,
  ): Promise<Ack<AcceptAffiliationRequestFailure>>
  readInvitation(
    caller: OfferReader,
    invitationId: unknown,
  ): Promise<Outcome<InvitationReading, ReadInvitationFailure>>
  readAffiliationRequest(
    callerTenant: unknown,
    requestId: unknown,
  ): Promise<Outcome<AffiliationRequestReading, ReadAffiliationRequestFailure>>
  /** 任一输入 `unavailable` ⇒ 整个调用 `unavailable`，不返回残缺列表；默认只含 `pending`。 */
  listReceivedInvitations(
    accountId: unknown,
    includeSettled?: unknown,
  ): Promise<Outcome<readonly InvitationReading[], ListReceivedInvitationsFailure>>
  listIssued(
    tenantId: unknown,
    includeSettled?: unknown,
  ): Promise<Outcome<IssuedOffers, ListIssuedFailure>>
  listReceivedAffiliationRequests(
    tenantId: unknown,
    includeSettled?: unknown,
  ): Promise<Outcome<readonly AffiliationRequestReading[], ListReceivedAffiliationRequestsFailure>>
}

// ---- memberships（S-26／S-27／S-28／S-29／S-36／S-37／S-59、S-14 ⑤ 清扫） ----
export type StandingFailure = 'invalidInput'
export type MineFailure = 'unavailable' | 'invalidInput'
export type ChangeRoleFailure =
  | 'notAuthorized'
  | 'membershipNotEffective'
  | 'wouldLeaveNoSuperAdministrator'
  | 'invalidInput'
  | 'unavailable'
export type RemoveMemberFailure =
  | 'personalOrganizationMemberCannotLeave'
  | 'notAuthorized'
  | 'membershipNotEffective'
  | 'wouldLeaveNoSuperAdministrator'
  | 'invalidInput'
  | 'unavailable'
export type CurrentTenantFailure = 'loginStateNotValid' | 'invalidInput' | 'unavailable'
export type SwitchCurrentTenantFailure =
  'loginStateNotValid' | 'notOwnTenant' | 'membershipNotEffective' | 'invalidInput' | 'unavailable'
export type ListMembersFailure = 'notAuthorized' | 'invalidInput' | 'unavailable'

export interface MembershipsService {
  /** 返回值是闭合和：`MembershipStandingResult`（含 `failure: 'unavailable'` 支）或表示层的 `invalidInput`；不抛异常，每次现读。 */
  standing(
    tenantId: unknown,
  ): Promise<MembershipStandingResult | { readonly failure: StandingFailure }>
  /** 读失败 ⇒ `unavailable`，空数组只在查询成功时返回。 */
  mine(accountId: unknown): Promise<Outcome<readonly TenantId[], MineFailure>>
  changeRole(
    initiatorTenant: unknown,
    targetTenant: unknown,
    role: unknown,
  ): Promise<Ack<ChangeRoleFailure>>
  remove(initiatorTenant: unknown, targetTenant: unknown): Promise<Ack<RemoveMemberFailure>>
  /** 无选择记录时以个人组织为初值；读失败 ⇒ `unavailable`，不填初值。返回的 TenantId 不承诺此刻有效。 */
  currentTenant(loginStateId: unknown): Promise<Outcome<TenantId, CurrentTenantFailure>>
  switchCurrentTenant(
    loginStateId: unknown,
    tenantId: unknown,
  ): Promise<Ack<SwitchCurrentTenantFailure>>
  /** 两档授权分开判；被拒 `notAuthorized` 不降级为默认档。 */
  list(
    tenantId: unknown,
    includeIneffective?: unknown,
  ): Promise<Outcome<readonly MembershipReading[], ListMembersFailure>>
  /** S-14 ⑤ 卫生工作：无可观察结果、不进失败集合；触发与节奏归装配（G-13）。 */
  sweepStaleSelections(batch: number): Promise<void>
}

// ---- organization-purge（S-53，单独服务名，只给清除链） ----
export type PurgePersonalOrganizationFailure =
  | 'organizationIsNotPersonal'
  | 'accountIsActivated'
  | 'accountNotExpired'
  | 'accountDoesNotExist'
  | 'invalidInput'
  | 'unavailable'

export interface OrganizationPurgeService {
  /** `ok` 路径（含两路幂等）都返回绑定该 AccountId 的清除依据；失败路径不删不签。 */
  purgePersonalOrganization(
    accountId: unknown,
  ): Promise<Outcome<{ readonly warrant: HandoffWarrant }, PurgePersonalOrganizationFailure>>
}

// ---- 政策参数与事件（S-40／S-41） ----
export interface OrganizationGovernanceConfig {
  /** 邀请这一类的默认有效时长（加载时经 `parseOfferTtl` 校验，非正 ⇒ 启动失败）。 */
  readonly invitationTtlDefault: Duration
  /** 隶属请求这一类的默认有效时长，与邀请不共用取值。 */
  readonly affiliationRequestTtlDefault: Duration
  /** 团队创建键的保留期（S-21 ⑦）。 */
  readonly teamCreationKeyRetention: Duration
  /** 清除依据的签名私钥（PEM PKCS8）；缺或形状不对 ⇒ 启动失败。 */
  readonly purgeSigningKeyPem: string
}

/** 五个通知事件：提交后 `ctx.emit`；不开控制事件、不开扩展点（S-41）。 */
export interface OrganizationGovernanceEvents {
  'invitation.issued'(payload: {
    readonly invitationId: InvitationId
    readonly issuer: OrganizationId
    readonly invitedAccount: AccountId
  }): void
  'membership.changed'(payload: { readonly tenant: TenantId; readonly effective: boolean }): void
  'role.changed'(payload: { readonly tenant: TenantId; readonly role: TenantRole }): void
  'affiliation.dissolved'(payload: {
    readonly child: OrganizationId
    readonly formerParent: OrganizationId
  }): void
  'organization.purged'(payload: {
    readonly organization: OrganizationId
    readonly ownerAccount: AccountId
  }): void
}

export const ORGANIZATIONS_SERVICE = 'organizations' as const
export const OFFERS_SERVICE = 'offers' as const
export const MEMBERSHIPS_SERVICE = 'memberships' as const
export const ORGANIZATION_PURGE_SERVICE = 'organization-purge' as const
