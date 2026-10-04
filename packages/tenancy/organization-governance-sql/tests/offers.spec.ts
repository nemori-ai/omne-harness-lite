// offers 服务面的操作级义务：S-23／S-30 时长两路、S-23 失败集合与必发事件、S-24／S-31 撤回四支、S-25 账号已激活、
// S-39 回来的是同一个租户、S-55／S-56 不泄漏、读时派生、列表面过滤默认、S-58／S-59／S-60 授权分档（十次）、S-60 发现路径。
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness-lite/identity-values'
import {
  AFFILIATION_TTL,
  INVITATION_TTL,
  type Harness,
  addAccount,
  bootOg,
  okOf,
  countRows,
  registeredUser,
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

describe('S-23／S-30 有效时长两路（同一次对比）', () => {
  it('邀请：缺席 ⇒ 邀请这一类的默认值；给了就按它；非正或不合形状 ⇒ invalidOfferDuration，不写任何东西', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const user = await registeredUser(h)
    const now = h.clock.current
    const byDefault = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const explicit = okOf(
      await h.offers.issueInvitation(team.owner, user.account, 'member', 'PT1H'),
    )
    const readAt = async (id: string) =>
      okOf(await h.offers.readInvitation({ kind: 'account', accountId: user.account }, id)).timing
    expect(await readAt(byDefault)).toEqual({ issuedAt: now, expiresAt: now + INVITATION_TTL })
    expect(await readAt(explicit)).toEqual({ issuedAt: now, expiresAt: now + 3_600_000 })
    const rows = await countRows(h, 'invitation')
    for (const bad of [0, -5, 1.5, 'P', 'PT', 'soon', null]) {
      expect(
        await h.offers.issueInvitation(team.owner, user.account, 'member', bad),
        String(bad),
      ).toEqual({
        failure: 'invalidOfferDuration',
      })
    }
    expect(await countRows(h, 'invitation')).toBe(rows)
  })

  it('隶属请求：缺席 ⇒ 隶属请求这一类的默认值（与邀请不共用）；非法 ⇒ invalidOfferDuration，不写', async () => {
    const h = await boot()
    const [a, b] = [await teamWith(h), await teamWith(h)]
    const now = h.clock.current
    const byDefault = okOf(
      await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent'),
    )
    const explicit = okOf(
      await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent', 90_000),
    )
    const readAt = async (id: string) =>
      okOf(await h.offers.readAffiliationRequest(b.owner, id)).timing
    expect(await readAt(byDefault)).toEqual({ issuedAt: now, expiresAt: now + AFFILIATION_TTL })
    expect(AFFILIATION_TTL).not.toBe(INVITATION_TTL)
    expect(await readAt(explicit)).toEqual({ issuedAt: now, expiresAt: now + 90_000 })
    const rows = await countRows(h, 'affiliation_request')
    for (const bad of [0, -1, 'P0D', 'yesterday']) {
      expect(
        await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent', bad),
      ).toEqual({ failure: 'invalidOfferDuration' })
    }
    expect(await countRows(h, 'affiliation_request')).toBe(rows)
  })
})

