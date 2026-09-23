// S-16 第三类：25 个操作各传一次缺席／不合形状的身份参数 ⇒ invalidInput（不是 unavailable、不是 …DoesNotExist、
// 不是 notAuthorized），且发生在任何判定之前（本节点不发一条语句、不调账号读面）。
// 另：判别式收到集合外取值一律拒绝（IV S-32）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LoginStateId } from '@omne-harness-lite/identity-values'
import { StoredRecordMalformed } from '../src/index.ts'
import { type Harness, bootOg, registeredUser, teamWith } from './support.ts'

let h: Harness
beforeEach(async () => {
  h = await bootOg()
})
afterEach(async () => {
  await h.dispose()
})

const BAD_IDS: readonly unknown[] = [undefined, null, '', ' lead', 'trail\t', 7, {}, ['x']]
const BAD_TENANTS: readonly unknown[] = [
  undefined,
  null,
  'o:a',
  {},
  { organization: 'o' },
  { account: 'a' },
  { organization: 'o', account: '' },
  { organization: ' o', account: 'a' },
  { organization: 'o', account: 'a', role: 'member' },
]

describe('每个操作的 invalidInput（25 个操作，26 个方法）', () => {
  it('身份参数缺席或不合形状 ⇒ invalidInput，在任何存储读与账号读之前', async () => {
    const team = await teamWith(h, ['member'])
    const user = await registeredUser(h)
    const T = team.owner
    const A = user.account
    const O = team.organization
    const statements = h.storage.statements
    const accountReads = h.accounts.reads
    const cases: [string, (bad: unknown) => Promise<unknown> | unknown][] = [
      // organizations
      ['S-20 createPersonal', bad => h.organizations.createPersonal(bad)],
      ['S-21 createTeam', bad => h.organizations.createTeam(bad, 'key')],
      ['S-22 read', bad => h.organizations.read(bad)],
      ['S-33 dissolveAffiliation(initiator)', bad => h.organizations.dissolveAffiliation(bad, O)],
      ['S-33 dissolveAffiliation(child)', bad => h.organizations.dissolveAffiliation(T, bad)],
      ['S-34 ancestorChain', bad => h.organizations.ancestorChain(bad)],
      ['S-34 shareAncestor', bad => h.organizations.shareAncestor(O, bad)],
      ['S-35 scopeLayers', bad => h.organizations.scopeLayers(bad)],
      // offers
      ['S-23 issueInvitation(issuer)', bad => h.offers.issueInvitation(bad, A)],
      ['S-23 issueInvitation(target)', bad => h.offers.issueInvitation(T, bad)],
      ['S-24 withdrawInvitation', bad => h.offers.withdrawInvitation(T, bad)],
      ['S-25 acceptInvitation(account)', bad => h.offers.acceptInvitation(bad, 'inv')],
      ['S-25 acceptInvitation(id)', bad => h.offers.acceptInvitation(A, bad)],
      [
        'S-30 issueAffiliationRequest(recipient)',
        bad => h.offers.issueAffiliationRequest(T, bad, 'recipientAsParent'),
      ],
      [
        'S-30 issueAffiliationRequest(initiator)',
        bad => h.offers.issueAffiliationRequest(bad, O, 'recipientAsParent'),
      ],
      ['S-31 withdrawAffiliationRequest', bad => h.offers.withdrawAffiliationRequest(T, bad)],
      ['S-32 acceptAffiliationRequest', bad => h.offers.acceptAffiliationRequest(bad, 'req')],
      [
        'S-55 readInvitation(id)',
        bad => h.offers.readInvitation({ kind: 'account', accountId: A }, bad),
      ],
      ['S-56 readAffiliationRequest', bad => h.offers.readAffiliationRequest(T, bad)],
      ['S-57 listReceivedInvitations', bad => h.offers.listReceivedInvitations(bad)],
      ['S-58 listIssued', bad => h.offers.listIssued(bad)],
      [
        'S-60 listReceivedAffiliationRequests',
        bad => h.offers.listReceivedAffiliationRequests(bad),
      ],
      // memberships
      ['S-26 standing', bad => h.memberships.standing(bad)],
      ['S-27 mine', bad => h.memberships.mine(bad)],
      ['S-28 changeRole(target)', bad => h.memberships.changeRole(T, bad, 'member')],
      ['S-29 remove(initiator)', bad => h.memberships.remove(bad, T)],
      ['S-36 currentTenant', bad => h.memberships.currentTenant(bad as LoginStateId)],
      [
        'S-37 switchCurrentTenant(target)',
        bad => h.memberships.switchCurrentTenant('ls' as LoginStateId, bad),
      ],
      ['S-59 list', bad => h.memberships.list(bad)],
      // organization-purge
      ['S-53 purgePersonalOrganization', bad => h.purge.purgePersonalOrganization(bad)],
    ]
    const tenantShaped = new Set([
      'S-33 dissolveAffiliation(initiator)',
      'S-35 scopeLayers',
      'S-23 issueInvitation(issuer)',
      'S-30 issueAffiliationRequest(initiator)',
      'S-32 acceptAffiliationRequest',
      'S-58 listIssued',
      'S-60 listReceivedAffiliationRequests',
      'S-26 standing',
      'S-28 changeRole(target)',
      'S-29 remove(initiator)',
      'S-37 switchCurrentTenant(target)',
      'S-59 list',
    ])
    for (const [name, call] of cases) {
      const bads = tenantShaped.has(name) ? BAD_TENANTS : BAD_IDS
      for (const bad of bads) {
        expect(await call(bad), `${name} ← ${JSON.stringify(bad)}`).toEqual({
          failure: 'invalidInput',
        })
      }
    }
    expect(h.storage.statements).toBe(statements)
    expect(h.accounts.reads).toBe(accountReads)
  })
})

