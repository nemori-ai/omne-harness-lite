// memberships 服务面：S-26 成员资格判定、S-27 我的租户、S-28 调整角色、S-29 解除成员、
// S-36／S-37 当前租户身份、S-59 列出组织成员、S-14 ⑤ 残留选择记录清扫。
import {
  type AccountId,
  type LoginStateId,
  type MembershipStandingResult,
  type TenantId,
  isOk,
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  parseTenantRole,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { parseIncludeSwitch } from './input.ts'
import {
  type Db,
  countEffectiveSuperAdministrators,
  db,
  decodeMembership,
  isSuperAdministrator,
  readMembership,
  readOrganization,
  readOrganizationOwnedBy,
  standingIn,
} from './records.ts'
import { type Deps, type OperationContext, withOperation, withParticipation } from './runtime.ts'
import type {
  ChangeRoleFailure,
  CurrentTenantFailure,
  ListMembersFailure,
  MembershipReading,
  MembershipsService,
  MineFailure,
  RemoveMemberFailure,
  StandingFailure,
  SwitchCurrentTenantFailure,
} from '@omne-harness-lite/organization-governance'

async function standing(
  deps: OperationContext,
  tenantInput: unknown,
): Promise<MembershipStandingResult | { readonly failure: StandingFailure }> {
  const parsed = parseTenantId(tenantInput)
  if (!isOk(parsed)) return { failure: 'invalidInput' }
  // 每次现读（S-18）；读不到 ⇒ `{ failure: 'unavailable' }`，**不是** `ineffective`（S-9、S-26 ⑧）
  return deps.query(async tx => standingIn(db(tx), parsed.ok))
}

async function mine(
  deps: OperationContext,
  accountInput: unknown,
): Promise<Outcome<readonly TenantId[], MineFailure>> {
  const parsed = parseAccountId(accountInput)
  if (!isOk(parsed)) return fail('invalidInput')
  // 不判账号存在性（②）；读不到 ⇒ `unavailable`，空列表只在查询成功时返回（⑧）
  return deps.query(async tx => {
    const rows = await db(tx)
      .selectFrom('membership')
      .select(['organization_id', 'account_id', 'effective', 'role'])
      .where('account_id', '=', parsed.ok)
      .where('effective', '=', 1)
      .orderBy('organization_id')
      .execute()
    return succeed(rows.map(row => decodeMembership(row).tenant))
  })
}

/** 把 `target`（此刻是有效超管）从有效超管集合里拿掉之后，组织里还剩不剩有效超管。在调用方的写事务里现读。 */
async function leavesASuperAdministrator(d: Db, target: TenantId): Promise<boolean> {
  return (await countEffectiveSuperAdministrators(d, target.organization)) - 1 >= 1
}

async function changeRole(
  deps: OperationContext,
  initiatorInput: unknown,
  targetInput: unknown,
  roleInput: unknown,
): Promise<Ack<ChangeRoleFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const target = parseTenantId(targetInput)
  const role = parseTenantRole(roleInput)
  if (!isOk(initiator) || !isOk(target) || !isOk(role)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    // S-17：同组织成员写入序列化（R-3a，写事务开头锁组织行；sqlite 下由 BEGIN IMMEDIATE 兑现）
    await tx.lockRow('organization', { organization_id: target.ok.organization })
    const d = db(tx)
    const current = await readMembership(d, target.ok)
    if (current === undefined || !current.effective) return fail('membershipNotEffective')
    // ② 之后仍 ≥ 1 位有效超管；与写入同一提交（④：不得先查后写）。
    // 这一条排在发起者授权之前：两位超管同时降级／移除对方时，后成的一方此刻已不是超管，
    // 契约 S-29／S-48 与 flows §3.3 要它拿到与单次被拒相同的 wouldLeaveNoSuperAdministrator，而不是 notAuthorized
    if (current.role === 'superAdministrator' && role.ok !== 'superAdministrator') {
      if (!(await leavesASuperAdministrator(d, target.ok))) {
        return fail('wouldLeaveNoSuperAdministrator')
      }
    }
    const authorized =
      initiator.ok.organization === target.ok.organization &&
      (await isSuperAdministrator(d, initiator.ok))
    if (!authorized) return fail('notAuthorized')
    // ⑦ 幂等：已持有该角色 ⇒ ok，无二次效果、不发事件
    if (current.role === role.ok) return succeed(false)
    await d
      .updateTable('membership')
      .set({ role: role.ok })
      .where('organization_id', '=', target.ok.organization)
      .where('account_id', '=', target.ok.account)
      .execute()
    return succeed(true)
  })
  if ('failure' in outcome) return outcome
  if (outcome.ok)
    deps.notify('organization-governance/role-changed', { tenant: target.ok, role: role.ok })
  return 'ok'
}

