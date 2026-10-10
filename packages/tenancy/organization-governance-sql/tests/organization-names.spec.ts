import { afterEach, describe, expect, it } from 'vitest'
import { bootOg, countRows, registeredUser, rowsOf, type Harness } from './support.ts'

const harnesses: Harness[] = []
afterEach(async () => {
  for (const harness of harnesses.splice(0).reverse()) await harness.dispose()
})
async function boot(file?: string): Promise<Harness> {
  const harness = await bootOg(file === undefined ? {} : { file })
  harnesses.push(harness)
  return harness
}

describe('center-owned organization names', () => {
  it('stores the team name with the organization and its first administrator', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const result = await h.organizations.createTeam(user.account, '研发团队', 'create-team')
    expect(result).toHaveProperty('ok')
    if (!('ok' in result)) throw new Error('team creation failed')
    expect(await h.organizations.read(result.ok.organization)).toEqual({
      ok: { id: result.ok.organization, kind: 'team', parent: null, name: '研发团队' },
    })
    expect(await h.memberships.standing(result.ok.tenant)).toEqual({
      standing: 'effective',
      role: 'superAdministrator',
    })
    expect(await rowsOf(h, 'organization', { organization_id: result.ok.organization })).toEqual([
      expect.objectContaining({ name: '研发团队' }),
    ])
  })

  it('reads the persisted name after the provider closes and reopens', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const result = await h.organizations.createTeam(user.account, 'shared name')
    if (!('ok' in result)) throw new Error('team creation failed')
    const file = h.file
    await h.dispose()
    harnesses.splice(harnesses.indexOf(h), 1)
    const reopened = await boot(file)
    expect(await reopened.organizations.read(result.ok.organization)).toEqual({
      ok: { id: result.ok.organization, kind: 'team', parent: null, name: 'shared name' },
    })
  })

  it('allows the same name for distinct identities without a creation key', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const a = await h.organizations.createTeam(user.account, 'same name')
    const b = await h.organizations.createTeam(user.account, 'same name')
    if (!('ok' in a && 'ok' in b)) throw new Error('team creation failed')
    expect(a.ok.organization).not.toBe(b.ok.organization)
    expect(await countRows(h, 'organization', { kind: 'team' })).toBe(2)
  })

  it.each([undefined, null, '', ' \t\n', 42, {}, ['name']])(
    'rejects an invalid name without creating records: %j',
    async name => {
      const h = await boot()
      const user = await registeredUser(h)
      const beforeMembers = await countRows(h, 'membership')
      expect(await h.organizations.createTeam(user.account, name, 'bad-name')).toEqual({
        failure: 'invalidInput',
      })
      expect(await countRows(h, 'organization', { kind: 'team' })).toBe(0)
      expect(await countRows(h, 'membership')).toBe(beforeMembers)
      expect(await countRows(h, 'team_creation_key')).toBe(0)
    },
  )

  it('replays the same creator, key and name without changing persisted facts', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const first = await h.organizations.createTeam(user.account, 'original', 'stable-key')
    expect(await h.organizations.createTeam(user.account, 'original', 'stable-key')).toEqual(first)
    expect(await countRows(h, 'organization', { kind: 'team' })).toBe(1)
  })

  it('rejects a retained creation key with a different name without renaming or creating', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    const first = await h.organizations.createTeam(user.account, 'original', 'stable-key')
    if (!('ok' in first)) throw new Error('team creation failed')
    expect(await h.organizations.createTeam(user.account, 'replacement', 'stable-key')).toEqual({
      failure: 'invalidInput',
    })
    expect(await h.organizations.read(first.ok.organization)).toHaveProperty('ok.name', 'original')
    expect(await countRows(h, 'organization', { kind: 'team' })).toBe(1)
    expect(await countRows(h, 'team_creation_key')).toBe(1)
  })

  it('uses the fixed initial name for the automatically created personal organization', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    expect(await h.organizations.read(user.personal.organization)).toHaveProperty(
      'ok.name',
      '个人组织',
    )
  })

  it('rolls back the organization, name and creation key when membership insertion fails', async () => {
    const h = await boot()
    const user = await registeredUser(h)
    h.storage.failTables('membership')
    expect(await h.organizations.createTeam(user.account, 'atomic name', 'atomic-key')).toEqual({
      failure: 'unavailable',
    })
    h.storage.heal()
    expect(await countRows(h, 'organization', { kind: 'team' })).toBe(0)
    expect(await countRows(h, 'team_creation_key')).toBe(0)
  })
})
