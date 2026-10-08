// 故障注入：读面的不全与授权判定不可用（S-55～S-60 ⑧，两路 a／b）、过期判定的存在性读面不可用（OE S-20）、
// 时间源不可用。所有这些都必须是 unavailable：不写终结记录、不产生效果、不返回残缺或空的列表。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type Harness,
  bootOg,
  countRows,
  okOf,
  registeredUser,
  rowsOf,
  teamWith,
} from './support.ts'

let h: Harness
beforeEach(async () => {
  h = await bootOg()
})
afterEach(async () => {
  await h.dispose()
})

/** 一个组织：发出了邀请与隶属请求、也收到了隶属请求，便于每条读面都有非空的内容。 */
async function world() {
  const org = await teamWith(h, ['member'])
  const peer = await teamWith(h)
  const parent = await teamWith(h)
  const user = await registeredUser(h)
  const invitation = okOf(await h.offers.issueInvitation(org.owner, user.account))
  const outgoing = okOf(
    await h.offers.issueAffiliationRequest(org.owner, parent.organization, 'recipientAsParent'),
  )
  const incoming = okOf(
    await h.offers.issueAffiliationRequest(peer.owner, org.organization, 'recipientAsParent'),
  )
  return { org, peer, parent, user, invitation, outgoing, incoming }
}

describe('(a) 底层读面部分不可用：S-59／S-60 不返回少了几行的列表', () => {
  it('授权判定读成功之后，列表那一次读失败 ⇒ unavailable', async () => {
    const w = await world()
    let membershipReads = 0
    h.storage.failWhen = tables => tables.has('membership') && ++membershipReads === 2
    expect(await h.memberships.list(w.org.owner)).toEqual({ failure: 'unavailable' })
    h.storage.failTables('affiliation_request')
    expect(await h.offers.listReceivedAffiliationRequests(w.org.owner)).toEqual({
      failure: 'unavailable',
    })
    h.storage.failTables('invitation')
    expect(await h.offers.listIssued(w.org.owner)).toEqual({ failure: 'unavailable' })
    expect(await h.offers.listReceivedInvitations(w.user.account)).toEqual({
      failure: 'unavailable',
    })
  })
})

describe('(b) 授权判定的成员资格读不到 ⇒ unavailable，不是 DoesNotExist、不是 notAuthorized', () => {
  it('S-55（tenant 支）、S-56、S-58、S-59、S-60 五处', async () => {
    const w = await world()
    h.storage.failTables('membership')
    expect(
      await h.offers.readInvitation({ kind: 'tenant', tenantId: w.org.owner }, w.invitation),
    ).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.readAffiliationRequest(w.org.owner, w.outgoing)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.listIssued(w.org.owner)).toEqual({ failure: 'unavailable' })
    expect(await h.memberships.list(w.org.owner)).toEqual({ failure: 'unavailable' })
    expect(await h.memberships.list(w.org.members[0], true)).toEqual({ failure: 'unavailable' })
    expect(await h.offers.listReceivedAffiliationRequests(w.org.owner)).toEqual({
      failure: 'unavailable',
    })
  })
})

describe('过期判定的存在性读面不可用 ⇒ unavailable（OE S-20），绝不判成「组织不存在 ⇒ 已过期」', () => {
  it('撤回不写终结记录；接受不产生任何效果；读面不返回派生状态、不返回残缺或空的列表（九处）', async () => {
    const w = await world()
    const snapshot = async () => [
      await rowsOf(h, 'invitation'),
      await rowsOf(h, 'affiliation_request'),
      await rowsOf(h, 'membership'),
      await rowsOf(h, 'organization'),
    ]
    const before = await snapshot()
    h.storage.failTables('organization')
    // 撤回 ×2
    expect(await h.offers.withdrawInvitation(w.org.owner, w.invitation)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.withdrawAffiliationRequest(w.org.owner, w.outgoing)).toEqual({
      failure: 'unavailable',
    })
    // 接受 ×2
    expect(await h.offers.acceptInvitation(w.user.account, w.invitation)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.acceptAffiliationRequest(w.org.owner, w.incoming)).toEqual({
      failure: 'unavailable',
    })
    // 读 ×5（S-55～S-58、S-60）
    expect(
      await h.offers.readInvitation({ kind: 'account', accountId: w.user.account }, w.invitation),
    ).toEqual({ failure: 'unavailable' })
    expect(await h.offers.readAffiliationRequest(w.parent.owner, w.outgoing)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.listReceivedInvitations(w.user.account)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.listIssued(w.org.owner)).toEqual({ failure: 'unavailable' })
    expect(await h.offers.listReceivedAffiliationRequests(w.org.owner)).toEqual({
      failure: 'unavailable',
    })
    h.storage.heal()
    expect(await snapshot()).toEqual(before)
    // 恢复之后派生状态仍是 pending：一次抖动没有被写成永久失效
    expect(
      okOf(
        await h.offers.readInvitation({ kind: 'account', accountId: w.user.account }, w.invitation),
      ).state,
    ).toBe('pending')
    expect(okOf(await h.offers.listReceivedAffiliationRequests(w.org.owner))).toHaveLength(1)
  })
})

describe('时间源不可用 ⇒ unavailable', () => {
  it('发出、撤回、接受、读面都不放行、不判成已失效、不写', async () => {
    const w = await world()
    const invitations = await countRows(h, 'invitation')
    const invitee = await registeredUser(h)
    h.clock.unavailable = true
    expect(await h.offers.issueInvitation(w.org.owner, invitee.account)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.withdrawInvitation(w.org.owner, w.invitation)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.acceptInvitation(w.user.account, w.invitation)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.acceptAffiliationRequest(w.org.owner, w.incoming)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.offers.listReceivedInvitations(w.user.account)).toEqual({
      failure: 'unavailable',
    })
    expect(
      await h.offers.issueAffiliationRequest(
        w.peer.owner,
        w.parent.organization,
        'recipientAsChild',
      ),
    ).toEqual({
      failure: 'unavailable',
    })
    expect(await h.organizations.createTeam(w.user.account, 'test organization')).toEqual({
      failure: 'unavailable',
    })
    h.clock.unavailable = false
    expect(await countRows(h, 'invitation')).toBe(invitations)
    expect(await rowsOf(h, 'invitation', { invitation_id: w.invitation })).toMatchObject([
      { settled: null },
    ])
  })
})