describe('S-23 发出邀请', () => {
  it('授权是超级管理员；目标须已激活、存在、尚非有效成员；账号读面不可用 ⇒ unavailable', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const stranger = await teamWith(h)
    const target = await registeredUser(h)
    const pending = await addAccount(h, { activated: false })
    expect(await h.offers.issueInvitation(team.members[0], target.account)).toEqual({
      failure: 'notAuthorized',
    })
    expect(
      await h.offers.issueInvitation(
        { organization: team.organization, account: stranger.owner.account },
        target.account,
      ),
    ).toEqual({ failure: 'notAuthorized' })
    expect(await h.offers.issueInvitation(team.owner, pending)).toEqual({
      failure: 'accountNotActivated',
    })
    expect(await h.offers.issueInvitation(team.owner, 'ghost')).toEqual({
      failure: 'accountDoesNotExist',
    })
    expect(await h.offers.issueInvitation(team.owner, team.members[0]!.account)).toEqual({
      failure: 'alreadyAnEffectiveMember',
    })
    h.accounts.unavailable = true
    expect(await h.offers.issueInvitation(team.owner, target.account)).toEqual({
      failure: 'unavailable',
    })
    h.accounts.unavailable = false
    expect(await countRows(h, 'invitation', { issuer_organization: team.organization })).toBe(1) // 只有夹具那一份
  })

  it('不幂等，每次一份新的；invitation.issued 必发，提交之后每份派发一次', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const user = await registeredUser(h)
    const before = h.events.length
    const i1 = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const i2 = okOf(await h.offers.issueInvitation(team.owner, user.account))
    expect(i1).not.toBe(i2)
    expect(h.events.slice(before)).toEqual([
      {
        name: 'invitation.issued',
        payload: { invitationId: i1, issuer: team.organization, invitedAccount: user.account },
      },
      {
        name: 'invitation.issued',
        payload: { invitationId: i2, issuer: team.organization, invitedAccount: user.account },
      },
    ])
  })

  it('监听者抛出不改变已提交的事实：操作照样返回成功，邀请在库里，异常留一条 error 日志', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const user = await registeredUser(h)
    h.assembly.ctx.on('invitation.issued', () => {
      throw new Error('listener exploded')
    })
    const issued = await h.offers.issueInvitation(team.owner, user.account)
    const id = okOf(issued)
    expect(await countRows(h, 'invitation', { invitation_id: id })).toBe(1)
    const logged = h.errorLogs().map(m => m.args.map(String).join(' '))
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain('listener exploded')
  })
})

describe('S-24／S-31 撤回四支同跑', () => {
  it('邀请：pending ⇒ ok 并写；再撤 ⇒ ok 仍一条；已 accepted ⇒ alreadyConcluded；已过期 ⇒ alreadyConcluded 且不写、仍读作 expired', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const [u1, u2, u3] = [await registeredUser(h), await registeredUser(h), await registeredUser(h)]
    const pending = okOf(await h.offers.issueInvitation(team.owner, u1.account))
    const accepted = okOf(await h.offers.issueInvitation(team.owner, u2.account))
    const expiring = okOf(await h.offers.issueInvitation(team.owner, u3.account, 'member', 1_000))
    okOf(await h.offers.acceptInvitation(u2.account, accepted))

    expect(await h.offers.withdrawInvitation(team.owner, pending)).toBe('ok')
    expect(await rowsOf(h, 'invitation', { invitation_id: pending })).toMatchObject([
      { settled: 'withdrawn' },
    ])
    expect(await h.offers.withdrawInvitation(team.owner, pending)).toBe('ok')
    expect(await countRows(h, 'invitation', { invitation_id: pending })).toBe(1)
    expect(await h.offers.withdrawInvitation(team.owner, accepted)).toEqual({
      failure: 'alreadyConcluded',
    })
    expect(await rowsOf(h, 'invitation', { invitation_id: accepted })).toMatchObject([
      { settled: 'accepted' },
    ])
    h.clock.advance(1_001)
    expect(await h.offers.withdrawInvitation(team.owner, expiring)).toEqual({
      failure: 'alreadyConcluded',
    })
    expect(await rowsOf(h, 'invitation', { invitation_id: expiring })).toMatchObject([
      { settled: null },
    ])
    expect(
      okOf(await h.offers.readInvitation({ kind: 'account', accountId: u3.account }, expiring))
        .state,
    ).toBe('expired')
  })

  it('隶属请求：同四支；不是发起方 ⇒ affiliationRequestDoesNotExist（接收方也撤不了）', async () => {
    const h = await boot()
    const [a, b, c, d, parent] = [
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
    ]
    const pending = okOf(
      await h.offers.issueAffiliationRequest(a.owner, parent.organization, 'recipientAsParent'),
    )
    const accepted = okOf(
      await h.offers.issueAffiliationRequest(b.owner, parent.organization, 'recipientAsParent'),
    )
    const expiring = okOf(
      await h.offers.issueAffiliationRequest(
        c.owner,
        parent.organization,
        'recipientAsParent',
        1_000,
      ),
    )
    expect(await h.offers.acceptAffiliationRequest(parent.owner, accepted)).toBe('ok')
    expect(await h.offers.withdrawAffiliationRequest(parent.owner, pending)).toEqual({
      failure: 'affiliationRequestDoesNotExist',
    })
    expect(await h.offers.withdrawAffiliationRequest(d.owner, pending)).toEqual({
      failure: 'affiliationRequestDoesNotExist',
    })
    expect(await h.offers.withdrawAffiliationRequest(a.owner, pending)).toBe('ok')
    expect(await h.offers.withdrawAffiliationRequest(a.owner, pending)).toBe('ok')
    expect(await countRows(h, 'affiliation_request', { affiliation_request_id: pending })).toBe(1)
    expect(await h.offers.withdrawAffiliationRequest(b.owner, accepted)).toEqual({
      failure: 'alreadyConcluded',
    })
    h.clock.advance(1_001)
    expect(await h.offers.withdrawAffiliationRequest(c.owner, expiring)).toEqual({
      failure: 'alreadyConcluded',
    })
    expect(
      await rowsOf(h, 'affiliation_request', { affiliation_request_id: expiring }),
    ).toMatchObject([{ settled: null }])
  })

  it('邀请不是你的组织发出的 ⇒ invitationDoesNotExist（与真不存在同值）；同组织普通成员 ⇒ notAuthorized', async () => {
    const h = await boot()
    const team = await teamWith(h, ['member'])
    const other = await teamWith(h)
    const user = await registeredUser(h)
    const id = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const foreign = await h.offers.withdrawInvitation(other.owner, id)
    expect(foreign).toEqual({ failure: 'invitationDoesNotExist' })
    expect(await h.offers.withdrawInvitation(other.owner, 'no-such-invitation')).toEqual(foreign)
    expect(await h.offers.withdrawInvitation(team.members[0], id)).toEqual({
      failure: 'notAuthorized',
    })
  })
})