async function remove(
  deps: OperationContext,
  initiatorInput: unknown,
  targetInput: unknown,
): Promise<Ack<RemoveMemberFailure>> {
  const initiator = parseTenantId(initiatorInput)
  const target = parseTenantId(targetInput)
  if (!isOk(initiator) || !isOk(target)) return fail('invalidInput')
  const outcome = await deps.mutate(async tx => {
    await tx.lockRow('organization', { organization_id: target.ok.organization })
    const d = db(tx)
    // ③ 结构性禁止先于授权：由 OrganizationKind 决定、与发起者无关（S-15）——超管在个人组织里也没有这个动作
    const organization = await readOrganization(d, target.ok.organization)
    if (organization?.kind === 'personal') return fail('personalOrganizationMemberCannotLeave')
    const current = await readMembership(d, target.ok)
    // ⑦ 幂等：已无效 ⇒ membershipNotEffective，无二次效果
    if (current === undefined || !current.effective) return fail('membershipNotEffective')
    // 之后仍 ≥ 1 位有效超管，先于授权判（理由同 changeRole：并发移除对方的后成者拿单次被拒的那个值）
    if (current.role === 'superAdministrator' && !(await leavesASuperAdministrator(d, target.ok))) {
      return fail('wouldLeaveNoSuperAdministrator')
    }
    // ② 本人（退出）或该组织的超级管理员（移除）
    const self = tenantIdEquals(initiator.ok, target.ok)
    const authorized =
      self ||
      (initiator.ok.organization === target.ok.organization &&
        (await isSuperAdministrator(d, initiator.ok)))
    if (!authorized) return fail('notAuthorized')
    // S-38：只把这条记录置为无效；不删持有、不铸新身份、不发清理指令
    await d
      .updateTable('membership')
      .set({ effective: 0 })
      .where('organization_id', '=', target.ok.organization)
      .where('account_id', '=', target.ok.account)
      .execute()
    return succeed(undefined)
  })
  if ('failure' in outcome) return outcome
  deps.notify('organization-governance/membership-changed', { tenant: target.ok, effective: false })
  return 'ok'
}

type LoginVerdict =
  | { readonly ok: AccountId }
  | { readonly failure: 'loginStateNotValid' | 'invalidInput' | 'unavailable' }

/**
 * S-4 四出口映射（登录状态校验面，AI S-17）。在本节点的存储事务**之外**调用，不嵌套。
 * `invalid-input` 只有绕过类型的调用方到得了：AI 对品牌参数在运行期仍先过 `parseLoginStateId`。
 */
async function verifyLogin(
  deps: OperationContext,
  loginStateId: LoginStateId,
): Promise<LoginVerdict> {
  const verdict = await deps.logins.verify(loginStateId)
  if ('ok' in verdict) return verdict
  switch (verdict.failure) {
    case 'login-state-rejected':
      return { failure: 'loginStateNotValid' }
    case 'invalid-input':
      return { failure: 'invalidInput' }
    case 'storage-unavailable':
      return { failure: 'unavailable' }
  }
}

