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
import type { SqlStorage } from '@omne-harness/sql-contract'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import {
  createIdentityQualifiedSettings,
  createSettingsStandingDestination,
} from '../src/identity.ts'
import { createSettingsSqlTerminals } from '../src/index.ts'
import { canonical, commandDigest } from '../src/encoding.ts'
import { command, GUARD, openWorld } from './world.ts'

function duration(text: string) {
  const d = parseDuration(text)
  if (!d.ok) throw new Error('fixture duration')
  return d.value
}
export async function openIdentityWorld(
  options: {
    sourceCapture?: boolean
    wrapSettings?: (storage: SqlStorage) => SqlStorage
    authority?: NonNullable<Parameters<typeof openWorld>[0]>['authority']
  } = {},
) {
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
  const principal = issued.ok,
    principalRef = standingPrincipalRef(principal)
  const target = { policyId: 'independent', targetRef: 'preferences', scopeRef }
  const world = await openWorld({
    sourceCapture: options.sourceCapture ?? false,
    ...(options.authority ? { authority: options.authority } : {}),
    scopeRef,
    target,
    principalRef,
    extraMaterials: identitySqlMaterials(),
  })
  const registration = await world.storage.registerCombination(identitySqlRegistration())
  if (registration.kind !== 'registered') throw new Error(JSON.stringify(registration))
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
  const destination = 'settings.preferences'
  const terminalOptions = {
    storage: world.storage,
    domain: world.domain,
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
  }
  let actualResolver = createSettingsStandingDestination({ ...terminalOptions, destination })
  let available = true
  const resolver: StandingDestinationResolver = {
    seal: r =>
      available
        ? actualResolver.seal(r)
        : Promise.resolve({ kind: 'unavailable', diagnostic: 'fixture-destination-offline' }),
  }
  const accounts = [ada, bob],
    organizations = [personalA, personalB, team]
  const identity = createIdentitySql({
    storage: world.storage,
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
  })
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
  const backend = createIdentityQualifiedSettings({
    destination,
    required: [],
    identity: {
      verifier: authority.verifier,
      standing: identity.standing,
      reservations: identity.reservations,
    },
    backend: {
      ...terminalOptions,
      storage: options.wrapSettings?.(world.storage) ?? world.storage,
      access: {
        async authorize(p, request) {
          return canonical(request.target) === canonical(target)
            ? {
                kind: 'authorized',
                scope: world.domain.scope,
                target,
                principalRef: standingPrincipalRef(p),
              }
            : { kind: 'rejected', reason: 'forbidden' }
        },
      },
      guards: options.authority?.guards ?? {
        participant: GUARD,
        command: binding => ({ participant: GUARD, facts: { binding } }),
      },
    },
  })
  const change = command({ target })
  const binding = {
    domain: world.domain,
    principalRef,
    target,
    operationId: change.operationId,
    commandDigest: commandDigest(change),
  }
  return {
    world,
    authority,
    terminalOptions,
    destination,
    identity,
    backend,
    principal,
    change,
    binding,
    loginA,
    clock,
    terminal: createSettingsSqlTerminals(terminalOptions),
    setResolver(value: StandingDestinationResolver) {
      actualResolver = value
    },
    setAvailable(value: boolean) {
      available = value
    },
    remove: () =>
      identity.governance.removeMember({
        login: loginA.login,
        actingTenant: organization.tenant,
        organization: team,
        account: bob,
        expectedRole: 'member',
      }),
    async close() {
      await backend.close()
      identity.stop()
      await opened.module.close()
      await world.close()
    },
  }
}