describe('S-25 接受邀请', () => {
  it('不是被邀请的那个账号 ⇒ notTheInvitedAccount；不存在的邀请 ⇒ invitationDoesNotExist；都不建成员关系', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const [user, intruder] = [await registeredUser(h), await registeredUser(h)]
    const id = okOf(await h.offers.issueInvitation(team.owner, user.account))
    expect(await h.offers.acceptInvitation(intruder.account, id)).toEqual({
      failure: 'notTheInvitedAccount',
    })
    expect(await h.offers.acceptInvitation(user.account, 'missing')).toEqual({
      failure: 'invitationDoesNotExist',
    })
    expect(await countRows(h, 'membership', { organization_id: team.organization })).toBe(1)
  })

  it('②的账号已激活是提交时现读：构造未激活／已不存在 ⇒ accountNotActivated／accountDoesNotExist，没有成员关系被建起来', async () => {
    const h = await boot()
    const team = await teamWith(h)
    const [u1, u2] = [await registeredUser(h), await registeredUser(h)]
    const i1 = okOf(await h.offers.issueInvitation(team.owner, u1.account))
    const i2 = okOf(await h.offers.issueInvitation(team.owner, u2.account))
    // 构造态：本版没有让已激活账号退回或消失的路径，直接改库
    const raw = new DatabaseSync(h.file, { enableForeignKeyConstraints: false })
    try {
      raw.prepare('UPDATE account SET activated = 0 WHERE account_id = ?').run(u1.account)
      raw.prepare('DELETE FROM account WHERE account_id = ?').run(u2.account)
    } finally {
      raw.close()
    }
    expect(await h.offers.acceptInvitation(u1.account, i1)).toEqual({
      failure: 'accountNotActivated',
    })
    expect(await h.offers.acceptInvitation(u2.account, i2)).toEqual({
      failure: 'accountDoesNotExist',
    })
    expect(await countRows(h, 'membership', { organization_id: team.organization })).toBe(1)
    expect(await rowsOf(h, 'invitation', { invitation_id: i1 })).toMatchObject([{ settled: null }])
  })

  it('S-39 回来的是同一个租户：解除后再邀请并接受 ⇒ 同一行、同一个 TenantId、有效性翻回，角色不继承', async () => {
    const h = await boot()
    const team = await teamWith(h, ['superAdministrator'])
    const member = team.members[0]!
    const rowsBefore = await countRows(h, 'membership')
    expect(await h.memberships.remove(member, member)).toBe('ok')
    expect(
      await rowsOf(h, 'membership', {
        organization_id: member.organization,
        account_id: member.account,
      }),
    ).toEqual([
      {
        organization_id: member.organization,
        account_id: member.account,
        effective: 0,
        role: 'superAdministrator',
      },
    ])
    const again = okOf(await h.offers.issueInvitation(team.owner, member.account))
    const rejoined: TenantId = okOf(await h.offers.acceptInvitation(member.account, again))
    expect(rejoined).toEqual(member)
    expect(await countRows(h, 'membership')).toBe(rowsBefore)
    expect(
      await rowsOf(h, 'membership', {
        organization_id: member.organization,
        account_id: member.account,
      }),
    ).toEqual([
      {
        organization_id: member.organization,
        account_id: member.account,
        effective: 1,
        role: 'member',
      },
    ])
    expect(h.events.filter(e => e.name === 'membership.changed').slice(-2)).toEqual([
      { name: 'membership.changed', payload: { tenant: member, effective: false } },
      { name: 'membership.changed', payload: { tenant: member, effective: true } },
    ])
  })
})