async function currentTenant(
  deps: OperationContext,
  loginStateId: LoginStateId,
): Promise<Outcome<TenantId, CurrentTenantFailure>> {
  const verdict = await verifyLogin(deps, loginStateId)
  if ('failure' in verdict) return verdict
  const account = verdict.ok
  return deps.query(async tx => {
    const d = db(tx)
    const selection = await d
      .selectFrom('current_tenant_selection')
      .select(['organization_id', 'account_id'])
      .where('login_state_id', '=', loginStateId)
      .executeTakeFirst()
    if (selection !== undefined) {
      const tenant = parseTenantId({
        organization: selection.organization_id,
        account: selection.account_id,
      })
      if (!isOk(tenant)) throw new Error('current_tenant_selection row is malformed')
      return succeed(tenant.ok)
    }
    // 「尚未做过任何切换」是已读出的事实 ⇒ 初值 = (个人组织, 该账号)（S-14 第 1 条）。读失败走不到这里（⑧）。
    const personal = await readOrganizationOwnedBy(d, account)
    if (personal === undefined) {
      // 已通过登录校验的账号必已激活，已激活 ⇒ 恰有一个个人组织；读得到却没有是缺陷观测，不填别的初值
      deps.logger.error('current tenant: verified account %s has no personal organization', account)
      return fail('unavailable')
    }
    return succeed({ organization: personal.id, account })
  })
}

async function switchCurrentTenant(
  deps: OperationContext,
  loginStateId: LoginStateId,
  tenantInput: unknown,
): Promise<Ack<SwitchCurrentTenantFailure>> {
  // ① 表示层只判其余参数；登录状态参数原样交给 AI S-17（不在本节点 parse）
  const target = parseTenantId(tenantInput)
  if (!isOk(target)) return fail('invalidInput')
  const verdict = await verifyLogin(deps, loginStateId)
  if ('failure' in verdict) return verdict
  if (target.ok.account !== verdict.ok) return fail('notOwnTenant')
  const outcome = await deps.mutate(async tx => {
    const d = db(tx)
    // 目标成员资格现读；读不到 ⇒ unavailable，**不是** membershipNotEffective（⑧、S-52）
    const standingNow = await standingIn(d, target.ok)
    if (standingNow.standing !== 'effective') return fail('membershipNotEffective')
    // ⑦ 幂等：切到已选中的那个 ⇒ upsert 同值，无二次效果
    await d
      .insertInto('current_tenant_selection')
      .values({
        login_state_id: loginStateId,
        organization_id: target.ok.organization,
        account_id: target.ok.account,
      })
      .onConflict(oc =>
        oc.column('login_state_id').doUpdateSet({
          organization_id: target.ok.organization,
          account_id: target.ok.account,
        }),
      )
      .execute()
    return succeed(undefined)
  })
  return 'failure' in outcome ? outcome : 'ok'
}

async function list(
  deps: OperationContext,
  tenantInput: unknown,
  includeIneffectiveInput?: unknown,
): Promise<Outcome<readonly MembershipReading[], ListMembersFailure>> {
  const caller = parseTenantId(tenantInput)
  const includeIneffective = parseIncludeSwitch(includeIneffectiveInput)
  if (!isOk(caller) || !isOk(includeIneffective)) return fail('invalidInput')
  return deps.query(async tx => {
    const d = db(tx)
    // ② 两档分别授权：默认档 = 该组织的有效成员（任一角色）；连无效的一起要 = 该组织的超级管理员。
    // 被拒 ⇒ notAuthorized，不降级成默认档；判定读不到 ⇒ unavailable（⑧），不收成 notAuthorized
    const callerStanding = await standingIn(d, caller.ok)
    const authorized = includeIneffective.ok
      ? callerStanding.standing === 'effective' && callerStanding.role === 'superAdministrator'
      : callerStanding.standing === 'effective'
    if (!authorized) return fail('notAuthorized')
    let query = d
      .selectFrom('membership')
      .select(['organization_id', 'account_id', 'effective', 'role'])
      .where('organization_id', '=', caller.ok.organization)
    if (!includeIneffective.ok) query = query.where('effective', '=', 1)
    const rows = await query.orderBy('account_id').execute()
    return succeed(
      rows.map(row => {
        const record = decodeMembership(row)
        return { tenant: record.tenant, role: record.role, effective: record.effective }
      }),
    )
  })
}

