// offers 服务面：邀请（S-23 发出、S-24 撤回、S-25 接受）、隶属请求（S-30 发出、S-31 撤回、S-32 接受），
// 读面 S-55～S-58、S-60。过期语义整块引用 data.offer-expiry v1：`timingFrom`、`deriveState`、`acceptable`、`parseOfferTtl`。
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
import type { WriteTx } from '@omne-harness-lite/storage'
import { parseIncludeSwitch, parseOfferReader } from './input.ts'
import { AFFILIATION_SENTINEL, ParentChainCycle } from './organizations.ts'
import {
  type AffiliationRequestRecord,
  type Db,
  type InvitationRecord,
  type OgDatabase,
  db,
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
import { type Deps, readAccountFacts, withStorage } from './runtime.ts'
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
} from './types.ts'

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
  d: Db,
  id: InvitationId,
): Promise<InvitationRecord | undefined> {
  const row = await d
    .selectFrom('invitation')
    .selectAll()
    .where('invitation_id', '=', id)
    .executeTakeFirst()
  return row === undefined ? undefined : decodeInvitation(row)
}

async function readAffiliationRequestRecord(
  d: Db,
  id: AffiliationRequestId,
): Promise<AffiliationRequestRecord | undefined> {
  const row = await d
    .selectFrom('affiliation_request')
    .selectAll()
    .where('affiliation_request_id', '=', id)
    .executeTakeFirst()
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

async function existenceOne(d: Db, id: OrganizationId): Promise<TargetExistence> {
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
    case 'expired':
      return 'alreadyConcluded'
    case 'unavailable':
      return 'unavailable'
  }
}

// ---- 邀请 ----

async function issueInvitation(
  deps: Deps,
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
  const precheck = await withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      const organization = await readOrganization(d, issuer.ok.organization)
      if (organization?.kind === 'personal') return fail('issuerIsPersonalOrganization')
      if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
      return succeed(undefined)
    }),
  )
  if ('failure' in precheck) return precheck

  // 账号读面在本节点的事务之外调（不嵌套）
  const facts = await readAccountFacts(deps, target.ok)
  if ('failure' in facts) return facts
  if (!facts.ok.activated) return fail('accountNotActivated')

  const outcome = await withStorage(() =>
    deps.storage.write(async tx => {
      const d = db(tx)
      // 授权在写入的同一提交里再现读一次（S-18）
      if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
      const existing = await readMembership(d, {
        organization: issuer.ok.organization,
        account: target.ok,
      })
      if (existing?.effective === true) return fail('alreadyAnEffectiveMember')
      const now = deps.clock.now()
      if (now === 'unavailable') return fail('unavailable')
      const timing = timingFrom(now, ttl)
      if (!isOk(timing)) return fail('invalidOfferDuration')
      const id = mintIdentifier('InvitationId')
      await d
        .insertInto('invitation')
        .values({
          invitation_id: id,
          issuer_organization: issuer.ok.organization,
          invited_account: target.ok,
          role,
          issued_at: timing.ok.issuedAt,
          expires_at: timing.ok.expiresAt,
          settled: null,
        })
        .execute()
      return succeed(id)
    }),
  )
  if ('failure' in outcome) return outcome
  // ⑨ 必发（通知）：提交之后派发一次
  deps.notify('invitation.issued', {
    invitationId: outcome.ok,
    issuer: issuer.ok.organization,
    invitedAccount: target.ok,
  })
  return outcome
}

async function withdrawInvitation(
  deps: Deps,
  issuerInput: unknown,
  invitationInput: unknown,
): Promise<Ack<WithdrawInvitationFailure>> {
  const issuer = parseTenantId(issuerInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(issuer) || !isOk(id)) return fail('invalidInput')
  const outcome = await withStorage(() =>
    deps.storage.write(async tx => {
      await tx.lockRow('invitation', { invitation_id: id.ok })
      const d = db(tx)
      const record = await readInvitationRecord(d, id.ok)
      // 不属发起者的组织 ⇒ 同一个 DoesNotExist，不泄漏存在性
      if (record === undefined || record.issuer !== issuer.ok.organization) {
        return fail('invitationDoesNotExist')
      }
      if (!(await isSuperAdministrator(d, issuer.ok))) return fail('notAuthorized')
      // ④ 提交内先现读一次过期判定（OE S-8 反方向：已过期的不得再写终结记录）
      const step = withdrawStep(
        invitationState(record, deps.clock.now(), await existenceOne(d, record.issuer)),
      )
      if (step === 'alreadyConcluded' || step === 'unavailable') return fail(step)
      if (step === 'write') {
        await d
          .updateTable('invitation')
          .set({ settled: 'withdrawn' })
          .where('invitation_id', '=', record.id)
          .execute()
      }
      return succeed(undefined)
    }),
  )
  return 'failure' in outcome ? outcome : 'ok'
}

