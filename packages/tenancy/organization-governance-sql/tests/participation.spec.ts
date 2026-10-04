import { afterEach, describe, expect, it } from 'vitest'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import {
  type Harness,
  bootOg,
  registeredUser,
  teamWith,
  okOf,
  countRows,
  rowsOf,
} from './support.ts'

const opened: Harness[] = []
afterEach(async () => {
  for (const h of opened.splice(0).reverse()) await h.dispose()
})
async function boot() {
  const h = await bootOg()
  opened.push(h)
  return h
}

describe('OG2 recipient decline', () => {
  it('invited account only; repeats preserve state and have no membership or event effect', async () => {
    const h = await boot(),
      team = await teamWith(h),
      user = await registeredUser(h),
      other = await registeredUser(h)
    const id = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const before = await countRows(h, 'membership'),
      events = h.events.length
    expect(await h.offers.declineInvitation(other.account, id)).toEqual({
      failure: 'invitationDoesNotExist',
    })
    expect(await h.offers.declineInvitation(user.account, id)).toBe('ok')
    h.clock.unavailable = true
    expect(await h.offers.declineInvitation(user.account, id)).toBe('ok')
    expect(
      okOf(await h.offers.readInvitation({ kind: 'account', accountId: user.account }, id)).state,
    ).toBe('declined')
    expect(await countRows(h, 'membership')).toBe(before)
    expect(h.events).toHaveLength(events)
    expect(await h.offers.acceptInvitation(user.account, id)).toEqual({
      failure: 'offerNoLongerValid',
    })
    expect(await h.offers.withdrawInvitation(team.owner, id)).toEqual({
      failure: 'alreadyConcluded',
    })
  })
  it('affiliation receiver needs current super role even for an already declined request', async () => {
    const h = await boot(),
      a = await teamWith(h),
      b = await teamWith(h, ['member', 'superAdministrator'])
    const id = okOf(
      await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent'),
    )
    const member = b.members[0],
      admin = b.members[1]
    if (!member || !admin) throw new Error('fixture members absent')
    expect(await h.offers.declineAffiliationRequest(a.owner, id)).toEqual({
      failure: 'affiliationRequestDoesNotExist',
    })
    expect(await h.offers.declineAffiliationRequest(member, id)).toEqual({
      failure: 'notAuthorized',
    })
    expect(await h.offers.declineAffiliationRequest(admin, id)).toBe('ok')
    expect(await h.memberships.changeRole(b.owner, admin, 'member')).toBe('ok')
    expect(await h.offers.declineAffiliationRequest(admin, id)).toEqual({
      failure: 'notAuthorized',
    })
    expect(await h.offers.declineAffiliationRequest(b.owner, id)).toBe('ok')
    expect(okOf(await h.offers.readAffiliationRequest(b.owner, id)).state).toBe('declined')
    expect(okOf(await h.organizations.read(a.organization)).parent).toBeNull()
  })
  it('expired or already accepted invitation cannot be declined or remove a member', async () => {
    const h = await boot(),
      team = await teamWith(h),
      user = await registeredUser(h)
    const expired = okOf(await h.offers.issueInvitation(team.owner, user.account, 'member', 1))
    h.clock.advance(2)
    expect(await h.offers.declineInvitation(user.account, expired)).toEqual({
      failure: 'alreadyConcluded',
    })
    const accepted = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const tenant = okOf(await h.offers.acceptInvitation(user.account, accepted))
    expect(await h.offers.declineInvitation(user.account, accepted)).toEqual({
      failure: 'alreadyConcluded',
    })
    expect(await h.memberships.standing(tenant)).toEqual({ standing: 'effective', role: 'member' })
  })
  it('concurrent acceptance, withdrawal and decline settle once', async () => {
    const h = await boot(),
      team = await teamWith(h),
      user = await registeredUser(h)
    const id = okOf(await h.offers.issueInvitation(team.owner, user.account))
    const results = await Promise.all([
      h.offers.declineInvitation(user.account, id),
      h.offers.acceptInvitation(user.account, id),
      h.offers.withdrawInvitation(team.owner, id),
    ])
    expect(results.filter(r => r === 'ok' || (typeof r === 'object' && 'ok' in r))).toHaveLength(1)
    const state = okOf(
      await h.offers.readInvitation({ kind: 'account', accountId: user.account }, id),
    ).state
    expect(['accepted', 'withdrawn', 'declined']).toContain(state)
    expect(
      await countRows(h, 'membership', {
        organization_id: team.organization,
        account_id: user.account,
      }),
    ).toBe(state === 'accepted' ? 1 : 0)
  })
})

describe('OG2 explicit participation', () => {
  it('notifications wait for the actual outer commit', async () => {
    const h = await boot(),
      team = await teamWith(h),
      user = await registeredUser(h)
    const before = h.events.length
    await h.storage.atomic(async unit => {
      const offers = h.offers.participate(unit)
      expect(await offers.issueInvitation(team.owner, user.account)).toHaveProperty('ok')
      expect(h.events).toHaveLength(before)
    })
    expect(h.events.slice(before).map(e => e.name)).toEqual(['invitation.issued'])
  })
  it('later unavailable rolls back created organization, creation key and all notifications', async () => {
    const h = await boot(),
      user = await registeredUser(h),
      target = await registeredUser(h)
    const organizations = await countRows(h, 'organization'),
      before = h.events.length
    await expect(
      h.storage.atomic(async unit => {
        const team = okOf(
          await h.organizations.participate(unit).createTeam(user.account, 'rollback-key'),
        )
        h.storage.failTables('invitation')
        await h.offers.participate(unit).issueInvitation(team.tenant, target.account)
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
    h.storage.heal()
    expect(await countRows(h, 'organization')).toBe(organizations)
    expect(await rowsOf(h, 'team_creation_key', { creation_key: 'rollback-key' })).toEqual([])
    expect(h.events).toHaveLength(before)
  })
  it('caught participant failure still poisons outer commit', async () => {
    const h = await boot(),
      user = await registeredUser(h)
    const before = await countRows(h, 'organization')
    await expect(
      h.storage.atomic(async unit => {
        await h.organizations.participate(unit).createTeam(user.account, 'poison-key')
        h.storage.failTables('organization')
        try {
          await h.organizations.participate(unit).read('missing')
        } catch (error) {
          expect(error).toBeInstanceOf(StorageUnavailable)
        }
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
    h.storage.heal()
    expect(await countRows(h, 'organization')).toBe(before)
  })
  it('participant excludes registration and fails across storage or after close', async () => {
    const h = await boot(),
      other = await boot()
    await expect(
      other.storage.atomic(async unit => {
        await h.organizations.participate(unit).read('missing')
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    const face = await h.storage.atomic(async unit => h.organizations.participate(unit))
    expect(Object.keys(face)).not.toContain('createPersonal')
    await expect(face.read('missing')).rejects.toBeInstanceOf(StorageDefect)
  })
})