/**
 * S-14 ⑤ 卫生工作：按页走完全部选择记录，对每条调 `logins.verify`；`login-state-rejected` ⇒ 删；
 * `storage-unavailable` ⇒ 本轮跳过该条；记录里的串解析不过或 AI 答 `invalid-input` 是缺陷，记 error 日志、跳过。
 * 本节点里 `parseLoginStateId` 只剩这一处调用点（以它为键的记录是 AI v2 S-30 第 10 行许可的来源）。
 * 自己这边的存储读不到 ⇒ 本轮结束（不进失败集合，下一轮再来）。触发与节奏归装配（G-13）。
 */
async function sweepStaleSelections(deps: Deps, batch: number): Promise<void> {
  if (!Number.isSafeInteger(batch) || batch <= 0) {
    throw new RangeError(`sweepStaleSelections: batch must be a positive integer, got ${batch}`)
  }
  let after: string | undefined
  for (;;) {
    let page: readonly string[]
    try {
      page = await deps.storage.read(async tx => {
        let query = db(tx)
          .selectFrom('current_tenant_selection')
          .select('login_state_id')
          .orderBy('login_state_id')
          .limit(batch)
        if (after !== undefined) query = query.where('login_state_id', '>', after)
        return (await query.execute()).map(row => row.login_state_id)
      })
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        deps.logger.info('sweep of stale tenant selections stopped: storage unavailable')
        return
      }
      throw error
    }
    for (const key of page) {
      const parsed = parseLoginStateId(key)
      if (!isOk(parsed)) {
        deps.logger.error('sweep: stored login_state_id %o is malformed; skipped', key)
        continue
      }
      try {
        await deps.storage.atomic(unit =>
          withParticipation(deps, unit, async context => {
            const verdict = await context.logins.verify(parsed.ok)
            if ('ok' in verdict) return
            if (verdict.failure === 'storage-unavailable')
              throw new StorageUnavailable('login validity unavailable')
            if (verdict.failure === 'invalid-input') {
              deps.logger.error('sweep: login state %s was rejected as invalid input; skipped', key)
              return
            }
            await context.mutate(async tx => {
              await db(tx)
                .deleteFrom('current_tenant_selection')
                .where('login_state_id', '=', parsed.ok)
                .execute()
            })
          }),
        )
      } catch (error) {
        if (!(error instanceof StorageUnavailable)) throw error
        deps.logger.info('sweep of stale tenant selections stopped: storage unavailable')
        return
      }
    }
    if (page.length < batch) return
    after = page[page.length - 1]
  }
}

export function createMembershipsService(deps: Deps): MembershipsService {
  return {
    standing: tenantId => withOperation(deps, context => standing(context, tenantId)),
    mine: accountId => withOperation(deps, context => mine(context, accountId)),
    changeRole: (initiator, target, role) =>
      withOperation(deps, context => changeRole(context, initiator, target, role)),
    remove: (initiator, target) =>
      withOperation(deps, context => remove(context, initiator, target)),
    currentTenant: loginStateId =>
      withOperation(deps, context => currentTenant(context, loginStateId)),
    switchCurrentTenant: (loginStateId, tenantId) =>
      withOperation(deps, context => switchCurrentTenant(context, loginStateId, tenantId)),
    list: (tenantId, includeIneffective) =>
      withOperation(deps, context => list(context, tenantId, includeIneffective)),
    sweepStaleSelections: batch => sweepStaleSelections(deps, batch),
    participate: unit => ({
      standing: tenantId => withParticipation(deps, unit, context => standing(context, tenantId)),
      mine: accountId => withParticipation(deps, unit, context => mine(context, accountId)),
      changeRole: (initiator, target, role) =>
        withParticipation(deps, unit, context => changeRole(context, initiator, target, role)),
      remove: (initiator, target) =>
        withParticipation(deps, unit, context => remove(context, initiator, target)),
      currentTenant: loginStateId =>
        withParticipation(deps, unit, context => currentTenant(context, loginStateId)),
      switchCurrentTenant: (loginStateId, tenantId) =>
        withParticipation(deps, unit, context =>
          switchCurrentTenant(context, loginStateId, tenantId),
        ),
      list: (tenantId, includeIneffective) =>
        withParticipation(deps, unit, context => list(context, tenantId, includeIneffective)),
    }),
  }
}
