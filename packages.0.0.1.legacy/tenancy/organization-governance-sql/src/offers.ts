import type { OrgRead, OrgDataUnit } from './governance-data.ts'
import type { PolicyDeps } from './policy-deps.ts'
import type { OffersParticipation } from '@omne-harness-lite/organization-governance'
import type {
  DeclineInvitationFailure,
  DeclineAffiliationRequestFailure,
} from '@omne-harness-lite/organization-governance'
// offers 服务面：邀请（S-23 发出、S-24 撤回、S-25 接受）、隶属请求（S-30 发出、S-31 撤回、S-32 接受），
// 读面 S-55～S-58、S-60。过期语义整块引用 data.offer-expiry v2：`timingFrom`、`deriveState`、`acceptable`、`parseOfferTtl`。
import {
  type OrganizationId,
  type TenantId,
  type TenantRole,
  ancestorChain,
  isOk,
  parseAccountId,
  parseOpaqueIdentifier,
  parseOrganizationId,
  parseTenantId,
  parseTenantRole,
} from '@omne-harness-lite/identity-values'
import {
  type Duration,
  type Instant,
  type OfferState,
  type TargetExistence,
  acceptable,
  deriveState,
  parseOfferTtl,
  timingFrom,
} from '@omne-harness-lite/offer-expiry'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { parseIncludeSwitch, parseOfferReader } from './input.ts'
import { ParentChainCycle } from './organizations.ts'
import {
  type AffiliationRequestRecord,
  type InvitationRecord,
  decodeAffiliationRequest,
  decodeInvitation,
  existenceOf,
  isSuperAdministrator,
  loadParentSnapshot,
  mintIdentifier,
  parseDirection,
  readMembership,
  readOrganization,
} from './records.ts'
import {
  type OperationContext,
  readAccountFacts,
  withOperation,
  withParticipation,
} from './runtime.ts'
import type {
  AcceptAffiliationRequestFailure,
  AcceptInvitationFailure,
  AffiliationRequestId,
  AffiliationRequestReading,
  InvitationId,
  InvitationReading,
  IssueAffiliationRequestFailure,
  IssueInvitationFailure,
  IssuedOffers,
  ListIssuedFailure,
  ListReceivedAffiliationRequestsFailure,
  ListReceivedInvitationsFailure,
  OffersService,
  OfferReader,
  ReadAffiliationRequestFailure,
  ReadInvitationFailure,
  WithdrawAffiliationRequestFailure,
  WithdrawInvitationFailure,
} from '@omne-harness-lite/organization-governance'

const parseInvitationId = (value: unknown) => parseOpaqueIdentifier(value, 'InvitationId')
const parseAffiliationRequestId = (value: unknown) =>
  parseOpaqueIdentifier(value, 'AffiliationRequestId')

/** 有效时长：缺席 ⇒ 这一类的默认值；给了就按 OE S-14 解析，非正或不合形状 ⇒ `invalidOfferDuration`（不静默换成默认值）。 */
function resolveTtl(value: unknown, classDefault: Duration): Duration | 'invalidOfferDuration' {
  if (value === undefined) return classDefault
  const parsed = parseOfferTtl(value)
  return isOk(parsed) ? parsed.ok : 'invalidOfferDuration'
}

// ---- 事务内读 ----

async function readInvitationRecord(
  d: OrgRead,
  id: InvitationId,
): Promise<InvitationRecord | undefined> {
  const row = await d.invitation(id)
  return row === undefined ? undefined : decodeInvitation(row)
}

async function readAffiliationRequestRecord(
  d: OrgRead,
  id: AffiliationRequestId,
): Promise<AffiliationRequestRecord | undefined> {
  const row = await d.affiliation(id)
  return row === undefined ? undefined : decodeAffiliationRequest(row)
}