describe('S-55／S-56 按标识定位的读面：授权与不泄漏', () => {
  it('第三方读一份存在的邀请／隶属请求 ⇒ DoesNotExist，与读一个真不存在的标识逐字相同（两支同跑）', async () => {
    const h = await boot()
    const [a, b, third] = [await teamWith(h, ['member']), await teamWith(h), await teamWith(h)]
    const user = await registeredUser(h)
    const outsider = await registeredUser(h)
    const invitation = okOf(await h.offers.issueInvitation(a.owner, user.account))
    const request = okOf(
      await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsChild'),
    )

    const readersOfInvitation = [
      { kind: 'account', accountId: outsider.account },
      { kind: 'tenant', tenantId: third.owner },
      { kind: 'tenant', tenantId: a.members[0]! }, // 发出组织的普通成员也不在两类人里
    ] as const
    for (const reader of readersOfInvitation) {
      const existing = await h.offers.readInvitation(reader, invitation)
      const missing = await h.offers.readInvitation(reader, 'no-such-invitation')
      expect(existing).toEqual({ failure: 'invitationDoesNotExist' })
      expect(existing).toEqual(missing)
    }
    for (const reader of [third.owner, a.members[0]!]) {
      const existing = await h.offers.readAffiliationRequest(reader, request)
      const missing = await h.offers.readAffiliationRequest(reader, 'no-such-request')
      expect(existing).toEqual({ failure: 'affiliationRequestDoesNotExist' })
      expect(existing).toEqual(missing)
    }
    // 两类人读得到：被邀请本人与发出组织的超管；隶属请求两端的超管
    expect(
      okOf(await h.offers.readInvitation({ kind: 'account', accountId: user.account }, invitation))
        .state,
    ).toBe('pending')
    expect(
      okOf(await h.offers.readInvitation({ kind: 'tenant', tenantId: a.owner }, invitation))
        .invitedAccount,
    ).toBe(user.account)
    expect(okOf(await h.offers.readAffiliationRequest(a.owner, request)).direction).toBe(
      'recipientAsChild',
    )
    expect(okOf(await h.offers.readAffiliationRequest(b.owner, request)).recipient).toBe(
      b.organization,
    )
  })
})

describe('读时派生（OE S-9 的落点）', () => {
  it('expiresAt 之前 pending、之后 expired，其间不写；默认列表过期后不再出现，而这不是一次写入', async () => {
    const h = await boot()
    const [a, b] = [await teamWith(h), await teamWith(h)]
    const user = await registeredUser(h)
    const invitation = okOf(await h.offers.issueInvitation(a.owner, user.account, 'member', 10_000))
    const request = okOf(
      await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent', 10_000),
    )
    const snapshot = async () => [
      await rowsOf(h, 'invitation', { invitation_id: invitation }),
      await rowsOf(h, 'affiliation_request', { affiliation_request_id: request }),
    ]
    const stored = await snapshot()
    const states = async () => [
      okOf(await h.offers.readInvitation({ kind: 'account', accountId: user.account }, invitation))
        .state,
      okOf(await h.offers.readAffiliationRequest(b.owner, request)).state,
      okOf(await h.offers.listReceivedInvitations(user.account)).length,
      okOf(await h.offers.listReceivedAffiliationRequests(b.owner)).length,
    ]
    expect(await states()).toEqual(['pending', 'pending', 1, 1])
    h.clock.advance(10_000) // now === expiresAt 仍可接受（严格不等号）
    expect(await states()).toEqual(['pending', 'pending', 1, 1])
    h.clock.advance(1)
    expect(await states()).toEqual(['expired', 'expired', 0, 0])
    expect(await snapshot()).toEqual(stored)
    // 开关打开时它们还在，带此刻求出的派生状态
    expect(
      okOf(await h.offers.listReceivedInvitations(user.account, true)).map(i => i.state),
    ).toEqual(['expired'])
    expect(
      okOf(await h.offers.listReceivedAffiliationRequests(b.owner, true)).map(i => i.state),
    ).toEqual(['expired'])
  })
})