describe('判别式集合封闭：集合外取值一律 invalidInput，不走 else 分支、不映射到默认取值', () => {
  it('TenantRole（S-23／S-28）、方向（S-30）、S-55 调用方身份判别式、四条列表面的过滤开关', async () => {
    const team = await teamWith(h, ['member'])
    const other = await teamWith(h)
    const user = await registeredUser(h)
    const member = team.members[0]!
    const statements = h.storage.statements
    for (const role of ['owner', 'Member', 'SUPERADMINISTRATOR', '', null, 1]) {
      expect(await h.memberships.changeRole(team.owner, member, role)).toEqual({
        failure: 'invalidInput',
      })
      expect(await h.offers.issueInvitation(team.owner, user.account, role)).toEqual({
        failure: 'invalidInput',
      })
    }
    expect(await h.memberships.changeRole(team.owner, member, undefined)).toEqual({
      failure: 'invalidInput',
    })
    for (const direction of ['sideways', 'parent', undefined, null, 0]) {
      expect(
        await h.offers.issueAffiliationRequest(team.owner, other.organization, direction),
      ).toEqual({
        failure: 'invalidInput',
      })
    }
    const readers: unknown[] = [
      { kind: 'robot', accountId: user.account },
      { accountId: user.account }, // 没有判别式，不靠「哪个字段有值」去猜
      { kind: 'account', accountId: user.account, tenantId: team.owner }, // 两个都给
      { kind: 'tenant', accountId: user.account },
      'account',
      null,
    ]
    for (const reader of readers) {
      expect(await h.offers.readInvitation(reader as never, 'inv')).toEqual({
        failure: 'invalidInput',
      })
    }
    for (const flag of ['yes', 1, 0, null, 'true']) {
      expect(await h.offers.listReceivedInvitations(user.account, flag)).toEqual({
        failure: 'invalidInput',
      })
      expect(await h.offers.listIssued(team.owner, flag)).toEqual({ failure: 'invalidInput' })
      expect(await h.offers.listReceivedAffiliationRequests(team.owner, flag)).toEqual({
        failure: 'invalidInput',
      })
      expect(await h.memberships.list(team.owner, flag)).toEqual({ failure: 'invalidInput' })
    }
    for (const key of ['', ' k', 5]) {
      expect(await h.organizations.createTeam(user.account, key)).toEqual({
        failure: 'invalidInput',
      })
    }
    expect(h.storage.statements).toBe(statements)
  })

  it('OrganizationKind／成员记录角色没有作为输入的操作：存储里出现集合外取值是缺陷，上抛，不当成任何已知取值', async () => {
    const team = await teamWith(h)
    const user = await registeredUser(h)
    await h.raw.write(async tx => {
      await tx.db
        .updateTable('organization')
        .set({ kind: 'club' })
        .where('organization_id', '=', team.organization)
        .execute()
    })
    await expect(h.organizations.read(team.organization)).rejects.toBeInstanceOf(
      StoredRecordMalformed,
    )
    await expect(h.offers.issueInvitation(team.owner, user.account)).rejects.toBeInstanceOf(
      StoredRecordMalformed,
    )
    await h.raw.write(async tx => {
      await tx.db
        .updateTable('membership')
        .set({ role: 'owner' })
        .where('organization_id', '=', user.personal.organization)
        .execute()
    })
    await expect(h.memberships.standing(user.personal)).rejects.toBeInstanceOf(
      StoredRecordMalformed,
    )
    expect(await h.memberships.standing(team.owner)).toEqual({
      standing: 'effective',
      role: 'superAdministrator',
    })
  })
})