/** 派生状态读时求值（OE S-8／S-9）；判过期的指向对象：邀请 = 发出它的组织，隶属请求 = 接收方组织（OE S-2）。 */
function invitationState(
  record: InvitationRecord,
  now: Instant | 'unavailable',
  existence: TargetExistence,
): OfferState | 'unavailable' {
  return deriveState({ timing: record.timing, settled: record.settled, now, target: existence })
}

function requestState(
  record: AffiliationRequestRecord,
  now: Instant | 'unavailable',
  existence: TargetExistence,
): OfferState | 'unavailable' {
  return deriveState({ timing: record.timing, settled: record.settled, now, target: existence })
}

function invitationReading(record: InvitationRecord, state: OfferState): InvitationReading {
  return {
    id: record.id,
    issuer: record.issuer,
    invitedAccount: record.invitedAccount,
    role: record.role,
    timing: record.timing,
    state,
  }
}

function requestReading(
  record: AffiliationRequestRecord,
  state: OfferState,
): AffiliationRequestReading {
  return {
    id: record.id,
    initiator: record.initiator,
    recipient: record.recipient,
    direction: record.direction,
    timing: record.timing,
    state,
  }
}

async function existenceOne(d: OrgRead, id: OrganizationId): Promise<TargetExistence> {
  return (await existenceOf(d, [id])).get(id) ?? 'unavailable'
}

/** 撤回的共同收场（S-24／S-31 ⑦）：本操作自己写过的 `withdrawn` ⇒ ok 重入；`accepted` 或已过期 ⇒ `alreadyConcluded`，不写。 */
type WithdrawStep = 'write' | 'ok' | 'alreadyConcluded' | 'unavailable'
function withdrawStep(state: OfferState | 'unavailable'): WithdrawStep {
  switch (state) {
    case 'pending':
      return 'write'
    case 'withdrawn':
      return 'ok'
    case 'accepted':
    case 'declined':
    case 'expired':
      return 'alreadyConcluded'
    case 'unavailable':
      return 'unavailable'
  }
}

// ---- 邀请 ----

async function issueInvitation(
  deps: OperationContext,
  issuerInput: unknown,
  targetInput: unknown,
  roleInput?: unknown,
  ttlInput?: unknown,
): Promise<Outcome<InvitationId, IssueInvitationFailure>> {
  const issuer = parseTenantId(issuerInput)
  const target = parseAccountId(targetInput)
  if (!isOk(issuer) || !isOk(target)) return fail('invalidInput')
  // 指定角色缺省为普通成员；给了就按集合闭合判（IV S-32）
  let role: TenantRole = 'member'
  if (roleInput !== undefined) {
    const parsedRole = parseTenantRole(roleInput)
    if (!isOk(parsedRole)) return fail('invalidInput')
    role = parsedRole.ok
  }
  const ttl = resolveTtl(ttlInput, deps.config.invitationTtlDefault)
  if (ttl === 'invalidOfferDuration') return fail('invalidOfferDuration')

  // ③ 结构性禁止先于授权（S-15），② 授权再先于账号读面：失败值的次序与读面给的判定一致
  const precheck = await deps.query(async tx => {
    const d = tx
    const organization = await readOrganization(d, issuer.ok.organization)
    if (organization?.kind === 'personal') return fail('issuerIsPersonalOrganization')
    if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
    return succeed(undefined)
  })
  if ('failure' in precheck) return precheck

  // 账号读面通过当前共同单元参与，不另开事务
  const facts = await readAccountFacts(deps, target.ok)
  if ('failure' in facts) return facts
  if (!facts.ok.activated) return fail('accountNotActivated')

  const outcome = await deps.mutate(async tx => {
    const d = tx
    // 授权在写入的同一提交里再现读一次（S-18）
    if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
    const existing = await readMembership(d, {
      organization: issuer.ok.organization,
      account: target.ok,
    })
    if (existing?.effective === true) return fail('alreadyAnEffectiveMember')
    const now = await deps.clock.now()
    if (now === 'unavailable') return fail('unavailable')
    const timing = timingFrom(now, ttl)
    if (timing === 'unavailable') return fail('unavailable')
    if (!isOk(timing)) return fail('invalidOfferDuration')
    const id = mintIdentifier('InvitationId')
    await d.insertInvitation({
      invitation_id: id,
      issuer_organization: issuer.ok.organization,
      invited_account: target.ok,
      role,
      issued_at: timing.ok.issuedAt,
      expires_at: timing.ok.expiresAt,
      settled: null,
    })
    return succeed(id)
  })
  if ('failure' in outcome) return outcome
  // ⑨ 必发（通知）：提交之后派发一次
  deps.notify('organization-governance/invitation-issued', {
    invitationId: outcome.ok,
    issuer: issuer.ok.organization,
    invitedAccount: target.ok,
  })
  return outcome
}