describe('列表面的过滤开关有默认（S-57／S-58／S-60；S-59 见 memberships.spec）', () => {
  it('不给开关只拿 pending；给「连已终结的一起要」多出 accepted／withdrawn／expired，各带此刻的派生状态', async () => {
    const h = await boot()
    const [a, p1, p2, p3, p4] = [
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
      await teamWith(h),
    ]
    const users = [
      await registeredUser(h),
      await registeredUser(h),
      await registeredUser(h),
      await registeredUser(h),
    ]
    // 四份邀请发给同一个人不行（接受后成员有效）；S-57 用一个人从四个组织各收一份
    const target = users[0]!
    const inv = [
      okOf(await h.offers.issueInvitation(a.owner, target.account)),
      okOf(await h.offers.issueInvitation(p1.owner, target.account)),
      okOf(await h.offers.issueInvitation(p2.owner, target.account)),
      okOf(await h.offers.issueInvitation(p3.owner, target.account, 'member', 1_000)),
    ]
    okOf(await h.offers.acceptInvitation(target.account, inv[1]!))
    expect(await h.offers.withdrawInvitation(p2.owner, inv[2]!)).toBe('ok')
    // S-58：a 发出的邀请四份（给四个不同的人）与隶属请求四份
    const sent = [
      okOf(await h.offers.issueInvitation(a.owner, users[1]!.account)),
      okOf(await h.offers.issueInvitation(a.owner, users[2]!.account)),
      okOf(await h.offers.issueInvitation(a.owner, users[3]!.account, 'member', 1_000)),
    ]
    okOf(await h.offers.acceptInvitation(users[1]!.account, sent[0]!))
    expect(await h.offers.withdrawInvitation(a.owner, sent[1]!)).toBe('ok')
    // S-60：p4 收到四份隶属请求
    const incoming = [
      okOf(await h.offers.issueAffiliationRequest(p1.owner, p4.organization, 'recipientAsParent')),
      okOf(await h.offers.issueAffiliationRequest(p2.owner, p4.organization, 'recipientAsParent')),
      okOf(
        await h.offers.issueAffiliationRequest(
          p3.owner,
          p4.organization,
          'recipientAsParent',
          1_000,
        ),
      ),
      okOf(await h.offers.issueAffiliationRequest(a.owner, p4.organization, 'recipientAsParent')),
    ]
    expect(await h.offers.acceptAffiliationRequest(p4.owner, incoming[0]!)).toBe('ok')
    expect(await h.offers.withdrawAffiliationRequest(p2.owner, incoming[1]!)).toBe('ok')
    h.clock.advance(1_001)

    const states = <T extends { state: string }>(items: readonly T[]) =>
      items.map(i => i.state).sort()
    // S-57
    expect(states(okOf(await h.offers.listReceivedInvitations(target.account)))).toEqual([
      'pending',
    ])
    expect(states(okOf(await h.offers.listReceivedInvitations(target.account, true)))).toEqual([
      'accepted',
      'expired',
      'pending',
      'withdrawn',
    ])
    // S-58：两段各自过滤；a 发起的那份隶属请求（给 p4）仍 pending
    const issuedDefault = okOf(await h.offers.listIssued(a.owner))
    expect(states(issuedDefault.invitations)).toEqual(['pending'])
    expect(states(issuedDefault.affiliationRequests)).toEqual(['pending'])
    const issuedAll = okOf(await h.offers.listIssued(a.owner, true))
    expect(states(issuedAll.invitations)).toEqual(['accepted', 'expired', 'pending', 'withdrawn'])
    // S-60
    expect(states(okOf(await h.offers.listReceivedAffiliationRequests(p4.owner)))).toEqual([
      'pending',
    ])
    expect(states(okOf(await h.offers.listReceivedAffiliationRequests(p4.owner, true)))).toEqual([
      'accepted',
      'expired',
      'pending',
      'withdrawn',
    ])
  })
})

