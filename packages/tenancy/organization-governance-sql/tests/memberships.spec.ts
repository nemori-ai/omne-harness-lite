// memberships 服务面的操作级义务：S-26 闭合和、S-27、S-28、S-29、S-36／S-37（含 E-4 运行期那一支）、S-59 过滤默认、
// S-14 ⑤ 残留清扫。
import { afterEach, describe, expect, it } from 'vitest'
import type { LoginStateId } from '@omne-harness-lite/identity-values'
import {
  type Harness,
  bootOg,
  countRows,
  issueLogin,
  okOf,
  registeredUser,
  revokeLogin,
  rowsOf,
  teamWith,
} from './support.ts'

const harnesses: Harness[] = []
afterEach(async () => {
  for (const h of harnesses.splice(0).reverse()) await h.dispose()
})
async function boot(): Promise<Harness> {
  const h = await bootOg()
  harnesses.push(h)
  return h
}

describe('S-26 成员资格判定：闭合和，三样都从返回值拿到', () => {
  it('effective（带角色）／ineffective（无记录或无效）／{failure: unavailable}／{failure: invalidInput}，一样都不抛', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    expect(await h.memberships.standing(team.owner)).toEqual({
      standing: 'effective',
      role: 'superAdministrator',
    })
    expect(await h.memberships.standing(member)).toEqual({ standing: 'effective', role: 'member' })
    expect(
      await h.memberships.standing({ organization: team.organization, account: 'nobody' }),
    ).toEqual({
      standing: 'ineffective',
    })
    expect(await h.memberships.remove(member, member)).toBe('ok')
    expect(await h.memberships.standing(member)).toEqual({ standing: 'ineffective' })
    expect(await h.memberships.standing({ organization: team.organization })).toEqual({
      failure: 'invalidInput',
    })
    h.storage.failEverything()
    await expect(h.memberships.standing(team.owner)).resolves.toEqual({ failure: 'unavailable' })
  })

  it('超管读不到成员的私域：成员个人组织下那个租户，对超管的账号判定为 ineffective', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    const memberPersonal = okOf(await h.memberships.mine(member.account))
    const personalOrg = memberPersonal.find(t => t.organization !== team.organization)!.organization
    expect(
      await h.memberships.standing({ organization: personalOrg, account: team.owner.account }),
    ).toEqual({ standing: 'ineffective' })
  })
})

describe('S-27 我的租户', () => {
  it('只列此刻有效的；不存在的账号得空列表（不泄漏存在性）；读不到 ⇒ unavailable，不是空列表', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    const mine = okOf(await h.memberships.mine(member.account))
    expect(mine).toHaveLength(2) // 个人组织 + 团队
    expect(mine).toContainEqual(member)
    expect(await h.memberships.remove(member, member)).toBe('ok')
    expect(okOf(await h.memberships.mine(member.account))).not.toContainEqual(member)
    expect(await h.memberships.mine('no-such-account')).toEqual({ ok: [] })
    h.storage.failTables('membership')
    expect(await h.memberships.mine(member.account)).toEqual({ failure: 'unavailable' })
  })
})

