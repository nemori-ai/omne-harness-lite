// @module-tag slow
// AC-2 (identity spec), first half: two super administrators remove or demote each other at once,
// 50 times on the real SQLite provider. Every run: at most one call succeeds, the other is
// `denied`, and the organization keeps at least one active super administrator. Slow: 50 teams,
// each with three registrations, and 100 concurrent commits. With IDENTITY_SQL_EVIDENCE_DIR set,
// the test writes the outcome of every run there.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { DEFAULT_TEAM_ROLES } from '@omne-harness/identity'
import type { IssuedLogin } from '@omne-harness/identity'
import type { AccountId, TenantId } from '@omne-harness/legal-identity'
import { openProvider, type OpenedProvider } from './fixtures/provider.ts'

const RUNS = 50

const opened: OpenedProvider[] = []
afterAll(async () => {
  for (const entry of opened.splice(0)) await entry.close()
}, 120_000)

type Person = Readonly<{
  identifier: string
  account: AccountId
  personal: TenantId
  login: IssuedLogin
}>

it(
  'lets at most one of two administrators succeed against each other, 50 runs',
  { tags: ['slow'], timeout: 300_000 },
  async () => {
    const deployment = await openProvider()
    opened.push(deployment)
    const { operations, governance } = deployment.provider
    let serial = 0
    const person = async (): Promise<Person> => {
      serial += 1
      const credentials = { loginIdentifier: `race-${serial}`, credential: `credential-${serial}` }
      const registered = await operations.registerAndActivate(credentials)
      if (registered.kind !== 'succeeded') throw new Error('registration failed')
      const login = await operations.issueLogin(credentials)
      if (login.kind !== 'succeeded') throw new Error('issue failed')
      return {
        identifier: credentials.loginIdentifier,
        account: registered.account,
        personal: registered.tenant,
        login,
      }
    }
    const runs: Readonly<Record<string, unknown>>[] = []
    for (let run = 0; run < RUNS; run += 1) {
      const [ada, bob, eve] = [await person(), await person(), await person()]
      const created = await governance.createOrganization({
        login: ada.login.login,
        actingTenant: ada.personal,
        createCallId: `team-${run}`,
        name: `Race team ${run}`,
        governanceModelId: 'default-team',
      })
      if (created.kind !== 'succeeded') throw new Error(`create ${created.kind}`)
      const team = created.organization
      const selected = new Map<Person, TenantId>([[ada, ada.personal]])
      const switchTo = async (who: Person, target: TenantId) => {
        const switched = await governance.switchCurrentTenant({
          login: who.login.login,
          actingTenant: selected.get(who) ?? who.personal,
          tenant: target,
        })
        if (switched.kind !== 'succeeded' && switched.kind !== 'no-change')
          throw new Error(`switch ${switched.kind}`)
        selected.set(who, target)
      }
      await switchTo(ada, created.tenant)
      for (const member of [bob, eve]) {
        const invited = await governance.issueMemberInvitation({
          login: ada.login.login,
          actingTenant: created.tenant,
          invitedLoginIdentifier: member.identifier,
        })
        if (invited.kind !== 'succeeded') throw new Error(`invite ${invited.kind}`)
        const accepted = await governance.acceptMemberInvitation({
          login: member.login.login,
          actingTenant: member.personal,
          invitation: invited.invitation,
          expectedState: 'open',
        })
        if (accepted.kind !== 'succeeded') throw new Error(`accept ${accepted.kind}`)
        const joined = await governance.queryOwnMemberships({ login: member.login.login })
        if (joined.kind !== 'succeeded') throw new Error(`memberships ${joined.kind}`)
        const tenant = joined.memberships.find(entry => entry.organization.text === team.text)
        if (tenant === undefined) throw new Error('no team membership')
        await switchTo(member, tenant.tenant)
      }
      const promoted = await governance.changeMemberRole({
        login: ada.login.login,
        actingTenant: created.tenant,
        organization: team,
        account: bob.account,
        expectedRole: DEFAULT_TEAM_ROLES.member,
        targetRole: DEFAULT_TEAM_ROLES.superAdmin,
      })
      if (promoted.kind !== 'succeeded') throw new Error(`promote ${promoted.kind}`)
      const change = run % 2 === 0 ? 'remove' : 'demote'
      const against = (actor: Person, target: Person) => {
        const base = {
          login: actor.login.login,
          actingTenant: selected.get(actor) ?? actor.personal,
          organization: team,
          account: target.account,
          expectedRole: DEFAULT_TEAM_ROLES.superAdmin,
        }
        return change === 'remove'
          ? governance.removeMember(base)
          : governance.changeMemberRole({ ...base, targetRole: DEFAULT_TEAM_ROLES.member })
      }
      // Both calls are in flight before either answers. Which call starts first alternates every
      // two runs, so each administrator is the first one in half of the runs.
      const first = run % 4 < 2 ? 'ada' : 'bob'
      const outcomes =
        first === 'ada'
          ? await Promise.all([against(ada, bob), against(bob, ada)])
          : await Promise.all([against(bob, ada), against(ada, bob)]).then(
              ([bobAgainstAda, adaAgainstBob]) => [adaAgainstBob, bobAgainstAda] as const,
            )
      const members = await governance.queryOrganizationMembers({
        login: eve.login.login,
        actingTenant: selected.get(eve) ?? eve.personal,
        organization: team,
      })
      if (members.kind !== 'succeeded') throw new Error(`members ${members.kind}`)
      const admins = members.members.filter(
        member => member.role.role === DEFAULT_TEAM_ROLES.superAdmin,
      ).length
      runs.push({
        run,
        change,
        first,
        adaAgainstBob: outcomes[0].kind,
        bobAgainstAda: outcomes[1].kind,
        succeeded: outcomes.filter(outcome => outcome.kind === 'succeeded').length,
        superAdmins: admins,
      })
    }
    const evidence = process.env['IDENTITY_SQL_EVIDENCE_DIR']
    if (evidence !== undefined && evidence !== '') {
      mkdirSync(evidence, { recursive: true })
      writeFileSync(join(evidence, 'last-admin-concurrent.json'), JSON.stringify(runs, null, 2))
    }
    expect(runs).toHaveLength(RUNS)
    for (const entry of runs) {
      expect(entry['succeeded']).toBeLessThanOrEqual(1)
      expect(entry['superAdmins']).toBeGreaterThanOrEqual(1)
      for (const side of ['adaAgainstBob', 'bobAgainstAda'])
        expect(['succeeded', 'denied']).toContain(entry[side])
    }
  },
)
