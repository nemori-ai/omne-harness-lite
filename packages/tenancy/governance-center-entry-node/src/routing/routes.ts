// 封闭的路由表（入口契约 S-17～S-23；入口节点 design「路由到服务方法」）。
// 一个字面量数组，恰31条，键就是路由标识；每条写明：免不免认人、身份怎么推、补什么授权、调哪一个领域操作、
// 领域答复的形状、失败怎么映射（S-14 的共同映射 + 本条的例外）、成功返回怎样投影成 `Result_<路由>`。
// 没有按名字解析服务或方法的代码：每条的调用是一个写死的函数。
import type { PreparedCredentialChange } from '@omne-harness-lite/account-identity'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { Caller } from './caller.ts'
import type { RouteId } from '@omne-harness-lite/governance-center-entry'

import type { DecisionServices, AuthenticatedServices } from '../service-faces.ts'
import { record, list } from './value-shapes.ts'

/** 载荷已过 `Payload_<路由>`：成员封闭、形状合格。 */
export type Payload = Readonly<Record<string, unknown>>

export interface AuthenticatedInput {
  readonly payload: Payload
  readonly caller: Caller
  /** 推导所得 `TenantId`：只对要它的路由有值（S-12）。 */
  readonly tenant: TenantId | undefined
  readonly credentialChange?: PreparedCredentialChange
}

/** 领域答复的形状（参与方各自的返回约定）。 */
export type ReplyShape =
  /** `{ ok } | { failure }` */
  | 'outcome'
  /** `'ok' | { failure }` */
  | 'ack'
  /** `MembershipStanding | { failure }`（OG S-26） */
  | 'standing'
  /** 注册组合的四个终结结果之一（字符串） */
  | 'terminal'

/** 被投影条款失败集合里各名字的收场（S-14）；表外的名字一律缺陷。 */
export interface FailureTable {
  /** 原样透传为路由结果的具名失败。 */
  readonly pass: readonly string[]
  /** 「出示的那个登录状态此刻不作数」⇒ `login-state-rejected`（S-33）。 */
  readonly rejected?: readonly string[]
  /** 判不了 ⇒ `unavailable`。 */
  readonly unavailable?: readonly string[]
  /** 表示层不合格：交进去的输入里有来自载荷的项 ⇒ `invalid-input`，否则缺陷。 */
  readonly representation?: readonly string[]
  /** 在本组合里结构上到不了 ⇒ 缺陷（S-14）。 */
  readonly unreachable?: readonly string[]
}

interface RouteCommon {
  readonly id: RouteId
  /** `Payload_<路由>` 与 `Result_<路由>` 的后缀。 */
  readonly schema: string
  readonly reply: ReplyShape
  readonly failures: FailureTable
}

export interface ExemptRoute extends RouteCommon {
  readonly exempt: true
  readonly invoke: (services: DecisionServices, payload: Payload) => Promise<unknown>
}

export interface AuthenticatedRoute extends RouteCommon {
  readonly credentialChange?: true
  readonly requiresSuperAdministrator?: true
  readonly exempt: false
  /** 要不要推导 `TenantId`（S-12）：只有要它的路由才现读 OG S-36。 */
  readonly derivesTenant: (payload: Payload) => boolean
  /** 补授权（S-13）：要核「调用方在该组织里有效」的组织；不补则缺席。 */
  readonly gate?: (payload: Payload) => readonly unknown[]
  readonly invoke: (
    services: AuthenticatedServices,
    input: AuthenticatedInput,
  ) => Promise<unknown> | unknown
  /** 矛盾清单 ③（OG S-36 返回的 `account` 分量不等于认人所得 `AccountId`）。 */
  readonly contradicts?: (ok: unknown, caller: Caller) => boolean
}

export type Route = ExemptRoute | AuthenticatedRoute

// ---- 投影：领域值 → 线上值（S-12：成员按管它的定义的书写次序） ----

// ---- 身份 ----

/** 推导所得 `TenantId`：要它的路由上判定次序保证已推出；缺了是本包的缺陷。 */
function derived(input: AuthenticatedInput): TenantId {
  if (input.tenant === undefined)
    throw new Error('route needs the derived tenant but none was derived')
  return input.tenant
}

const never = (): boolean => false
const always = (): boolean => true

/** OG 失败三类收场里的后两类（OG S-16：不可用、表示层）；拒绝类的具名值按各条列在 `pass`。 */
const OG_FAILURES = { unavailable: ['unavailable'], representation: ['invalidInput'] } as const

// ---- 路由表 ----