async function acceptInvitation(
  deps: Deps,
  accountInput: unknown,
  invitationInput: unknown,
): Promise<Outcome<TenantId, AcceptInvitationFailure>> {
  const account = parseAccountId(accountInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(account) || !isOk(id)) return fail('invalidInput')

  // 三段，不把账号读面嵌进本节点的存储事务：① 读邀请 → ② 账号已激活 → ③ 序列化的写提交内全部重判
  const located = await withStorage(() =>
    deps.storage.read(async tx => {
      const record = await readInvitationRecord(db(tx), id.ok)
      if (record === undefined) return fail('invitationDoesNotExist')
      if (record.invitedAccount !== account.ok) return fail('notTheInvitedAccount')
      return succeed(record.issuer)
    }),
  )
  if ('failure' in located) return located
  const issuer = located.ok

  const facts = await readAccountFacts(deps, account.ok)
  if ('failure' in facts) return facts
  // 已激活不回退（AI S-20）：读到已激活即可提交
  if (!facts.ok.activated) return fail('accountNotActivated')

  const tenant: TenantId = { organization: issuer, account: account.ok }
  const outcome = await withStorage(() =>
    deps.storage.write(async tx => {
      // ④ 受 S-17 序列化（R-3a）：成员写入前锁组织行；邀请行锁住防与撤回交错
      await tx.lockRow('organization', { organization_id: issuer })
      await tx.lockRow('invitation', { invitation_id: id.ok })
      const d = db(tx)
      const record = await readInvitationRecord(d, id.ok)
      if (record === undefined) return fail('invitationDoesNotExist')
      if (record.invitedAccount !== account.ok) return fail('notTheInvitedAccount')
      // ② 过期在写入的同一提交内重新求值（OE S-10）；三种来路折成一个布尔再映射（OE S-13）
      const state = invitationState(record, deps.clock.now(), await existenceOne(d, record.issuer))
      if (state === 'unavailable') return fail('unavailable')
      if (!acceptable(state)) return fail('offerNoLongerValid')
      const existing = await readMembership(d, tenant)
      if (existing?.effective === true) return fail('alreadyAnEffectiveMember')
      // S-39：同一个主键上置回有效——回来的是同一条记录、同一个 TenantId；角色取本次邀请指定的，不继承
      await d
        .insertInto('membership')
        .values({
          organization_id: tenant.organization,
          account_id: tenant.account,
          effective: 1,
          role: record.role,
        })
        .onConflict(oc =>
          oc
            .columns(['organization_id', 'account_id'])
            .doUpdateSet({ effective: 1, role: record.role }),
        )
        .execute()
      await d
        .updateTable('invitation')
        .set({ settled: 'accepted' })
        .where('invitation_id', '=', record.id)
        .execute()
      return succeed(tenant)
    }),
  )
  if ('failure' in outcome) return outcome
  deps.notify('membership.changed', { tenant, effective: true })
  return outcome
}

// ---- 隶属请求 ----

async function issueAffiliationRequest(
  deps: Deps,
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

  return withStorage(() =>
    deps.storage.write(async tx => {
      const d = db(tx)
      const own = await readOrganization(d, initiator.ok.organization)
      if (own?.kind === 'personal') return fail('personalOrganizationTakesNoPartInAffiliation')
      const other = await readOrganization(d, recipient.ok)
      if (other === undefined) return fail('organizationDoesNotExist')
      if (other.kind === 'personal') return fail('personalOrganizationTakesNoPartInAffiliation')
      if (!(await isSuperAdministrator(d, initiator.ok))) return fail('notAuthorized')
      // 一般的环与「己方已有上级」不在这里判，留给接受那一刻（S-30 正文）
      const now = deps.clock.now()
      if (now === 'unavailable') return fail('unavailable')
      const timing = timingFrom(now, ttl)
      if (!isOk(timing)) return fail('invalidOfferDuration')
      const id = mintIdentifier('AffiliationRequestId')
      await d
        .insertInto('affiliation_request')
        .values({
          affiliation_request_id: id,
          initiator: initiator.ok.organization,
          recipient: recipient.ok,
          direction: direction.ok,
          issued_at: timing.ok.issuedAt,
          expires_at: timing.ok.expiresAt,
          settled: null,
        })
        .execute()
      return succeed(id)
    }),
  )
}

