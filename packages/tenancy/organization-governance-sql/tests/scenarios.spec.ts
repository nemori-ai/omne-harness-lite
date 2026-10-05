// capability.organization-governance v1 §十「规范场景」S-46～S-54：真 sqlite、真 Cordis 装配、包内替身。
// 归别处的写成带指向的 it.skip：S-49／S-50（跨契约，本版不做）、S-54 ⑥⑦（与 AI S-43 第 2 支同批，归波次 2 AR 批次）。
import { afterEach, describe, expect, it } from 'vitest'
import { verifyHandoffWarrant } from '@omne-harness-lite/identity-values'
import {
  type Harness,
  addAccount,
  bootOg,
  countRows,
  failureOf,
  issueLogin,
  okOf,
  registeredUser,
  rowsOf,
  teamWith,
  tempSqliteFile,
} from './support.ts'

const harnesses: Harness[] = []
afterEach(async () => {
  for (const h of harnesses.splice(0).reverse()) await h.dispose()
})
async function boot(file?: string): Promise<Harness> {
  const h = await bootOg(file === undefined ? {} : { file })
  harnesses.push(h)
  return h
}

describe('capability.organization-governance v1 · 规范场景', () => {
  it('S-46 邀约的三种收场（邀请）：接受／撤回／过期，②③与再接受一次逐字相同 offerNoLongerValid，无第二份效果', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const [accepted, withdrawn, expired] = [
      await registeredUser(h),
      await registeredUser(h),
      await registeredUser(h),
    ]
    const i1 = await h.offers.issueInvitation(team.owner, accepted.account)
    const i2 = await h.offers.issueInvitation(team.owner, withdrawn.account)
    const i3 = await h.offers.issueInvitation(team.owner, expired.account, undefined, 60_000)
    if (!('ok' in i1 && 'ok' in i2 && 'ok' in i3)) throw new Error('issue failed')

    // ① 接受 ⇒ 成员关系有效，返回 TenantId
    const r1 = await h.offers.acceptInvitation(accepted.account, i1.ok)
    expect(r1).toEqual({ ok: { organization: team.organization, account: accepted.account } })
    expect(
      await h.memberships.standing({ organization: team.organization, account: accepted.account }),
    ).toEqual({
      standing: 'effective',
      role: 'member',
    })
    // ② 撤回，③ 放到过期
    expect(await h.offers.withdrawInvitation(team.owner, i2.ok)).toBe('ok')
    h.clock.advance(60_001)
    const membershipsBefore = await countRows(h, 'membership', {
      organization_id: team.organization,
    })
    const r2 = await h.offers.acceptInvitation(withdrawn.account, i2.ok)
    const r3 = await h.offers.acceptInvitation(expired.account, i3.ok)
    // 第四支：对①已被接受的那一份再接受一次
    const r4 = await h.offers.acceptInvitation(accepted.account, i1.ok)
    expect(r2).toEqual({ failure: 'offerNoLongerValid' })
    expect(r3).toEqual(r2)
    expect(r4).toEqual(r2)
    // ②③④不产生任何效果：成员关系行数不变，被拒两人在该组织里没有记录
    expect(await countRows(h, 'membership', { organization_id: team.organization })).toBe(
      membershipsBefore,
    )
    expect(
      await rowsOf(h, 'membership', {
        organization_id: team.organization,
        account_id: withdrawn.account,
      }),
    ).toEqual([])
    expect(
      await rowsOf(h, 'membership', {
        organization_id: team.organization,
        account_id: expired.account,
      }),
    ).toEqual([])
  })

  it('S-46 邀约的三种收场（隶属请求）：接受只给上级属性填值、不产生租户；②③④逐字相同 offerNoLongerValid', async () => {
    const h = await boot()
    const parent = await teamWith(h)
    const [c1, c2, c3] = [await teamWith(h), await teamWith(h), await teamWith(h)]
    const ask = (child: typeof c1, ttl?: number) =>
      h.offers.issueAffiliationRequest(child.owner, parent.organization, 'recipientAsParent', ttl)
    const q1 = await ask(c1)
    const q2 = await ask(c2)
    const q3 = await ask(c3, 60_000)
    if (!('ok' in q1 && 'ok' in q2 && 'ok' in q3)) throw new Error('issue failed')
    const tenantsBefore = await countRows(h, 'membership')

    expect(await h.offers.acceptAffiliationRequest(parent.owner, q1.ok)).toBe('ok')
    expect(await h.organizations.read(c1.organization)).toEqual({
      ok: { id: c1.organization, kind: 'team', parent: parent.organization },
    })
    expect(await countRows(h, 'membership')).toBe(tenantsBefore) // 没有任何租户产生

    expect(await h.offers.withdrawAffiliationRequest(c2.owner, q2.ok)).toBe('ok')
    h.clock.advance(60_001)
    const r2 = await h.offers.acceptAffiliationRequest(parent.owner, q2.ok)
    const r3 = await h.offers.acceptAffiliationRequest(parent.owner, q3.ok)
    const r4 = await h.offers.acceptAffiliationRequest(parent.owner, q1.ok)
    expect(r2).toEqual({ failure: 'offerNoLongerValid' })
    expect(r3).toEqual(r2)
    expect(r4).toEqual(r2)
    for (const child of [c2, c3]) {
      expect(await h.organizations.read(child.organization)).toEqual({
        ok: { id: child.organization, kind: 'team', parent: null },
      })
    }
    expect(await countRows(h, 'membership')).toBe(tenantsBefore)
  })

  it('S-47 过期之后接受被拒，且没有中间状态（无后台清理；issuedAt + T 之后）', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const user = await registeredUser(h)
    const T = 5_000
    const invitation = await h.offers.issueInvitation(team.owner, user.account, 'member', T)
    if (!('ok' in invitation)) throw new Error('issue failed')
    const stored = await rowsOf(h, 'invitation', { invitation_id: invitation.ok })
    h.clock.advance(T + 1)
    expect(await h.offers.acceptInvitation(user.account, invitation.ok)).toEqual({
      failure: 'offerNoLongerValid',
    })
    // 成员关系与 TenantId 从头到尾没产生过；邀请行一个字段都没被改（expired 不是存下来的值）
    expect(
      await rowsOf(h, 'membership', {
        organization_id: team.organization,
        account_id: user.account,
      }),
    ).toEqual([])
    expect(
      await h.memberships.standing({ organization: team.organization, account: user.account }),
    ).toEqual({
      standing: 'ineffective',
    })
    expect(await rowsOf(h, 'invitation', { invitation_id: invitation.ok })).toEqual(stored)
  })

  it('S-48 并发移除／降级对方只有先成的一方成立（真并发：两个装配、两个存储连接、同一库文件）', async () => {
    const file = tempSqliteFile('s48')
    const a = await boot(file)
    const b = await boot(file) // 「不同地方」：各自一个 storage-sql 实例、一条写连接
    const kinds = [
      ['remove', 'remove'],
      ['demote', 'demote'],
      ['remove', 'demote'],
      ['demote', 'remove'],
    ] as const
    for (let round = 0; round < 12; round += 1) {
      const [kindA, kindB] = kinds[round % kinds.length]!
      const team = await teamWith(a, ['superAdministrator'])
      const x = team.owner
      const y = team.members[0]!
      const act = (h: Harness, kind: 'remove' | 'demote', initiator: typeof x, target: typeof x) =>
        kind === 'remove'
          ? h.memberships.remove(initiator, target)
          : h.memberships.changeRole(initiator, target, 'member')
      const results = await Promise.all([act(a, kindA, x, y), act(b, kindB, y, x)])
      const oks = results.filter(r => r === 'ok')
      const rejected = results.filter(r => r !== 'ok')
      expect(oks, `round ${round}`).toHaveLength(1)
      expect(rejected, `round ${round}`).toEqual([{ failure: 'wouldLeaveNoSuperAdministrator' }])
      // 组织自始至终有超管：恰剩一位有效超管，是先成的那一方
      const admins = okOf(await a.memberships.list(x, true))
      const effectiveAdmins = admins.filter(m => m.effective && m.role === 'superAdministrator')
      const winner = results[0] === 'ok' ? x : y
      expect(effectiveAdmins.map(m => m.tenant)).toEqual([winner])
    }
    // 单次被拒的那个值：唯一的超管降级自己
    const solo = await teamWith(a)
    expect(await a.memberships.changeRole(solo.owner, solo.owner, 'member')).toEqual({
      failure: 'wouldLeaveNoSuperAdministrator',
    })
  })

  it.skip('S-49 解除之后再加入，回来的是同一个租户——跨契约（资产 owner 一侧），本版不做；本包那一半见 memberships.spec「S-39」', () => {})

  it.skip('S-50 切换只影响此后新建的东西——跨契约（PF-015 会话契约尚无），本版不做', () => {})

  it('S-51 个人组织里没有这个动作：发起者是超管，三个结构性失败值；读组织的 kind 足以得出同一结论', async () => {
    const h = await boot()
    const owner = await registeredUser(h)
    const outsider = await registeredUser(h)
    const team = await teamWith(h)
    expect(await h.memberships.standing(owner.personal)).toEqual({
      standing: 'effective',
      role: 'superAdministrator',
    })
    expect(await h.offers.issueInvitation(owner.personal, outsider.account)).toEqual({
      failure: 'issuerIsPersonalOrganization',
    })
    expect(await h.memberships.remove(owner.personal, owner.personal)).toEqual({
      failure: 'personalOrganizationMemberCannotLeave',
    })
    expect(
      await h.offers.issueAffiliationRequest(
        owner.personal,
        team.organization,
        'recipientAsParent',
      ),
    ).toEqual({ failure: 'personalOrganizationTakesNoPartInAffiliation' })
    // 另一个方向也一样：团队组织请个人组织作上级
    expect(
      await h.offers.issueAffiliationRequest(
        team.owner,
        owner.personal.organization,
        'recipientAsParent',
      ),
    ).toEqual({ failure: 'personalOrganizationTakesNoPartInAffiliation' })
    // S-15：读面不发起操作就给出同一个结论
    expect(await h.organizations.read(owner.personal.organization)).toEqual({
      ok: { id: owner.personal.organization, kind: 'personal', parent: null },
    })
    // 没有任何写入发生
    expect(await countRows(h, 'invitation')).toBe(0)
    expect(await countRows(h, 'affiliation_request')).toBe(0)
  })

  it('S-52 成员资格不可用时明确失败：S-26／S-28／S-37 都是 unavailable，不是 ineffective／membershipNotEffective，也不回退', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const member = team.members[0]!
    const login = await issueLogin(h, member.account)
    const before = await h.memberships.currentTenant(login)
    h.storage.failTables('membership')
    expect(await h.memberships.standing(member)).toEqual({ failure: 'unavailable' })
    expect(await h.memberships.changeRole(team.owner, member, 'superAdministrator')).toEqual({
      failure: 'unavailable',
    })
    expect(await h.memberships.switchCurrentTenant(login, member)).toEqual({
      failure: 'unavailable',
    })
    h.storage.heal()
    // 不回退到个人范围：切换没有写入，当前租户身份仍是切换前那一个；角色也没被改
    expect(await h.memberships.currentTenant(login)).toEqual(before)
    expect(await h.memberships.standing(member)).toEqual({ standing: 'effective', role: 'member' })
  })

  describe('S-54 清除只对未激活账号成立', () => {
    it('①～⑤、⑧同一次演练对比：只在未激活且已过期时删，依据只在 ok 路径产出并绑定该 AccountId', async () => {
      const h = await boot()
      const expiredDeadline = h.clock.current + 1_000
      const now = h.clock.current
      // ①⑤ 未激活且已过留存期限
      const doomed = await addAccount(h, { activated: false, retentionDeadline: expiredDeadline })
      // ② 已激活
      const active = await addAccount(h, { activated: true })
      // ③ 未激活但仍在期限内
      const fresh = await addAccount(h, {
        activated: false,
        retentionDeadline: now + 30 * 86_400_000,
      })
      // ④ 构造态：未激活且已过期，但 owner_account 指向它的是一个 team 组织
      const oddball = await addAccount(h, { activated: false, retentionDeadline: expiredDeadline })
      // ⑧ 未激活且已过期，账号读面将以 storage-unavailable 失败
      const flaky = await addAccount(h, { activated: false, retentionDeadline: expiredDeadline })
      const personal = new Map<string, string>()
      for (const account of [doomed, active, fresh, flaky]) {
        const created = await h.organizations.createPersonal(account)
        if (!('ok' in created)) throw new Error(`createPersonal: ${created.failure}`)
        personal.set(account, created.ok.organization)
      }
      await h.raw.write(async tx => {
        await tx.db
          .insertInto('organization')
          .values({
            organization_id: 'constructed-team',
            kind: 'team',
            parent: null,
            owner_account: oddball,
            created_at: now,
          })
          .execute()
        await tx.db
          .insertInto('membership')
          .values({
            organization_id: 'constructed-team',
            account_id: oddball,
            effective: 1,
            role: 'superAdministrator',
          })
          .execute()
      })
      h.clock.advance(2_000) // 过了 doomed／oddball／flaky 的留存期限，没过 fresh 的

      const orgRows = async (id: string) => rowsOf(h, 'organization', { organization_id: id })
      const memberRows = async (id: string) => rowsOf(h, 'membership', { organization_id: id })

      // ① ok：组织与那条成员关系一起没了，拿到与该 AccountId 绑定的依据
      const r1 = await h.purge.purgePersonalOrganization(doomed)
      if (!('ok' in r1)) throw new Error(`① ${String(failureOf(r1))}`)
      expect(await orgRows(personal.get(doomed)!)).toEqual([])
      expect(await memberRows(personal.get(doomed)!)).toEqual([])
      expect(verifyHandoffWarrant(h.purgeVerificationKey, 'purge', doomed, r1.ok.warrant)).toBe(
        'ok',
      )
      expect(verifyHandoffWarrant(h.purgeVerificationKey, 'purge', fresh, r1.ok.warrant)).toBe(
        'invalid',
      )
      expect(
        verifyHandoffWarrant(h.purgeVerificationKey, 'activation', doomed, r1.ok.warrant),
      ).toBe('invalid')

      // ② 已激活 ⇒ accountIsActivated，组织原样还在
      const activeOrg = await orgRows(personal.get(active)!)
      expect(await h.purge.purgePersonalOrganization(active)).toEqual({
        failure: 'accountIsActivated',
      })
      expect(await orgRows(personal.get(active)!)).toEqual(activeOrg)

      // ③ 未激活但在期限内 ⇒ accountNotExpired，组织原样还在；随后注册仍能接着完成（个人组织仍可被认回）
      const freshOrg = await orgRows(personal.get(fresh)!)
      expect(await h.purge.purgePersonalOrganization(fresh)).toEqual({
        failure: 'accountNotExpired',
      })
      expect(await orgRows(personal.get(fresh)!)).toEqual(freshOrg)
      expect(await h.organizations.createPersonal(fresh)).toEqual({
        ok: {
          organization: personal.get(fresh),
          tenant: { organization: personal.get(fresh), account: fresh },
        },
      })

      // ④ 构造态 ⇒ organizationIsNotPersonal，不产生任何效果
      expect(await h.purge.purgePersonalOrganization(oddball)).toEqual({
        failure: 'organizationIsNotPersonal',
      })
      expect(await orgRows('constructed-team')).toHaveLength(1)
      expect(await memberRows('constructed-team')).toHaveLength(1)

      // ⑤ 幂等（账号仍在）：再调 ⇒ ok，仍返回依据，无二次效果
      const eventsBefore = h.events.length
      const r5 = await h.purge.purgePersonalOrganization(doomed)
      if (!('ok' in r5)) throw new Error(`⑤ ${String(failureOf(r5))}`)
      expect(verifyHandoffWarrant(h.purgeVerificationKey, 'purge', doomed, r5.ok.warrant)).toBe(
        'ok',
      )
      expect(h.events.slice(eventsBefore)).toEqual([]) // 幂等重入不再发 organization.purged

      // ⑧ 账号读面 storage-unavailable ⇒ unavailable，组织原样还在、不产出依据；不走「账号不存在」两支
      const flakyOrg = await orgRows(personal.get(flaky)!)
      h.accounts.unavailable = true
      expect(await h.purge.purgePersonalOrganization(flaky)).toEqual({ failure: 'unavailable' })
      h.accounts.unavailable = false
      expect(await orgRows(personal.get(flaky)!)).toEqual(flakyOrg)
      expect(h.errorLogs()).toEqual([]) // 不是缺陷观测支

      // 事件：只有①那一次，携带被清除的组织与账号；有意不发 membership.changed
      const purgeEvents = h.events.filter(
        e => e.name === 'organization-governance/organization-purged',
      )
      expect(purgeEvents).toEqual([
        {
          name: 'organization-governance/organization-purged',
          payload: { organization: personal.get(doomed), ownerAccount: doomed },
        },
      ])
      expect(
        h.events.filter(
          e =>
            e.name === 'organization-governance/membership-changed' &&
            (e.payload as { tenant: { account: string } }).tenant.account === doomed,
        ),
      ).toEqual([])
    })

    it.skip('S-54 ⑥ 幂等（账号也已不在：①之后真跑 AI S-38 再调）——须与 AI S-43 第 2 支同批真并发，归波次 2 AR 批次（W2-A）；本包 ②乙分支的替身构造测试见 organizations.spec「S-53 ②乙」', () => {})

    it.skip('S-54 ⑦ 缺陷观测（账号已不在、组织还在 ⇒ accountDoesNotExist，须与⑥挨着跑）——归波次 2 AR 批次（W2-A）；本包 ②乙分支的替身构造测试见 organizations.spec「S-53 ②乙」', () => {})
  })
})
