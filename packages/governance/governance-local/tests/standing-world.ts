import { z } from 'zod'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type StandingDestinationResolver,
  type GovernanceOperationRef,
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
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { standingReceiptSchema } from '../src/standing-schema.ts'
import { openOperations, scope } from './operation-world.ts'

function duration(text: string) {
  const d = parseDuration(text)
  if (!d.ok) throw new Error('fixture duration')
  return d.value
}
export async function openStandingWorld() {
  const ids = randomIdentifiers(),
    ada = ids.account(),
    bob = ids.account()
  const personalA = ids.organization(),
    personalB = ids.organization(),
    team = ids.organization()
  const subject = tenant(team, bob),
    encoded = tenantCodec.encode(subject)
  if (!encoded.ok) throw new Error('fixture tenant')
  const actualScope = {
    ...scope,
    tenantRef: encoded.value,
    visibility: { kind: 'tenant' as const, tenantRef: encoded.value },
  }
  const world = await openOperations(undefined, {
    tenantRef: encoded.value,
    extraMaterials: identitySqlMaterials(),
  })
  const registration = await world.storage.registerCombination(identitySqlRegistration())
  if (registration.kind !== 'registered') throw new Error(JSON.stringify(registration))
  const authority = inProcessPrincipalAuthority(),
    actor = authority.issuer.issueSystem({ component: 'governance-test' })
  if (!('ok' in actor)) throw new Error('fixture actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: subject,
    work: { owner: 'governance', work: 'registration' },
  })
  if (!('ok' in issued)) throw new Error('fixture principal')
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
  if (!('done' in decoy)) throw new Error('scrypt admission')
  const material = await decoy.done
  if (material.code !== 'material') throw new Error('scrypt fixture material')
  const instant = parseInstant('2026-11-07T00:00:00Z')
  if (!instant.ok) throw new Error('fixture instant')
  const clock = manualIdentityClock(instant.value)
  const destination = 'governance-contributions'
  let available = true
  const resolver: StandingDestinationResolver = {
    async seal(reservation) {
      const unavailable = { kind: 'unavailable' as const, diagnostic: 'fixture-governance-offline' }
      if (!available) return unavailable
      const result = await world.call({
        kind: 'standing-seal',
        reservation,
        route: { destination, transactionDomain: world.domain.transactionDomain },
      })
      const parsed = z
        .object({
          kind: z.literal('terminal'),
          reservation: standingReceiptSchema,
          outcome: z.enum(['committed', 'aborted']),
        })
        .safeParse(result)
      return parsed.success ? parsed.data : unavailable
    },
  }
  const accounts = [ada, bob],
    organizations = [personalA, personalB, team]
  const identity = createIdentitySql({
    storage: world.storage,
    clock: clock.clock,
    terms: adjustableLoginTerms({
      maxLifetime: duration('PT86400S'),
      idlePeriod: duration('PT3600S'),
    }).source,
    invitationTerms: adjustableInvitationTerms({
      defaultDuration: duration('PT3600S'),
      maxDuration: duration('PT86400S'),
    }).source,
    scrypt: opened.module,
    decoyMaterial: material.material,
    principalVerifier: authority.verifier,
    destinationResolver: resolver,
    identifiers: {
      account: () => {
        const value = accounts.shift()
        if (!value) throw new Error('accounts exhausted')
        return value
      },
      organization: () => {
        const value = organizations.shift()
        if (!value) throw new Error('organizations exhausted')
        return value
      },
      login: ids.login,
    },
  })
  async function person(name: string) {
    const credentials = { loginIdentifier: name, credential: 'secret-' + name }
    const registered = await identity.operations.registerAndActivate(credentials)
    const login = await identity.operations.issueLogin(credentials)
    if (registered.kind !== 'succeeded' || login.kind !== 'succeeded')
      throw new Error('fixture person')
    return { ...registered, login: login.login }
  }
  const admin = await person('ada'),
    member = await person('bob')
  const organization = await identity.governance.createOrganization({
    login: admin.login,
    actingTenant: admin.tenant,
    createCallId: 'team',
    name: 'team',
    governanceModelId: 'default-team',
  })
  if (organization.kind !== 'succeeded') throw new Error('fixture organization')
  const switched = await identity.governance.switchCurrentTenant({
    login: admin.login,
    actingTenant: admin.tenant,
    tenant: organization.tenant,
  })
  if (switched.kind !== 'succeeded') throw new Error('fixture switch')
  const invitation = await identity.governance.issueMemberInvitation({
    login: admin.login,
    actingTenant: organization.tenant,
    invitedLoginIdentifier: 'bob',
  })
  if (invitation.kind !== 'succeeded') throw new Error('fixture invitation')
  const accepted = await identity.governance.acceptMemberInvitation({
    login: member.login,
    actingTenant: member.tenant,
    invitation: invitation.invitation,
    expectedState: 'open',
  })
  if (accepted.kind !== 'succeeded') throw new Error('fixture acceptance')
  await world.call({
    kind: 'bootstrap',
    input: { scope: actualScope, epoch: 'first', previousEpoch: null },
  })
  return {
    ...world,
    identity,
    principal: issued.ok,
    principalRef: standingPrincipalRef(issued.ok),
    scope: actualScope,
    destination,
    setAvailable(value: boolean) {
      available = value
    },
    resume: (operation: GovernanceOperationRef) =>
      identity.governanceRecovery.resume({ login: admin.login, operation }),
    remove: () =>
      identity.governance.removeMember({
        login: admin.login,
        actingTenant: organization.tenant,
        organization: team,
        account: bob,
        expectedRole: 'member',
      }),
    async close() {
      identity.stop()
      await opened.module.close()
      await world.close()
    },
  }
}