async function withdrawInvitation(
  deps: OperationContext,
  issuerInput: unknown,
  invitationInput: unknown,
): Promise<Ack<WithdrawInvitationFailure>> {
  const issuer = parseTenantId(issuerInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(issuer) || !isOk(id)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    await tx.lockInvitation(id.ok)
    const d = tx
    const record = await readInvitationRecord(d, id.ok)
    // 不属发起者的组织 ⇒ 同一个 DoesNotExist，不泄漏存在性
    if (record === undefined || record.issuer !== issuer.ok.organization) {
      return fail('invitationDoesNotExist')
    }
    if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
    // ④ 提交内先现读一次过期判定（OE S-8 反方向：已过期的不得再写终结记录）
    const step = withdrawStep(
      record.settled ??
        invitationState(record, await deps.clock.now(), await existenceOne(d, record.issuer)),
    )
    if (step === 'alreadyConcluded' || step === 'unavailable') return fail(step)
    if (step === 'write') {
      await d.settleInvitation(record.id, 'withdrawn')
    }
    return succeed(undefined)
  })
  return 'failure' in outcome ? outcome : 'ok'
}

async function acceptInvitation(
  deps: OperationContext,
  accountInput: unknown,
  invitationInput: unknown,
): Promise<Outcome<TenantId, AcceptInvitationFailure>> {
  const account = parseAccountId(accountInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(account) || !isOk(id)) return fail('invalidInput')

  // 三段都在当前共同单元：① 读邀请 → ② 账号已激活 → ③ 序列化写回调内全部重判
  const located = await deps.query(async tx => {
    const record = await readInvitationRecord(tx, id.ok)
    if (record === undefined) return fail('invitationDoesNotExist')
    if (record.invitedAccount !== account.ok) return fail('notTheInvitedAccount')
    return succeed(record.issuer)
  })
  if ('failure' in located) return located
  const issuer = located.ok

  const facts = await readAccountFacts(deps, account.ok)
  if ('failure' in facts) return facts
  // 已激活不回退（AI S-20）：读到已激活即可提交
  if (!facts.ok.activated) return fail('accountNotActivated')

  const tenant: TenantId = { organization: issuer, account: account.ok }
  const outcome = await deps.mutate(async tx => {
    // ④ 受 S-17 序列化（R-3a）：成员写入前锁组织行；邀请行锁住防与撤回交错
    await tx.lockOrganization(issuer)
    await tx.lockInvitation(id.ok)
    const d = tx
    const record = await readInvitationRecord(d, id.ok)
    if (record === undefined) return fail('invitationDoesNotExist')
    if (record.invitedAccount !== account.ok) return fail('notTheInvitedAccount')
    // ② 过期在写入的同一提交内重新求值（OE S-10）；三种来路折成一个布尔再映射（OE S-13）
    const state =
      record.settled ??
      invitationState(record, await deps.clock.now(), await existenceOne(d, record.issuer))
    if (state === 'unavailable') return fail('unavailable')
    if (!acceptable(state)) return fail('offerNoLongerValid')
    const existing = await readMembership(d, tenant)
    if (existing?.effective === true) return fail('alreadyAnEffectiveMember')
    // S-39：同一个主键上置回有效——回来的是同一条记录、同一个 TenantId；角色取本次邀请指定的，不继承
    await d.establishMembership(tenant, record.role)
    await d.settleInvitation(record.id, 'accepted')
    return succeed(tenant)
  })
  if ('failure' in outcome) return outcome
  deps.notify('organization-governance/membership-changed', { tenant, effective: true })
  return outcome
}