describe('S-28 调整角色／S-29 解除成员', () => {
  it('S-28：超管调整他人；普通成员 ⇒ notAuthorized；目标无效 ⇒ membershipNotEffective；已持有 ⇒ ok 无事件；改了发 role.changed', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member', 'member'])
    const [m1, m2] = team.members as [typeof team.owner, typeof team.owner]
    expect(await h.memberships.changeRole(m1, m2, 'superAdministrator')).toEqual({
      failure: 'notAuthorized',
    })
    const before = h.events.length
    expect(await h.memberships.changeRole(team.owner, m1, 'member')).toBe('ok')
    expect(h.events.slice(before)).toEqual([]) // 幂等：无二次效果、不发事件
    expect(await h.memberships.changeRole(team.owner, m1, 'superAdministrator')).toBe('ok')
    expect(h.events.slice(before)).toEqual([
      { name: 'role.changed', payload: { tenant: m1, role: 'superAdministrator' } },
    ])
    // 角色调整不改变 TenantId：还是同一行
    expect(
      await rowsOf(h, 'membership', { organization_id: m1.organization, account_id: m1.account }),
    ).toEqual([
      {
        organization_id: m1.organization,
        account_id: m1.account,
        effective: 1,
        role: 'superAdministrator',
      },
    ])
    expect(await h.memberships.remove(m2, m2)).toBe('ok')
    expect(await h.memberships.changeRole(team.owner, m2, 'superAdministrator')).toEqual({
      failure: 'membershipNotEffective',
    })
    // 另一个组织的超管管不到这里
    const other = await teamWith(h)
    expect(await h.memberships.changeRole(other.owner, m1, 'member')).toEqual({
      failure: 'notAuthorized',
    })
  })

  it('S-29：本人退出或超管移除；普通成员移除他人 ⇒ notAuthorized；已无效 ⇒ membershipNotEffective；最后一位超管 ⇒ wouldLeaveNoSuperAdministrator', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member', 'member', 'member'])
    const [m1, m2, m3] = team.members as [typeof team.owner, typeof team.owner, typeof team.owner]
    expect(await h.memberships.remove(m1, m2)).toEqual({ failure: 'notAuthorized' })
    expect(await h.memberships.remove(m1, m1)).toBe('ok')
    expect(await h.memberships.remove(team.owner, m2)).toBe('ok')
    expect(await h.memberships.remove(team.owner, m2)).toEqual({
      failure: 'membershipNotEffective',
    })
    expect(await h.memberships.remove(team.owner, team.owner)).toEqual({
      failure: 'wouldLeaveNoSuperAdministrator',
    })
    expect(await h.memberships.remove(m3, team.owner)).toEqual({
      failure: 'wouldLeaveNoSuperAdministrator',
    })
    expect(h.events.filter(e => e.name === 'membership.changed')).toContainEqual({
      name: 'membership.changed',
      payload: { tenant: m2, effective: false },
    })
    // 解除只改有效性：行还在，TenantId 不变
    expect(await countRows(h, 'membership', { organization_id: team.organization })).toBe(4)
  })
})

describe('S-36／S-37 当前租户身份', () => {
  it('初值是个人组织里的那个租户（不是一次写入）；切换写选择；切到已选中的 ⇒ ok；返回值不随成员失效改写', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    const login = await issueLogin(h, member.account)
    const personal = okOf(await h.memberships.mine(member.account)).find(
      t => t.organization !== team.organization,
    )!
    expect(await h.memberships.currentTenant(login)).toEqual({ ok: personal })
    expect(await countRows(h, 'current_tenant_selection')).toBe(0)
    expect(await h.memberships.switchCurrentTenant(login, member)).toBe('ok')
    expect(await h.memberships.switchCurrentTenant(login, member)).toBe('ok')
    expect(await countRows(h, 'current_tenant_selection')).toBe(1)
    expect(await h.memberships.currentTenant(login)).toEqual({ ok: member })
    // 另一个登录状态的选择互不影响
    const otherLogin = await issueLogin(h, member.account)
    expect(await h.memberships.currentTenant(otherLogin)).toEqual({ ok: personal })
    // 成员关系失效：不把选择悄悄改回个人组织（S-14 末段）
    expect(await h.memberships.remove(team.owner, member)).toBe('ok')
    expect(await h.memberships.currentTenant(login)).toEqual({ ok: member })
    expect(await h.memberships.switchCurrentTenant(login, member)).toEqual({
      failure: 'membershipNotEffective',
    })
  })

  it('S-4 四出口：rejected ⇒ loginStateNotValid；校验读不到 ⇒ unavailable；选择本身读不到 ⇒ unavailable，不收成初值', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const login = await issueLogin(h, user.account)
    const other = await registeredUser(h)
    expect(await h.memberships.switchCurrentTenant(login, other.personal)).toEqual({
      failure: 'notOwnTenant',
    })
    h.logins.unavailable = true
    expect(await h.memberships.currentTenant(login)).toEqual({ failure: 'unavailable' })
    expect(await h.memberships.switchCurrentTenant(login, user.personal)).toEqual({
      failure: 'unavailable',
    })
    h.logins.unavailable = false
    h.storage.failTables('current_tenant_selection')
    expect(await h.memberships.currentTenant(login)).toEqual({ failure: 'unavailable' })
    h.storage.heal()
    await revokeLogin(h, login)
    expect(await h.memberships.currentTenant(login)).toEqual({ failure: 'loginStateNotValid' })
    expect(await h.memberships.switchCurrentTenant(login, user.personal)).toEqual({
      failure: 'loginStateNotValid',
    })
  })

  it('E-4 运行期那一支：绕过类型送非法表示 ⇒ invalidInput（不是 loginStateNotValid／unavailable），且本节点没有读存储', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const statements = h.storage.statements
    for (const bad of ['', ' padded', 'trailing\n', 42, undefined]) {
      const forged = bad as unknown as LoginStateId
      expect(await h.memberships.currentTenant(forged), String(bad)).toEqual({
        failure: 'invalidInput',
      })
      expect(await h.memberships.switchCurrentTenant(forged, user.personal)).toEqual({
        failure: 'invalidInput',
      })
    }
    expect(h.storage.statements).toBe(statements)
    // 目标 TenantId 不合形状 ⇒ invalidInput，在调用登录状态校验之前
    const login = await issueLogin(h, user.account)
    const verifies = h.logins.verifies
    expect(await h.memberships.switchCurrentTenant(login, { organization: 'x' })).toEqual({
      failure: 'invalidInput',
    })
    expect(h.logins.verifies).toBe(verifies)
  })
})

