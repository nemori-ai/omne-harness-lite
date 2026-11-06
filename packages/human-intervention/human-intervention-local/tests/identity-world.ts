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
  createIdentityQualifiedHitl,
  createHitlStandingDestination,
} from '@omne-harness/human-intervention-local'
import {
  createHitlSqlTerminals,
  IndependentCommandSchema,
  independentControlCommands,
} from '@omne-harness/human-intervention-local'
import { RegisterRequestSchema, OperationRefSchema } from '@omne-harness/human-intervention'
import { digest, operationKey } from '../src/encoding.ts'
import { openWorld } from './world.ts'

function duration(text: string) {
  const d = parseDuration(text)
  if (!d.ok) throw new Error('fixture duration')
  return d.value
}
export async function openIdentityWorld(
  options: {
    cards?: number
    destination?: string
    transformRegistration?: (
      request: ReturnType<typeof RegisterRequestSchema.parse>,
    ) => ReturnType<typeof RegisterRequestSchema.parse>
    wrapHitl?: (storage: SqlStorage) => SqlStorage
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
    actor = authority.issuer.issueSystem({ component: 'hitl-test' })
  if (!('ok' in actor)) throw new Error('fixture actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: subject,
    work: { owner: 'human-intervention', work: 'independent-form' },
  })
  if (!('ok' in issued)) throw new Error('fixture principal')
  const principal = issued.ok,
    principalRef = standingPrincipalRef(principal)
  const world = await openWorld({ tenantRef: scopeRef, extraMaterials: identitySqlMaterials() })
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
  const destination = options.destination ?? 'hitl.independent'
  const terminalOptions = {
    storage: world.storage,
    domain: world.combination,
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
  }
  const actualResolver = createHitlStandingDestination({ ...terminalOptions, destination })
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
  const backend = createIdentityQualifiedHitl({
    ...terminalOptions,
    storage: options.wrapHitl?.(world.storage) ?? world.storage,
    destination,
    required: [],
    identity: {
      verifier: authority.verifier,
      standing: identity.standing,
      reservations: identity.reservations,
    },
  })
  const operation = (id: string) =>
    OperationRefSchema.parse({ tenantRef: scopeRef, actorRef: principalRef, operationId: id })
  const baseRequest = RegisterRequestSchema.parse({
    protocol: 'hitl/1',
    operation: operation('register'),
    preparationRef: 'prepared',
    origin: {
      kind: 'independent',
      originRef: 'form',
      wait: { owner: 'independent', waitId: 'a', incarnation: 'one', destination },
      positionRef: 'step-a',
      adoptionRef: 'v1',
    },
    questions: Array.from({ length: options.cards ?? 1 }, (_, index) => ({
      kind: 'question',
      cardId: index === 0 ? 'answer' : `answer-${index}`,
      title: 'Continue?',
      description: 'Keep the original work',
      options: [{ id: 'yes', label: 'Yes', description: 'Continue' }],
    })),
    displayContext: 'Independent human question',
  })
  const request = options.transformRegistration?.(baseRequest) ?? baseRequest
  const preparation = IndependentCommandSchema.parse({
    kind: 'prepare',
    operation: operation('prepare'),
    preparation: {
      registration: request,
      readers: [principalRef],
      responders: [principalRef],
      compatibleImplementations: ['v1'],
    },
  })
  const prepared = await world.storage.commit({
    identity: {
      ...world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(operation('prepare')),
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands: independentControlCommands(preparation),
  })
  if (prepared.kind !== 'committed') throw new Error(JSON.stringify(prepared))
  const command = IndependentCommandSchema.parse({
    kind: 'request',
    input: { method: 'registerRequest', command: request },
    waitRef: request.origin.wait,
  })
  if (command.kind !== 'request') throw new Error('Expected request')
  const binding = { operationRef: request.operation, inputDigest: digest(command.input) }
  return {
    world,
    authority,
    terminalOptions,
    destination,
    identity,
    backend,
    principal,
    command,
    operation,
    request,
    binding,
    loginA,
    clock,
    terminal: createHitlSqlTerminals(terminalOptions),
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
