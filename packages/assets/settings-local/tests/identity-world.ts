import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type StandingDestinationResolver,
} from '@omne-harness/identity'
import {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
  randomIdentifiers,
} from '@omne-harness/identity-sql'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { openScrypt } from '@omne-harness/scrypt'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { config } from './config.ts'

function duration(text: string) {
  const d = parseDuration(text)
  if (!d.ok) throw new Error('fixture duration')
  return d.value
}
async function openStorage(root: string) {
  const made = await createSqliteStorage({
    config: config(root),
    materials: {
      catalogProtocol: 'sql-catalog/1',
      ...identitySqlMaterials(),
      declaredCombinations: { tenant: null, system: null },
    },
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.storage.registerCombination(identitySqlRegistration())
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  let closed: Promise<void> | undefined
  return {
    storage: made.storage,
    close: () =>
      (closed ??= made.control.close({ initiator: 'disposal' }).then(result => {
        if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
      })),
  }
}
/**
 * A real Identity in its own storage: an organization with an administrator (ada) and a member
 * (bob), and a principal that acts for the member tenant. It holds no Settings; a test connects
 * its destination with `setResolver`.
 */
export async function openIdentityWorld() {
  const ids = randomIdentifiers(),
    ada = ids.account(),
    bob = ids.account()
  const personalA = ids.organization(),
    personalB = ids.organization(),
    team = ids.organization()
  const subject = tenant(team, bob),
    encoded = tenantCodec.encode(subject)
  if (!encoded.ok) throw new Error('fixture tenant')
  const scopeRef = encoded.value
  const authority = inProcessPrincipalAuthority(),
    actor = authority.issuer.issueSystem({ component: 'settings-test' })
  if (!('ok' in actor)) throw new Error('fixture actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: subject,
    work: { owner: 'settings', work: 'manual-config' },
  })
  if (!('ok' in issued)) throw new Error('fixture principal')
  const principal = issued.ok
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-identity/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = realpathSync(mkdtempSync(join(parent, 'case-')))
  const sql = await openStorage(root)
  const opened = openScrypt({
    N: 1024,
    r: 8,
    p: 1,
    keylen: 32,
    saltBytes: 16,
    inFlight: 1,
    queue: 8,
  })
  if (!opened.ok) throw new Error('scrypt fixture')
  const decoy = opened.module.derive('decoy', () => ({ ok: true }))
  if (!('done' in decoy)) throw new Error('scrypt fixture admission')
  const material = await decoy.done
  if (material.code !== 'material') throw new Error('scrypt fixture material')
  const now = parseInstant('2026-11-05T00:00:00Z')
  if (!now.ok) throw new Error('clock fixture')
  const clock = manualIdentityClock(now.value)
  const terms = adjustableLoginTerms({
    maxLifetime: duration('PT86400S'),
    idlePeriod: duration('PT3600S'),
  })
  const invitations = adjustableInvitationTerms({
    defaultDuration: duration('PT3600S'),
    maxDuration: duration('PT86400S'),
  })
  let destination: StandingDestinationResolver | undefined
  let available = true
  const resolver: StandingDestinationResolver = {
    seal: r =>
      available && destination
        ? destination.seal(r)
        : Promise.resolve({ kind: 'unavailable', diagnostic: 'fixture-destination-offline' }),
  }
  const accounts = [ada, bob],
    organizations = [personalA, personalB, team]
  const identityOptions: Parameters<typeof createIdentitySql>[0] = {
    storage: sql.storage,
    clock: clock.clock,
    terms: terms.source,
    invitationTerms: invitations.source,
    scrypt: opened.module,
    decoyMaterial: material.material,
    principalVerifier: authority.verifier,
    destinationResolver: resolver,
    identifiers: {
      account: () => {
        const x = accounts.shift()
        if (!x) throw new Error('fixture account exhausted')
        return x
      },
      organization: () => {
        const x = organizations.shift()
        if (!x) throw new Error('fixture organizations exhausted')
        return x
      },
      login: ids.login,
    },
  }
  const identity = createIdentitySql(identityOptions)
  const regA = await identity.operations.registerAndActivate({
    loginIdentifier: 'ada',
    credential: 'ada-secret',
  })
  const regB = await identity.operations.registerAndActivate({
    loginIdentifier: 'bob',
    credential: 'bob-secret',
  })
  const loginA = await identity.operations.issueLogin({
    loginIdentifier: 'ada',
    credential: 'ada-secret',
  })
  const loginB = await identity.operations.issueLogin({
    loginIdentifier: 'bob',
    credential: 'bob-secret',
  })
  if (
    regA.kind !== 'succeeded' ||
    regB.kind !== 'succeeded' ||
    loginA.kind !== 'succeeded' ||
    loginB.kind !== 'succeeded'
  )
    throw new Error('identity fixture users')
  const organization = await identity.governance.createOrganization({
    login: loginA.login,
    actingTenant: regA.tenant,
    createCallId: 'team-create',
    name: 'Example',
    governanceModelId: 'default-team',
  })
  if (organization.kind !== 'succeeded') throw new Error('identity fixture team')
  const admin = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: organization.tenant,
    work: { owner: 'settings', work: 'organization-config' },
  })
  if (!('ok' in admin)) throw new Error('fixture administrator')
  await identity.governance.switchCurrentTenant({
    login: loginA.login,
    actingTenant: regA.tenant,
    tenant: organization.tenant,
  })
  const invitation = await identity.governance.issueMemberInvitation({
    login: loginA.login,
    actingTenant: organization.tenant,
    invitedLoginIdentifier: 'bob',
  })
  if (invitation.kind !== 'succeeded') throw new Error('identity fixture invite')
  const accepted = await identity.governance.acceptMemberInvitation({
    login: loginB.login,
    actingTenant: regB.tenant,
    invitation: invitation.invitation,
    expectedState: 'open',
  })
  if (accepted.kind !== 'succeeded') throw new Error(JSON.stringify(accepted))
  await identity.governance.switchCurrentTenant({
    login: loginB.login,
    actingTenant: regB.tenant,
    tenant: subject,
  })
  return {
    authority,
    identity,
    /** Acts for the member tenant. */
    principal,
    principalRef: standingPrincipalRef(principal),
    /** The member tenant, as a Settings scope. */
    scopeRef,
    /** Acts for the tenant of the administrator in the same organization. */
    administrator: admin.ok,
    /** The login of the administrator, for the governance operations that the administrator runs. */
    administratorLogin: loginA.login,
    setResolver(value: StandingDestinationResolver) {
      destination = value
    },
    setAvailable(value: boolean) {
      available = value
    },
    async demoteAdministrator() {
      const promoted = await identity.governance.changeMemberRole({
        login: loginA.login,
        actingTenant: organization.tenant,
        organization: team,
        account: bob,
        expectedRole: 'member',
        targetRole: 'super-admin',
      })
      if (promoted.kind !== 'succeeded') return promoted
      return identity.governance.changeMemberRole({
        login: loginA.login,
        actingTenant: organization.tenant,
        organization: team,
        account: ada,
        expectedRole: 'super-admin',
        targetRole: 'member',
      })
    },
    remove: () =>
      identity.governance.removeMember({
        login: loginA.login,
        actingTenant: organization.tenant,
        organization: team,
        account: bob,
        expectedRole: 'member',
      }),
    /** Stops this Identity and starts another one over the same stored facts. */
    async remount() {
      identity.stop()
      await sql.close()
      const reopened = await openStorage(root)
      const mounted = createIdentitySql({
        ...identityOptions,
        storage: reopened.storage,
        principalVerifier: inProcessPrincipalAuthority().verifier,
      })
      return {
        identity: mounted,
        async close() {
          mounted.stop()
          await reopened.close()
        },
      }
    },
    async close() {
      identity.stop()
      await opened.module.close()
      await sql.close()
    },
  }
}