describe('S-59 列出组织成员：过滤开关有默认', () => {
  it('不给开关只拿有效的；超管给「连无效的一起要」多出已解除的，每项带有效性', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member', 'member'])
    const [m1, m2] = team.members as [typeof team.owner, typeof team.owner]
    expect(await h.memberships.remove(m2, m2)).toBe('ok')
    const byDefault = okOf(await h.memberships.list(team.owner))
    expect(byDefault.map(m => m.tenant)).toEqual(expect.arrayContaining([team.owner, m1]))
    expect(byDefault).toHaveLength(2)
    const all = okOf(await h.memberships.list(team.owner, true))
    expect(all).toHaveLength(3)
    expect(all.find(m => JSON.stringify(m.tenant) === JSON.stringify(m2))?.effective).toBe(false)
  })
})

describe('S-14 ⑤ 残留选择记录清扫（卫生工作）', () => {
  it('登录状态被拒的选择记录被删，仍有效的保留；按页走完全部；登录校验不可用时一条也不删', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    const logins: LoginStateId[] = []
    for (let i = 0; i < 5; i += 1) {
      const login = await issueLogin(h, member.account)
      expect(await h.memberships.switchCurrentTenant(login, member)).toBe('ok')
      logins.push(login)
    }
    await revokeLogin(h, logins[0]!)
    await revokeLogin(h, logins[3]!)
    h.logins.unavailable = true
    await h.memberships.sweepStaleSelections(2)
    expect(await countRows(h, 'current_tenant_selection')).toBe(5)
    h.logins.unavailable = false
    await h.memberships.sweepStaleSelections(2)
    const remaining = (await rowsOf(h, 'current_tenant_selection'))
      .map(r => r['login_state_id'])
      .sort()
    expect(remaining).toEqual([logins[1], logins[2], logins[4]].sort())
    await expect(h.memberships.sweepStaleSelections(0)).rejects.toThrow(RangeError)
  })

  it('本节点存储读不到 ⇒ 本轮结束，不抛、不进失败集合', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const login = await issueLogin(h, user.account)
    expect(await h.memberships.switchCurrentTenant(login, user.personal)).toBe('ok')
    await revokeLogin(h, login)
    h.storage.failTables('current_tenant_selection')
    await expect(h.memberships.sweepStaleSelections(10)).resolves.toBeUndefined()
    h.storage.heal()
    expect(await countRows(h, 'current_tenant_selection')).toBe(1)
  })
})