describe('S-58／S-59／S-60 授权分档（同一组织、三个调用方，十次同跑）', () => {
  it('超管三条全通且能看到已解除的；普通成员只拿到有效名单、另两条与「连无效的」都 notAuthorized；别组织成员全 notAuthorized', async () => {
    const h = await boot()
    const org = await teamWith(h, ['member', 'member'])
    const other = await teamWith(h, ['member'])
    const [admin, member, leaver] = [org.owner, org.members[0]!, org.members[1]!]
    const outsider = other.members[0]!
    expect(await h.memberships.remove(leaver, leaver)).toBe('ok') // 先有一位已解除的成员
    const peer = await teamWith(h)
    okOf(await h.offers.issueAffiliationRequest(peer.owner, org.organization, 'recipientAsParent'))

    // 超管：三条全通；「连无效的一起要」里有那位已解除的
    expect('ok' in (await h.offers.listIssued(admin))).toBe(true)
    expect(okOf(await h.offers.listReceivedAffiliationRequests(admin))).toHaveLength(1)
    const adminAll = okOf(await h.memberships.list(admin, true))
    expect(adminAll.find(m => m.tenant.account === leaver.account)).toEqual({
      tenant: leaver,
      role: 'member',
      effective: false,
    })
    // 普通成员：默认档拿到完整有效名单（没有那位已解除的）
    const memberView = okOf(await h.memberships.list(member))
    expect(memberView.map(m => m.tenant.account).sort()).toEqual(
      [admin.account, member.account].sort(),
    )
    expect(memberView.every(m => m.effective)).toBe(true)
    expect(await h.offers.listIssued(member)).toEqual({ failure: 'notAuthorized' })
    expect(await h.offers.listReceivedAffiliationRequests(member)).toEqual({
      failure: 'notAuthorized',
    })
    // 第十次：普通成员显式要「连无效的」⇒ notAuthorized，不静默按默认档返回
    expect(await h.memberships.list(member, true)).toEqual({ failure: 'notAuthorized' })
    // 另一个组织的成员拿着自己的 TenantId：只看得到自己组织；拿本组织的 organization 拼一个 TenantId 也不行
    const forged = { organization: org.organization, account: outsider.account }
    expect(await h.memberships.list(forged)).toEqual({ failure: 'notAuthorized' })
    expect(await h.offers.listIssued(forged)).toEqual({ failure: 'notAuthorized' })
    expect(await h.offers.listReceivedAffiliationRequests(forged)).toEqual({
      failure: 'notAuthorized',
    })
    // 已解除的那位也不再算本组织成员
    expect(await h.memberships.list(leaver)).toEqual({ failure: 'notAuthorized' })
  })
})

describe('S-60 是隶属请求唯一的发现路径', () => {
  it('A 发 → B 的超管不知道任何标识，列出收到的 → 拿到 id → 接受；链上没有带外传递的标识', async () => {
    const h = await boot()
    const [a, b] = [await teamWith(h), await teamWith(h)]
    const issued = await h.offers.issueAffiliationRequest(
      a.owner,
      b.organization,
      'recipientAsChild',
    )
    expect('ok' in issued).toBe(true) // 返回值不交给后面的步骤
    const found = okOf(await h.offers.listReceivedAffiliationRequests(b.owner))
    expect(found).toHaveLength(1)
    const [request] = found
    expect(request).toMatchObject({
      initiator: a.organization,
      recipient: b.organization,
      state: 'pending',
    })
    expect(await h.offers.acceptAffiliationRequest(b.owner, request!.id)).toBe('ok')
    expect(okOf(await h.organizations.read(b.organization)).parent).toBe(a.organization)
  })
})
