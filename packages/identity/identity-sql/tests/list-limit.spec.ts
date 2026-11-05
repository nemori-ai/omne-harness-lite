// @module-tag slow
// SPEC IS-13, identity ID-18 list completeness: a governance list is whole or absent. A list of
// 1000 entries is answered whole; with one entry more the read fails and the provider answers
// `basis-unavailable` with no list. It never cuts the list to the limit. Slow: 1001 invitations,
// each a read and a commit on the real SQLite provider.
import { afterAll, expect, it } from 'vitest'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const LIMIT = 1000

const opened: OpenedProvider[] = []
afterAll(async () => {
  for (const entry of opened.splice(0)) await entry.close()
}, 120_000)

it(
  'answers a list of the limit whole, and one entry more as basis-unavailable with no list',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const deployment = await openProvider()
    opened.push(deployment)
    const { operations, governance } = deployment.provider
    const people = []
    for (const name of ['ada', 'bob']) {
      const credentials = { loginIdentifier: name, credential: `credential-${name}` }
      const registered = await operations.registerAndActivate(credentials)
      const login = await operations.issueLogin(credentials)
      if (registered.kind !== 'succeeded' || login.kind !== 'succeeded') throw new Error('setup')
      people.push({ registered, login })
    }
    const [ada, bob] = people
    if (ada === undefined || bob === undefined) throw new Error('setup')
    const team = await governance.createOrganization({
      login: ada.login.login,
      actingTenant: ada.registered.tenant,
      createCallId: 'limit',
      name: 'Limit team',
      governanceModelId: 'default-team',
    })
    if (team.kind !== 'succeeded') throw new Error(`create ${team.kind}`)
    await governance.switchCurrentTenant({
      login: ada.login.login,
      actingTenant: ada.registered.tenant,
      tenant: team.tenant,
    })
    const invite = async () => {
      const issued = await governance.issueMemberInvitation({
        login: ada.login.login,
        actingTenant: team.tenant,
        invitedLoginIdentifier: 'bob',
      })
      if (issued.kind !== 'succeeded') throw new Error(`invite ${issued.kind}`)
    }
    for (let index = 0; index < LIMIT; index += 1) await invite()
    const whole = await governance.queryReceivedInvitations({ login: bob.login.login })
    expect(whole.kind === 'succeeded' && whole.invitations.length).toBe(LIMIT)
    const issued = await governance.queryIssuedInvitations({
      login: ada.login.login,
      actingTenant: team.tenant,
    })
    expect(issued.kind === 'succeeded' && issued.invitations.length).toBe(LIMIT)

    await invite()
    for (const outcome of [
      await governance.queryReceivedInvitations({ login: bob.login.login }),
      await governance.queryIssuedInvitations({
        login: ada.login.login,
        actingTenant: team.tenant,
      }),
    ]) {
      expect(outcome).toEqual({
        kind: 'basis-unavailable',
        diagnostic: 'governance-read-unavailable:read_failed',
      })
      expect('invitations' in outcome).toBe(false)
    }
  },
)