async function withdrawAffiliationRequest(
  deps: Deps,
  initiatorInput: unknown,
  requestInput: unknown,
): Promise<Ack<WithdrawAffiliationRequestFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(initiator) || !isOk(id)) return fail('invalidInput')
  const outcome = await withStorage(() =>
    deps.storage.write(async tx => {
      await tx.lockRow('affiliation_request', { affiliation_request_id: id.ok })
      const d = db(tx)
      const record = await readAffiliationRequestRecord(d, id.ok)
      // 只对发起方成立；接收方撤不了别人发来的请求，同样收成 DoesNotExist
      if (record === undefined || record.initiator !== initiator.ok.organization) {
        return fail('affiliationRequestDoesNotExist')
      }
      if (!(await isSuperAdministrator(d, initiator.ok))) return fail('notAuthorized')
      const step = withdrawStep(
        requestState(record, deps.clock.now(), await existenceOne(d, record.recipient)),
      )
      if (step === 'alreadyConcluded' || step === 'unavailable') return fail(step)
      if (step === 'write') {
        await d
          .updateTable('affiliation_request')
          .set({ settled: 'withdrawn' })
          .where('affiliation_request_id', '=', record.id)
          .execute()
      }
      return succeed(undefined)
    }),
  )
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

/**
 * S-7：上级组织属性的两条写路径之一（接受隶属请求填值）。另一条是 organizations 里解除隶属的 `clearParent`。
 */
async function setParent(d: Db, child: OrganizationId, newParent: OrganizationId): Promise<void> {
  await d
    .updateTable('organization')
    .set({ parent: newParent })
    .where('organization_id', '=', child)
    .execute()
}

async function acceptAffiliationRequest(
  deps: Deps,
  acceptorInput: unknown,
  requestInput: unknown,
): Promise<Ack<AcceptAffiliationRequestFailure>> {
  const acceptor = parseTenantId(acceptorInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(acceptor) || !isOk(id)) return fail('invalidInput')
  const outcome = await withStorage(() =>
    deps.storage.write(async (tx: WriteTx) => {
      // R-3b：隶属写部署级序列化——链跨多个组织，按组织加锁不够
      await tx.lockSentinel(AFFILIATION_SENTINEL)
      await tx.lockRow('affiliation_request', { affiliation_request_id: id.ok })
      const d = db(tx)
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
        acceptor.ok.organization === record.recipient &&
        (await isSuperAdministrator(d, acceptor.ok))
      if (!authorized) return fail('notAuthorized')
      // ④① 过期重判，指向对象只有接收方组织
      const state = requestState(
        record,
        deps.clock.now(),
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
      await setParent(d, child, newParent)
      await d
        .updateTable('affiliation_request')
        .set({ settled: 'accepted' })
        .where('affiliation_request_id', '=', record.id)
        .execute()
      return succeed(undefined)
    }),
  )
  return 'failure' in outcome ? outcome : 'ok'
}

// ---- 读面 ----

async function readInvitation(
  deps: Deps,
  callerInput: OfferReader,
  invitationInput: unknown,
): Promise<Outcome<InvitationReading, ReadInvitationFailure>> {
  const caller = parseOfferReader(callerInput)
  const id = parseInvitationId(invitationInput)
  if (!isOk(caller) || !isOk(id)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      const record = await readInvitationRecord(d, id.ok)
      if (record === undefined) return fail('invitationDoesNotExist')
      // ② 两类人，与判别式一一对应；不满足 ⇒ DoesNotExist（不泄漏存在性）
      const allowed =
        caller.ok.kind === 'account'
          ? caller.ok.accountId === record.invitedAccount
          : caller.ok.tenantId.organization === record.issuer &&
            (await isSuperAdministrator(d, caller.ok.tenantId))
      if (!allowed) return fail('invitationDoesNotExist')
      const state = invitationState(record, deps.clock.now(), await existenceOne(d, record.issuer))
      if (state === 'unavailable') return fail('unavailable')
      return succeed(invitationReading(record, state))
    }),
  )
}

async function readAffiliationRequest(
  deps: Deps,
  callerInput: unknown,
  requestInput: unknown,
): Promise<Outcome<AffiliationRequestReading, ReadAffiliationRequestFailure>> {
  const caller = parseTenantId(callerInput)
  const id = parseAffiliationRequestId(requestInput)
  if (!isOk(caller) || !isOk(id)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      const record = await readAffiliationRequestRecord(d, id.ok)
      if (record === undefined) return fail('affiliationRequestDoesNotExist')
      const party =
        caller.ok.organization === record.initiator || caller.ok.organization === record.recipient
      if (!party || !(await isSuperAdministrator(d, caller.ok))) {
        return fail('affiliationRequestDoesNotExist')
      }
      const state = requestState(record, deps.clock.now(), await existenceOne(d, record.recipient))
      if (state === 'unavailable') return fail('unavailable')
      return succeed(requestReading(record, state))
    }),
  )
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