// ---- 隶属请求 ----

async function issueAffiliationRequest(
  deps: OperationContext,
  initiatorInput: unknown,
  recipientInput: unknown,
  directionInput: unknown,
  ttlInput?: unknown,
): Promise<Outcome<AffiliationRequestId, IssueAffiliationRequestFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const recipient = parseOrganizationId(recipientInput)
  const direction = parseDirection(directionInput)
  if (!isOk(initiator) || !isOk(recipient) || !isOk(direction)) return fail('invalidInput')
  const ttl = resolveTtl(ttlInput, deps.config.affiliationRequestTtlDefault)
  if (ttl === 'invalidOfferDuration') return fail('invalidOfferDuration')
  // 指向自己：两个不透明标识逐码点比较即可判出，不读任何记录；值与 S-32 判环同一个
  if (recipient.ok === initiator.ok.organization) return fail('wouldFormACycle')

  return deps.mutate(async tx => {
    const d = tx
    const own = await readOrganization(d, initiator.ok.organization)
    if (own?.kind === 'personal') return fail('personalOrganizationTakesNoPartInAffiliation')
    const other = await readOrganization(d, recipient.ok)
    if (other === undefined) return fail('organizationDoesNotExist')
    if (other.kind === 'personal') return fail('personalOrganizationTakesNoPartInAffiliation')
    if (!(await isSuperAdministrator(d, initiator.ok))) return fail('notAuthorized')
    // 一般的环与「己方已有上级」不在这里判，留给接受那一刻（S-30 正文）
    const now = await deps.clock.now()
    if (now === 'unavailable') return fail('unavailable')
    const timing = timingFrom(now, ttl)
    if (timing === 'unavailable') return fail('unavailable')
    if (!isOk(timing)) return fail('invalidOfferDuration')
    const id = mintIdentifier('AffiliationRequestId')
    await d.insertAffiliation({
      affiliation_request_id: id,
      initiator: initiator.ok.organization,
      recipient: recipient.ok,
      direction: direction.ok,
      issued_at: timing.ok.issuedAt,
      expires_at: timing.ok.expiresAt,
      settled: null,
    })
    return succeed(id)
  })
}

async function withdrawAffiliationRequest(
  deps: OperationContext,
  initiatorInput: unknown,
  requestInput: unknown,
): Promise<Ack<WithdrawAffiliationRequestFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(initiator) || !isOk(id)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    await tx.lockAffiliation(id.ok)
    const d = tx
    const record = await readAffiliationRequestRecord(d, id.ok)
    // 只对发起方成立；接收方撤不了别人发来的请求，同样收成 DoesNotExist
    if (record === undefined || record.initiator !== initiator.ok.organization) {
      return fail('affiliationRequestDoesNotExist')
    }
    if (!(await isSuperAdministrator(d, initiator.ok))) return fail('notAuthorized')
    const step = withdrawStep(
      record.settled ??
        requestState(record, await deps.clock.now(), await existenceOne(d, record.recipient)),
    )
    if (step === 'alreadyConcluded' || step === 'unavailable') return fail(step)
    if (step === 'write') {
      await d.settleAffiliation(record.id, 'withdrawn')
    }
    return succeed(undefined)
  })
  return 'failure' in outcome ? outcome : 'ok'
}