export const ROUTES: readonly Route[] = [
  {
    id: 'composition.account-registration/v2#S-8',
    schema: 'AR_S8',
    exempt: true,
    // 表示层校验在载荷那一步已做完；不合格的从不交进去（交进去的收场是 interrupted）
    invoke: async (services, payload) =>
      services.registration.register(payload['loginIdentifier'], payload['credential']),
    reply: 'terminal',
    failures: {
      pass: ['identifier-taken', 'credential-rejected', 'interrupted'],
      unreachable: ['identifier-held-by-expired-record'],
    },
  },
  {
    id: 'capability.account-identity/v3#S-15',
    schema: 'AI_S15',
    exempt: true,
    invoke: async (services, payload) =>
      services.logins.issue(payload['loginIdentifier'], payload['credential']),
    reply: 'outcome',
    failures: {
      pass: ['identifier-or-credential-rejected'],
      unavailable: ['storage-unavailable'],
      representation: ['invalid-input'],
    },
    // 出示物在全部输出里唯一出现的一处（S-19、S-29）
  },
  {
    id: 'capability.account-identity/v3#S-16',
    schema: 'AI_S16',
    exempt: false,
    derivesTenant: never,
    // 目标是载荷里的句柄，原样交给 `unknown` 的目标参数；发起方只取认人所得（S-20、约束第 8 条）
    invoke: (services, { payload, caller }) =>
      services.logins.revoke(payload['loginStateHandle'], caller.loginStateId),
    reply: 'ack',
    failures: {
      pass: ['login-state-not-found'],
      rejected: ['not-authorized'],
      unavailable: ['storage-unavailable'],
      representation: ['invalid-input'],
    },
  },
  {
    id: 'capability.account-identity/v3#S-37',
    schema: 'AI_S37',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { caller }) => services.logins.listEffective(caller.loginStateId),
    reply: 'outcome',
    failures: {
      pass: [],
      rejected: ['login-state-rejected'],
      unavailable: ['storage-unavailable'],
      representation: ['invalid-input'],
    },
    // 每项恰 { loginStateHandle, issuedAt }，不含出示物；空列表过不了 Schema 的 minItems ⇒ 缺陷
  },
  {
    id: 'capability.organization-governance/v2#S-21',
    schema: 'OG_S21',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { payload, caller }) =>
      'creationKey' in payload
        ? services.organizations.createTeam(caller.accountId, payload['creationKey'])
        : services.organizations.createTeam(caller.accountId),
    reply: 'outcome',
    // 调用方本人的「未激活」「不存在」结构上到不了：认人所得 AccountId 必属一个已激活账号
    failures: {
      pass: [],
      ...OG_FAILURES,
      unreachable: ['accountNotActivated', 'accountDoesNotExist'],
    },
  },
  {
    id: 'capability.organization-governance/v2#S-22',
    schema: 'OG_S22',
    exempt: false,
    derivesTenant: never,
    gate: payload => [payload['organization']],
    invoke: (services, { payload }) => services.organizations.read(payload['organization']),
    reply: 'outcome',
    failures: { pass: ['organizationDoesNotExist'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-23',
    schema: 'OG_S23',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) => {
      const { payload } = input
      const issuer = derived(input)
      // 可选项缺席就作缺席交下去，由领域取它自己的默认（S-17 第 7 件事）
      if ('offerTtl' in payload) {
        return services.offers.issueInvitation(
          issuer,
          payload['invitedAccount'],
          payload['role'],
          payload['offerTtl'],
        )
      }
      if ('role' in payload) {
        return services.offers.issueInvitation(issuer, payload['invitedAccount'], payload['role'])
      }
      return services.offers.issueInvitation(issuer, payload['invitedAccount'])
    },
    reply: 'outcome',
    failures: {
      pass: [
        'issuerIsPersonalOrganization',
        'notAuthorized',
        'accountNotActivated',
        'accountDoesNotExist',
        'alreadyAnEffectiveMember',
        'invalidOfferDuration',
      ],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-24',
    schema: 'OG_S24',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.offers.withdrawInvitation(derived(input), input.payload['invitation']),
    reply: 'ack',
    failures: {
      pass: ['invitationDoesNotExist', 'notAuthorized', 'alreadyConcluded'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-25',
    schema: 'OG_S25',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { payload, caller }) =>
      services.offers.acceptInvitation(caller.accountId, payload['invitation']),
    reply: 'outcome',
    failures: {
      pass: [
        'invitationDoesNotExist',
        'offerNoLongerValid',
        'notTheInvitedAccount',
        'alreadyAnEffectiveMember',
      ],
      ...OG_FAILURES,
      unreachable: ['accountNotActivated', 'accountDoesNotExist'],
    },
  },
  {
    id: 'capability.organization-governance/v2#S-26',
    schema: 'OG_S26',
    exempt: false,
    derivesTenant: never,
    gate: payload => [record(payload['tenant'])['organization']],
    invoke: (services, { payload }) => services.memberships.standing(payload['tenant']),
    reply: 'standing',
    failures: { pass: [], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-27',
    schema: 'OG_S27',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { caller }) => services.memberships.mine(caller.accountId),
    reply: 'outcome',
    // 空列表过不了 Schema 的 minItems ⇒ 缺陷（已激活的账号本版不可能一个有效租户都没有）
    failures: { pass: [], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-28',
    schema: 'OG_S28',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.memberships.changeRole(
        derived(input),
        input.payload['targetTenant'],
        input.payload['role'],
      ),
    reply: 'ack',
    failures: {
      pass: ['notAuthorized', 'membershipNotEffective', 'wouldLeaveNoSuperAdministrator'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-29',
    schema: 'OG_S29',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.memberships.remove(derived(input), input.payload['targetTenant']),
    reply: 'ack',
    failures: {
      pass: [
        'personalOrganizationMemberCannotLeave',
        'notAuthorized',
        'membershipNotEffective',
        'wouldLeaveNoSuperAdministrator',
      ],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-30',
    schema: 'OG_S30',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) => {
      const { payload } = input
      return 'offerTtl' in payload
        ? services.offers.issueAffiliationRequest(
            derived(input),
            payload['recipientOrganization'],
            payload['direction'],
            payload['offerTtl'],
          )
        : services.offers.issueAffiliationRequest(
            derived(input),
            payload['recipientOrganization'],
            payload['direction'],
          )
    },
    reply: 'outcome',
    failures: {
      pass: [
        'personalOrganizationTakesNoPartInAffiliation',
        'notAuthorized',
        'organizationDoesNotExist',
        'wouldFormACycle',
        'invalidOfferDuration',
      ],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-31',
    schema: 'OG_S31',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.offers.withdrawAffiliationRequest(
        derived(input),
        input.payload['affiliationRequest'],
      ),
    reply: 'ack',
    failures: {
      pass: ['affiliationRequestDoesNotExist', 'notAuthorized', 'alreadyConcluded'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-32',
    schema: 'OG_S32',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.offers.acceptAffiliationRequest(derived(input), input.payload['affiliationRequest']),
    reply: 'ack',
    failures: {
      pass: [
        'affiliationRequestDoesNotExist',
        'offerNoLongerValid',
        'notAuthorized',
        'alreadyHasAParentOrganization',
        'wouldFormACycle',
        'personalOrganizationTakesNoPartInAffiliation',
      ],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-33',
    schema: 'OG_S33',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.organizations.dissolveAffiliation(
        derived(input),
        input.payload['childOrganization'],
      ),
    reply: 'ack',
    failures: { pass: ['noSuchAffiliation', 'notAuthorized'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-34',
    schema: 'OG_S34',
    exempt: false,
    derivesTenant: never,
    // 载荷里的每一个组织都补授权，全部读完、不短路（S-13）
    gate: payload => list(payload['organizations']),
    invoke: (services, { payload }) => {
      const [first, second] = list(payload['organizations'])
      return second === undefined
        ? services.organizations.ancestorChain(first)
        : services.organizations.shareAncestor(first, second)
    },
    reply: 'outcome',
    failures: { pass: ['organizationDoesNotExist'], ...OG_FAILURES },
    // 一个组织 ⇒ 上级链（数组）；两个 ⇒ 有共同上级（布尔）。按载荷的个数核，不由返回值自己说
  },
  {
    id: 'capability.organization-governance/v2#S-35',
    schema: 'OG_S35',
    exempt: false,
    derivesTenant: never,
    gate: payload => [record(payload['tenant'])['organization']],
    invoke: (services, { payload }) => services.organizations.scopeLayers(payload['tenant']),
    reply: 'outcome',
    failures: { pass: [], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-36',
    schema: 'OG_S36',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { caller }) => services.memberships.currentTenant(caller.loginStateId),
    reply: 'outcome',
    failures: { pass: [], rejected: ['loginStateNotValid'], ...OG_FAILURES },

    contradicts: (value, caller) => record(value)['account'] !== caller.accountId,
  },
  {
    id: 'capability.organization-governance/v2#S-37',
    schema: 'OG_S37',
    exempt: false,
    derivesTenant: always,
    invoke: (services, { payload, caller }) =>
      services.memberships.switchCurrentTenant(caller.loginStateId, payload['targetTenant']),
    reply: 'ack',
    failures: {
      pass: ['notOwnTenant', 'membershipNotEffective'],
      rejected: ['loginStateNotValid'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-55',
    schema: 'OG_S55',
    exempt: false,
    // 判别式是 `tenant` 才推导；`account` 支交给领域的是认人所得 AccountId
    derivesTenant: payload => payload['callerIdentityKind'] === 'tenant',
    invoke: (services, input) =>
      services.offers.readInvitation(
        input.payload['callerIdentityKind'] === 'tenant'
          ? { kind: 'tenant', tenantId: derived(input) }
          : { kind: 'account', accountId: input.caller.accountId },
        input.payload['invitation'],
      ),
    reply: 'outcome',
    failures: { pass: ['invitationDoesNotExist'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-56',
    schema: 'OG_S56',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.offers.readAffiliationRequest(derived(input), input.payload['affiliationRequest']),
    reply: 'outcome',
    failures: { pass: ['affiliationRequestDoesNotExist'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-57',
    schema: 'OG_S57',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { payload, caller }) =>
      'includeConcluded' in payload
        ? services.offers.listReceivedInvitations(caller.accountId, payload['includeConcluded'])
        : services.offers.listReceivedInvitations(caller.accountId),
    reply: 'outcome',
    failures: { pass: [], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-58',
    schema: 'OG_S58',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      'includeConcluded' in input.payload
        ? services.offers.listIssued(derived(input), input.payload['includeConcluded'])
        : services.offers.listIssued(derived(input)),
    reply: 'outcome',
    failures: { pass: ['notAuthorized'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-59',
    schema: 'OG_S59',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      'includeIneffective' in input.payload
        ? services.memberships.list(derived(input), input.payload['includeIneffective'])
        : services.memberships.list(derived(input)),
    reply: 'outcome',
    failures: { pass: ['notAuthorized'], ...OG_FAILURES },
  },
  {
    id: 'capability.organization-governance/v2#S-60',
    schema: 'OG_S60',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      'includeConcluded' in input.payload
        ? services.offers.listReceivedAffiliationRequests(
            derived(input),
            input.payload['includeConcluded'],
          )
        : services.offers.listReceivedAffiliationRequests(derived(input)),
    reply: 'outcome',
    failures: { pass: ['notAuthorized'], ...OG_FAILURES },
  },
  {
    id: 'capability.account-identity/v3#S-50',
    schema: 'AI_S50',
    exempt: false,
    credentialChange: true,
    derivesTenant: never,
    invoke: (services, input) => {
      if (input.credentialChange === undefined)
        throw new TypeError('missing prepared credential change')
      return services.logins.commitCredentialChange(input.credentialChange)
    },
    reply: 'ack',
    failures: {
      pass: ['current-credential-rejected', 'credential-rejected'],
      rejected: ['login-state-rejected'],
      unavailable: ['storage-unavailable'],
      representation: ['invalid-input'],
    },
  },
  {
    id: 'capability.organization-governance/v2#S-61',
    schema: 'OG_S61',
    exempt: false,
    derivesTenant: never,
    invoke: (services, { caller, payload }) =>
      services.offers.declineInvitation(caller.accountId, payload['invitation']),
    reply: 'ack',
    failures: {
      pass: ['invitationDoesNotExist', 'alreadyConcluded'],
      unreachable: ['accountDoesNotExist', 'accountNotActivated'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'capability.organization-governance/v2#S-62',
    schema: 'OG_S62',
    exempt: false,
    derivesTenant: always,
    invoke: (services, input) =>
      services.offers.declineAffiliationRequest(
        derived(input),
        input.payload['affiliationRequest'],
      ),
    reply: 'ack',
    failures: {
      pass: ['affiliationRequestDoesNotExist', 'notAuthorized', 'alreadyConcluded'],
      ...OG_FAILURES,
    },
  },
  {
    id: 'composition.governance-center-entry/v2#S-50',
    schema: 'ENTRY_S50',
    exempt: false,
    derivesTenant: always,
    requiresSuperAdministrator: true,
    invoke: async (services, input) => {
      const found = await services.accounts.resolveActivatedIdentifier(
        input.payload['loginIdentifier'],
      )
      if ('failure' in found) {
        switch (found.failure) {
          case 'account-not-found':
            return { failure: 'accountDoesNotExist' }
          case 'storage-unavailable':
            return { failure: 'unavailable' }
          case 'invalid-input':
            throw new TypeError('validated identifier rejected by account owner')
        }
      }
      return services.offers.issueInvitation(
        derived(input),
        found.ok,
        input.payload['role'],
        input.payload['offerTtl'],
      )
    },
    reply: 'outcome',
    failures: {
      pass: [
        'notAuthorized',
        'accountDoesNotExist',
        'issuerIsPersonalOrganization',
        'alreadyAnEffectiveMember',
        'invalidOfferDuration',
      ],
      unreachable: ['accountNotActivated'],
      ...OG_FAILURES,
    },
  },
]

const BY_ID: ReadonlyMap<string, Route> = new Map(ROUTES.map(route => [route.id, route]))

/** 路由表查找：表外的 `operation` ⇒ `undefined`（S-10 ①′ 答 `invalid-input`）。 */
export function routeFor(operation: unknown): Route | undefined {
  return typeof operation === 'string' ? BY_ID.get(operation) : undefined
}