async function invitationsWhere(
  d: Db,
  column: keyof Pick<OgDatabase['invitation'], 'invited_account' | 'issuer_organization'>,
  value: string,
): Promise<readonly InvitationRecord[]> {
  const rows = await d
    .selectFrom('invitation')
    .selectAll()
    .where(column, '=', value)
    .orderBy('issued_at')
    .orderBy('invitation_id')
    .execute()
  return rows.map(decodeInvitation)
}

async function requestsWhere(
  d: Db,
  column: keyof Pick<OgDatabase['affiliation_request'], 'initiator' | 'recipient'>,
  value: string,
): Promise<readonly AffiliationRequestRecord[]> {
  const rows = await d
    .selectFrom('affiliation_request')
    .selectAll()
    .where(column, '=', value)
    .orderBy('issued_at')
    .orderBy('affiliation_request_id')
    .execute()
  return rows.map(decodeAffiliationRequest)
}

async function listReceivedInvitations(
  deps: Deps,
  accountInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<readonly InvitationReading[], ListReceivedInvitationsFailure>> {
  const account = parseAccountId(accountInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(account) || !isOk(includeSettled)) return fail('invalidInput')
  // ② 无授权前置：输入的 AccountId 就是调用者本人（入口层核实，S-42）；返回的全部内容以它为界
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      const records = await invitationsWhere(d, 'invited_account', account.ok)
      const now = deps.clock.now()
      const existence = await existenceOf(
        d,
        records.map(r => r.issuer),
      )
      const result = evaluateAll(
        records,
        r => invitationState(r, now, existence.get(r.issuer) ?? 'unavailable'),
        invitationReading,
        includeSettled.ok,
      )
      return result === 'unavailable' ? fail('unavailable') : succeed(result)
    }),
  )
}

async function listIssued(
  deps: Deps,
  tenantInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<IssuedOffers, ListIssuedFailure>> {
  const caller = parseTenantId(tenantInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(caller) || !isOk(includeSettled)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      if (!(await isSuperAdministrator(d, caller.ok))) return fail('notAuthorized')
      const organization = caller.ok.organization
      const invitations = await invitationsWhere(d, 'issuer_organization', organization)
      const requests = await requestsWhere(d, 'initiator', organization)
      const now = deps.clock.now()
      const existence = await existenceOf(d, [
        ...invitations.map(r => r.issuer),
        ...requests.map(r => r.recipient),
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
    }),
  )
}

async function listReceivedAffiliationRequests(
  deps: Deps,
  tenantInput: unknown,
  includeSettledInput?: unknown,
): Promise<Outcome<readonly AffiliationRequestReading[], ListReceivedAffiliationRequestsFailure>> {
  const caller = parseTenantId(tenantInput)
  const includeSettled = parseIncludeSwitch(includeSettledInput)
  if (!isOk(caller) || !isOk(includeSettled)) return fail('invalidInput')
  return withStorage(() =>
    deps.storage.read(async tx => {
      const d = db(tx)
      if (!(await isSuperAdministrator(d, caller.ok))) return fail('notAuthorized')
      const records = await requestsWhere(d, 'recipient', caller.ok.organization)
      const now = deps.clock.now()
      // 指向对象就是调用方自己的组织；读不到以异常上抛 ⇒ unavailable，绝不判成「不存在 ⇒ 全表过期」
      const existence = await existenceOf(
        d,
        records.map(r => r.recipient),
      )
      const result = evaluateAll(
        records,
        r => requestState(r, now, existence.get(r.recipient) ?? 'unavailable'),
        requestReading,
        includeSettled.ok,
      )
      return result === 'unavailable' ? fail('unavailable') : succeed(result)
    }),
  )
}

export function createOffersService(deps: Deps): OffersService {
  return {
    issueInvitation: (issuer, target, role, ttl) =>
      issueInvitation(deps, issuer, target, role, ttl),
    withdrawInvitation: (issuer, id) => withdrawInvitation(deps, issuer, id),
    acceptInvitation: (account, id) => acceptInvitation(deps, account, id),
    issueAffiliationRequest: (initiator, recipient, direction, ttl) =>
      issueAffiliationRequest(deps, initiator, recipient, direction, ttl),
    withdrawAffiliationRequest: (initiator, id) => withdrawAffiliationRequest(deps, initiator, id),
    acceptAffiliationRequest: (acceptor, id) => acceptAffiliationRequest(deps, acceptor, id),
    readInvitation: (caller, id) => readInvitation(deps, caller, id),
    readAffiliationRequest: (caller, id) => readAffiliationRequest(deps, caller, id),
    listReceivedInvitations: (account, includeSettled) =>
      listReceivedInvitations(deps, account, includeSettled),
    listIssued: (tenant, includeSettled) => listIssued(deps, tenant, includeSettled),
    listReceivedAffiliationRequests: (tenant, includeSettled) =>
      listReceivedAffiliationRequests(deps, tenant, includeSettled),
  }
}