/** 由方向定下级与新上级（S-30 ①）。 */
function childAndParent(record: AffiliationRequestRecord): {
  readonly child: OrganizationId
  readonly newParent: OrganizationId
} {
  return record.direction === 'recipientAsParent'
    ? { child: record.initiator, newParent: record.recipient }
    : { child: record.recipient, newParent: record.initiator }
}

async function acceptAffiliationRequest(
  deps: OperationContext,
  acceptorInput: unknown,
  requestInput: unknown,
): Promise<Ack<AcceptAffiliationRequestFailure>> {
  const acceptor = parseTenantId(acceptorInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(acceptor) || !isOk(id)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    // R-3b：隶属写部署级序列化——链跨多个组织，按组织加锁不够
    await tx.lockAffiliationGraph()
    await tx.lockAffiliation(id.ok)
    const d = tx
    const record = await readAffiliationRequestRecord(d, id.ok)
    if (record === undefined) return fail('affiliationRequestDoesNotExist')
    // ③ 结构性禁止先于授权（S-15）：由两端的 OrganizationKind 决定，与接受者无关
    const initiatorOrg = await readOrganization(d, record.initiator)
    const recipientOrg = await readOrganization(d, record.recipient)
    if (initiatorOrg?.kind === 'personal' || recipientOrg?.kind === 'personal') {
      return fail('personalOrganizationTakesNoPartInAffiliation')
    }
    // ② 接受者是接收方组织的超级管理员（单方面指定不允许，哪怕发起方是上级）
    const authorized =
      acceptor.ok.organization === record.recipient && (await isSuperAdministrator(d, acceptor.ok))
    if (!authorized) return fail('notAuthorized')
    // ④① 过期重判，指向对象只有接收方组织
    const state = requestState(
      record,
      await deps.clock.now(),
      recipientOrg === undefined ? 'absent' : 'exists',
    )
    if (state === 'unavailable') return fail('unavailable')
    if (!acceptable(state)) return fail('offerNoLongerValid')
    const { child, newParent } = childAndParent(record)
    const childOrg = child === record.initiator ? initiatorOrg : recipientOrg
    if (childOrg === undefined) {
      // 团队组织本版没有终结路径；下级组织读得到却不存在是缺陷
      throw new Error(
        `organization-governance: affiliation request ${record.id} names a missing organization`,
      )
    }
    // ④② 下级尚无上级
    if (childOrg.parent !== null) return fail('alreadyHasAParentOrganization')
    // ④③ 判环两半：newParent 不是 child 自己，且 child 不在 newParent 的上级链上；
    // 链在同一提交内逐行读出，任一行读不到 ⇒ unavailable，不判「不成环」
    if (child === newParent) return fail('wouldFormACycle')
    const chain = ancestorChain(newParent, await loadParentSnapshot(d, [newParent]))
    if ('failure' in chain) {
      if (chain.failure === 'cycle') throw new ParentChainCycle(newParent)
      return fail('unavailable')
    }
    if (chain.ok.includes(child)) return fail('wouldFormACycle')
    // ④④⑤ 写上级属性 ＋ 终结记录；不产生任何租户（没有通向成员写入的路）
    await d.setParent(child, newParent)
    await d.settleAffiliation(record.id, 'accepted')
    return succeed(undefined)
  })
  return 'failure' in outcome ? outcome : 'ok'
}

// ---- 读面 ----

async function readInvitation(
  deps: OperationContext,
  callerInput: OfferReader,
  invitationInput: unknown,
): Promise<Outcome<InvitationReading, ReadInvitationFailure>> {
  const caller = parseOfferReader(callerInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(caller) || !isOk(id)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
    const record = await readInvitationRecord(d, id.ok)
    if (record === undefined) return fail('invitationDoesNotExist')
    // ② 两类人，与判别式一一对应；不满足 ⇒ DoesNotExist（不泄漏存在性）
    const allowed =
      caller.ok.kind === 'account'
        ? caller.ok.accountId === record.invitedAccount
        : caller.ok.tenantId.organization === record.issuer &&
          (await isSuperAdministrator(d, caller.ok.tenantId))
    if (!allowed) return fail('invitationDoesNotExist')
    const state =
      record.settled ??
      invitationState(record, await deps.clock.now(), await existenceOne(d, record.issuer))
    if (state === 'unavailable') return fail('unavailable')
    return succeed(invitationReading(record, state))
  })
}

async function readAffiliationRequest(
  deps: OperationContext,
  callerInput: unknown,
  requestInput: unknown,
): Promise<Outcome<AffiliationRequestReading, ReadAffiliationRequestFailure>> {
  const caller = parseTenantId(callerInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(caller) || !isOk(id)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
    const record = await readAffiliationRequestRecord(d, id.ok)
    if (record === undefined) return fail('affiliationRequestDoesNotExist')
    const party =
      caller.ok.organization === record.initiator || caller.ok.organization === record.recipient
    if (!party || !(await isSuperAdministrator(d, caller.ok))) {
      return fail('affiliationRequestDoesNotExist')
    }
    const state =
      record.settled ??
      requestState(record, await deps.clock.now(), await existenceOne(d, record.recipient))
    if (state === 'unavailable') return fail('unavailable')
    return succeed(requestReading(record, state))
  })
}

/**
 * 列表面的共同求值：一次读事务、一次 `now`、一次批量存在性读；逐项 `deriveState`；
 * 任一项求不出派生状态 ⇒ 整个调用 `unavailable`（不返回残缺列表）；默认过滤在求值之后做。
 */
function evaluateAll<R, V>(
  records: readonly R[],
  stateOf: (record: R) => OfferState | 'unavailable',
  reading: (record: R, state: OfferState) => V,
  includeSettled: boolean,
): readonly V[] | 'unavailable' {
  const out: V[] = []
  for (const record of records) {
    const state = stateOf(record)
    if (state === 'unavailable') return 'unavailable'
    if (includeSettled || state === 'pending') out.push(reading(record, state))
  }
  return out
}

async function listReceivedInvitations(
  deps: OperationContext,
  accountInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<readonly InvitationReading[], ListReceivedInvitationsFailure>> {
  const account = parseAccountId(accountInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(account) || !isOk(includeSettled)) return fail('invalidInput')
  // ② 无授权前置：输入的 AccountId 就是调用者本人（入口层核实，S-42）；返回的全部内容以它为界
  return deps.query(async tx => {
    const d = tx
    const records = (await d.invitationsForAccount(account.ok)).map(decodeInvitation)
    const now = await deps.clock.now()
    const existence = await existenceOf(
      d,
      records.filter(r => r.settled === null).map(r => r.issuer),
    )
    const result = evaluateAll(
      records,
      r => invitationState(r, now, existence.get(r.issuer) ?? 'unavailable'),
      invitationReading,
      includeSettled.ok,
    )
    return result === 'unavailable' ? fail('unavailable') : succeed(result)
  })
}

async function listIssued(
  deps: OperationContext,
  tenantInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<IssuedOffers, ListIssuedFailure>> {
  const caller = parseTenantId(tenantInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(caller) || !isOk(includeSettled)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
    if (!(await isSuperAdministrator(d, caller.ok))) return fail('notAuthorized')
    const organization = caller.ok.organization
    const invitations = (await d.invitationsForIssuer(organization)).map(decodeInvitation)
    const requests = (await d.affiliationsFrom(organization)).map(decodeAffiliationRequest)
    const now = await deps.clock.now()
    const existence = await existenceOf(d, [
      ...invitations.filter(r => r.settled === null).map(r => r.issuer),
      ...requests.filter(r => r.settled === null).map(r => r.recipient),
    ])
    const issuedInvitations = evaluateAll(
      invitations,
      r => invitationState(r, now, existence.get(r.issuer) ?? 'unavailable'),
      invitationReading,
      includeSettled.ok,
    )
    const issuedRequests = evaluateAll(
      requests,
      r => requestState(r, now, existence.get(r.recipient) ?? 'unavailable'),
      requestReading,
      includeSettled.ok,
    )
    if (issuedInvitations === 'unavailable' || issuedRequests === 'unavailable') {
      return fail('unavailable')
    }
    return succeed({ invitations: issuedInvitations, affiliationRequests: issuedRequests })
  })
}

async function listReceivedAffiliationRequests(
  deps: OperationContext,
  tenantInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<readonly AffiliationRequestReading[], ListReceivedAffiliationRequestsFailure>> {
  const caller = parseTenantId(tenantInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(caller) || !isOk(includeSettled)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = tx
    if (!(await isSuperAdministrator(d, caller.ok))) return fail('notAuthorized')
    const records = (await d.affiliationsTo(caller.ok.organization)).map(decodeAffiliationRequest)
    const now = await deps.clock.now()
    // 指向对象就是调用方自己的组织；读不到以异常上抛 ⇒ unavailable，绝不判成「不存在 ⇒ 全表过期」
    const existence = await existenceOf(
      d,
      records.filter(r => r.settled === null).map(r => r.recipient),
    )
    const result = evaluateAll(
      records,
      r => requestState(r, now, existence.get(r.recipient) ?? 'unavailable'),
      requestReading,
      includeSettled.ok,
    )
    return result === 'unavailable' ? fail('unavailable') : succeed(result)
  })
}

async function declineInvitation(
  deps: OperationContext,
  accountInput: unknown,
  invitationInput: unknown,
): Promise<Ack<DeclineInvitationFailure>> {
  const account = parseAccountId(accountInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(account) || !isOk(id)) return fail('invalidInput')
  const located = await deps.query(tx => readInvitationRecord(tx, id.ok))
  if (located === undefined || located.invitedAccount !== account.ok)
    return fail('invitationDoesNotExist')
  const facts = await readAccountFacts(deps, account.ok)
  if ('failure' in facts) return facts
  if (!facts.ok.activated) return fail('accountNotActivated')
  // The owner run holds the shared writer from locate through authorization and settlement.
  return deps.mutate(async tx => {
    const d = tx
    const state =
      located.settled ??
      invitationState(located, await deps.clock.now(), await existenceOne(d, located.issuer))
    if (state === 'declined') return 'ok'
    if (state === 'unavailable') return fail('unavailable')
    if (!acceptable(state)) return fail('alreadyConcluded')
    await d.settleInvitation(id.ok, 'declined')
    return 'ok'
  })
}

async function declineAffiliationRequest(
  deps: OperationContext,
  tenantInput: unknown,
  requestInput: unknown,
): Promise<Ack<DeclineAffiliationRequestFailure>> {
  const tenant = parseTenantId(tenantInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(tenant) || !isOk(id)) return fail('invalidInput')
  return deps.mutate(async tx => {
    const d = tx
    const record = await readAffiliationRequestRecord(d, id.ok)
    if (record === undefined || record.recipient !== tenant.ok.organization)
      return fail('affiliationRequestDoesNotExist')
    if (!(await isSuperAdministrator(d, tenant.ok))) return fail('notAuthorized')
    const state =
      record.settled ??
      record.settled ??
      requestState(record, await deps.clock.now(), await existenceOne(d, record.recipient))
    if (state === 'declined') return 'ok'
    if (state === 'unavailable') return fail('unavailable')
    if (!acceptable(state)) return fail('alreadyConcluded')
    await d.settleAffiliation(id.ok, 'declined')
    return 'ok'
  })
}

export function createOffersPolicy(
  deps: PolicyDeps,
): Omit<OffersService, 'participate'> & { participate(unit: OrgDataUnit): OffersParticipation } {
  return {
    issueInvitation: (issuer, target, role, ttl) =>
      withOperation(deps, context => issueInvitation(context, issuer, target, role, ttl)),
    withdrawInvitation: (issuer, invitation) =>
      withOperation(deps, context => withdrawInvitation(context, issuer, invitation)),
    acceptInvitation: (account, invitation) =>
      withOperation(deps, context => acceptInvitation(context, account, invitation)),
    issueAffiliationRequest: (initiator, recipient, direction, ttl) =>
      withOperation(deps, context =>
        issueAffiliationRequest(context, initiator, recipient, direction, ttl),
      ),
    withdrawAffiliationRequest: (initiator, request) =>
      withOperation(deps, context => withdrawAffiliationRequest(context, initiator, request)),
    acceptAffiliationRequest: (acceptor, request) =>
      withOperation(deps, context => acceptAffiliationRequest(context, acceptor, request)),
    readInvitation: (caller, invitation) =>
      withOperation(deps, context => readInvitation(context, caller, invitation)),
    readAffiliationRequest: (caller, request) =>
      withOperation(deps, context => readAffiliationRequest(context, caller, request)),
    listReceivedInvitations: (account, includeSettled) =>
      withOperation(deps, context => listReceivedInvitations(context, account, includeSettled)),
    listIssued: (tenant, includeSettled) =>
      withOperation(deps, context => listIssued(context, tenant, includeSettled)),
    listReceivedAffiliationRequests: (tenant, includeSettled) =>
      withOperation(deps, context =>
        listReceivedAffiliationRequests(context, tenant, includeSettled),
      ),
    declineInvitation: (account, invitation) =>
      withOperation(deps, context => declineInvitation(context, account, invitation)),
    declineAffiliationRequest: (tenant, request) =>
      withOperation(deps, context => declineAffiliationRequest(context, tenant, request)),
    participate: unit => ({
      issueInvitation: (issuer, target, role, ttl) =>
        withParticipation(deps, unit, context =>
          issueInvitation(context, issuer, target, role, ttl),
        ),
      withdrawInvitation: (issuer, invitation) =>
        withParticipation(deps, unit, context => withdrawInvitation(context, issuer, invitation)),
      acceptInvitation: (account, invitation) =>
        withParticipation(deps, unit, context => acceptInvitation(context, account, invitation)),
      issueAffiliationRequest: (initiator, recipient, direction, ttl) =>
        withParticipation(deps, unit, context =>
          issueAffiliationRequest(context, initiator, recipient, direction, ttl),
        ),
      withdrawAffiliationRequest: (initiator, request) =>
        withParticipation(deps, unit, context =>
          withdrawAffiliationRequest(context, initiator, request),
        ),
      acceptAffiliationRequest: (acceptor, request) =>
        withParticipation(deps, unit, context =>
          acceptAffiliationRequest(context, acceptor, request),
        ),
      readInvitation: (caller, invitation) =>
        withParticipation(deps, unit, context => readInvitation(context, caller, invitation)),
      readAffiliationRequest: (caller, request) =>
        withParticipation(deps, unit, context => readAffiliationRequest(context, caller, request)),
      listReceivedInvitations: (account, includeSettled) =>
        withParticipation(deps, unit, context =>
          listReceivedInvitations(context, account, includeSettled),
        ),
      listIssued: (tenant, includeSettled) =>
        withParticipation(deps, unit, context => listIssued(context, tenant, includeSettled)),
      listReceivedAffiliationRequests: (tenant, includeSettled) =>
        withParticipation(deps, unit, context =>
          listReceivedAffiliationRequests(context, tenant, includeSettled),
        ),
      declineInvitation: (account, invitation) =>
        withParticipation(deps, unit, context => declineInvitation(context, account, invitation)),
      declineAffiliationRequest: (tenant, request) =>
        withParticipation(deps, unit, context =>
          declineAffiliationRequest(context, tenant, request),
        ),
    }),
  }
}
