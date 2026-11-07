import { mutantBuild, type MutantBuild } from './fixtures/mutants.ts'
import type { IdentitySqlBuild } from './fixtures/governance.ts'
import { afterEach, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  standingReservationId,
  type GovernanceOperationRef,
  type StandingBinding,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { openSqliteStorage } from './fixtures/storage.ts'
import { identitySqlMaterials, identitySqlRegistration } from '@omne-harness/identity-sql'
import { openProvider, instant, type OpenedProvider } from './fixtures/provider.ts'

const mutants: MutantBuild[] = []
const opened: OpenedProvider[] = []
afterEach(async () => {
  for (const entry of opened.splice(0)) await entry.close()
  for (const mutant of mutants.splice(0)) mutant.remove()
})

async function setup(
  resolver?: StandingDestinationResolver,
  wrap?: (storage: SqlStorage) => SqlStorage,
  build?: IdentitySqlBuild,
) {
  const authority = inProcessPrincipalAuthority()
  const deployment = await openProvider({
    ...(build === undefined ? {} : { build }),
    principalVerifier: authority.verifier,
    ...(resolver === undefined ? {} : { destinationResolver: resolver }),
    ...(wrap === undefined ? {} : { wrap }),
  })
  opened.push(deployment)
  const { operations, governance } = deployment.provider
  const person = async (name: string) => {
    const credentials = { loginIdentifier: name, credential: `secret-${name}` }
    const registered = await operations.registerAndActivate(credentials)
    const issued = await operations.issueLogin(credentials)
    if (registered.kind !== 'succeeded' || issued.kind !== 'succeeded') throw new Error('person')
    return { ...registered, login: issued.login }
  }
  const admin = await person('admin')
  const member = await person('member')
  const organization = await governance.createOrganization({
    login: admin.login,
    actingTenant: admin.tenant,
    createCallId: 'team',
    name: 'team',
    governanceModelId: 'default-team',
  })
  if (organization.kind !== 'succeeded') throw new Error('team')
  expect(
    await governance.switchCurrentTenant({
      login: admin.login,
      actingTenant: admin.tenant,
      tenant: organization.tenant,
    }),
  ).toMatchObject({ kind: 'succeeded' })
  const invitation = await governance.issueMemberInvitation({
    login: admin.login,
    actingTenant: organization.tenant,
    invitedLoginIdentifier: 'member',
  })
  if (invitation.kind !== 'succeeded') throw new Error('invite')
  expect(
    await governance.acceptMemberInvitation({
      login: member.login,
      actingTenant: member.tenant,
      invitation: invitation.invitation,
      expectedState: 'open',
    }),
  ).toMatchObject({ kind: 'succeeded' })
  const memberTenant = tenant(organization.organization, member.account)
  const system = authority.issuer.issueSystem({ component: 'test' })
  if (!('ok' in system)) throw new Error('system')
  const issued = authority.issuer.issueActingForTenant({
    actor: system.ok,
    tenant: memberTenant,
    work: { owner: 'test', work: '1' },
  })
  if (!('ok' in issued)) throw new Error('principal')
  const encoded = tenantCodec.encode(memberTenant)
  if (!encoded.ok) throw new Error('tenant')
  const binding: StandingBinding = {
    version: 'standing/1',
    owner: 'test',
    operationId: 'op-1',
    principalRef: standingPrincipalRef(issued.ok),
    destination: 'test-target',
    scopeRef: encoded.value,
    targetRef: 'target-1',
    inputDigest: 'digest-1',
  }
  const reserve = (operationId = 'op-1') =>
    deployment.provider.reservations.reserve({
      principal: issued.ok,
      binding: { ...binding, operationId },
      required: [],
    })
  const change = {
    login: admin.login,
    actingTenant: organization.tenant,
    organization: organization.organization,
    account: member.account,
    expectedRole: 'member',
  }
  return {
    deployment,
    authority,
    admin,
    member,
    organization,
    memberTenant,
    principal: issued.ok,
    binding,
    reserve,
    change,
  }
}

async function pending(promise: Promise<unknown>): Promise<GovernanceOperationRef> {
  try {
    await promise
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'operation' in error &&
      typeof error.operation === 'object' &&
      error.operation !== null &&
      'operationId' in error.operation &&
      typeof error.operation.operationId === 'string'
    )
      return { operationId: error.operation.operationId }
    throw error
  }
  throw new Error('expected recoverable pending mutation')
}

it('holds one stable operation, conflicts on changed content, and rejects forged or cross-tenant principals', async () => {
  const fixture = await setup()
  const first = await fixture.reserve()
  expect(first).toMatchObject({
    kind: 'held',
    reservation: { id: standingReservationId(fixture.binding, []) },
  })
  expect(await fixture.reserve()).toEqual(first)
  expect(
    await fixture.deployment.provider.reservations.reserve({
      principal: fixture.principal,
      binding: { ...fixture.binding, inputDigest: 'other' },
      required: [],
    }),
  ).toEqual({ kind: 'operation-conflict' })
  expect(
    await fixture.deployment.provider.reservations.reserve({
      principal: { ...fixture.principal },
      binding: fixture.binding,
      required: [],
    }),
  ).toEqual({ kind: 'denied' })
  expect(
    await fixture.deployment.provider.reservations.reserve({
      principal: fixture.principal,
      binding: { ...fixture.binding, scopeRef: 'other-tenant' },
      required: [],
    }),
  ).toEqual({ kind: 'denied' })
  expect(
    await fixture.deployment.provider.reservations.reserve({
      principal: fixture.principal,
      binding: { ...fixture.binding, operationId: 'qualified' },
      required: ['organization-cost-ledger-read'],
    }),
  ).toEqual({ kind: 'denied' })
})

it('keeps organization settings and cost qualifications distinct across reservation recovery', async () => {
  const fixture = await setup()
  expect(
    await fixture.deployment.provider.reservations.reserve({
      principal: fixture.principal,
      binding: fixture.binding,
      required: ['organization-settings-manage'],
    }),
  ).toEqual({ kind: 'denied' })
  const system = fixture.authority.issuer.issueSystem({ component: 'settings-test' })
  if (!('ok' in system)) throw new Error('system')
  const issued = fixture.authority.issuer.issueActingForTenant({
    actor: system.ok,
    tenant: fixture.organization.tenant,
    work: { owner: 'settings-test', work: 'admin-operation' },
  })
  const scope = tenantCodec.encode(fixture.organization.tenant)
  if (!('ok' in issued) || !scope.ok) throw new Error('administrator principal')
  const binding = {
    ...fixture.binding,
    principalRef: standingPrincipalRef(issued.ok),
    scopeRef: scope.value,
  }
  const settingsRequest = {
    principal: issued.ok,
    binding: { ...binding, operationId: 'settings-original' },
    required: ['organization-settings-manage'] as const,
  }
  const costRequest = {
    principal: issued.ok,
    binding: { ...binding, operationId: 'cost-original' },
    required: ['organization-cost-ledger-read'] as const,
  }
  const settings = await fixture.deployment.provider.reservations.reserve(settingsRequest)
  const costs = await fixture.deployment.provider.reservations.reserve(costRequest)
  expect(settings.kind).toBe('held')
  expect(costs.kind).toBe('held')
  if (settings.kind !== 'held' || costs.kind !== 'held') throw new Error('held reservations')
  expect(
    await fixture.deployment.provider.reservations.reserve({
      ...costRequest,
      required: ['organization-settings-manage'],
    }),
  ).toEqual({ kind: 'operation-conflict' })
  fixture.deployment.provider.stop()
  await fixture.deployment.scrypt.module.close()
  await fixture.deployment.storage.close({ remove: false })
  opened.splice(opened.indexOf(fixture.deployment), 1)
  const storage = await openSqliteStorage(fixture.deployment.storage.base)
  const replacement = await openProvider({
    storage,
    principalVerifier: fixture.authority.verifier,
    destinationResolver: {
      async seal(reservation) {
        return { kind: 'terminal', reservation, outcome: 'aborted' }
      },
    },
  })
  opened.push({
    ...replacement,
    async close() {
      await replacement.close()
      await storage.close({ remove: true })
    },
  })
  expect(await replacement.provider.reservations.reserve(settingsRequest)).toEqual(settings)
  expect(await replacement.provider.reservations.reserve(costRequest)).toEqual(costs)
  for (const held of [settings, costs]) {
    expect(await replacement.provider.reservations.settle(held.reservation)).toMatchObject({
      kind: 'terminal',
      reservation: held.reservation,
      outcome: 'aborted',
    })
  }
  expect(await replacement.provider.reservations.reserve(costRequest)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
})

it('keeps the membership and admission barrier until the injected destination seal succeeds', async () => {
  let available = false
  const calls: StandingReservation[] = []
  const fixture = await setup({
    async seal(reservation) {
      calls.push(reservation)
      return available
        ? { kind: 'terminal', reservation, outcome: 'aborted' }
        : { kind: 'unavailable', diagnostic: 'offline' }
    },
  })
  expect((await fixture.reserve()).kind).toBe('held')
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('member')
  expect(await fixture.reserve('next')).toEqual({ kind: 'blocked' })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toEqual({ kind: 'pending', operation })
  available = true
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toEqual({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('not-member')
  expect(await fixture.reserve()).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(await fixture.reserve('late')).toEqual({ kind: 'denied' })
  expect(calls.length).toBeGreaterThan(0)
})

it('rejects a fabricated completion and retains the held reservation on stop', async () => {
  let valid = false
  let resolverCalls = 0
  const fixture = await setup({
    async seal(reservation) {
      resolverCalls++
      return {
        kind: 'terminal',
        reservation: valid
          ? reservation
          : { ...reservation, binding: { ...reservation.binding, scopeRef: 'wrong' } },
        outcome: 'committed',
      }
    },
  })
  const held = await fixture.reserve()
  if (held.kind !== 'held') throw new Error('held')
  expect((await fixture.deployment.provider.reservations.settle(held.reservation)).kind).toBe(
    'unavailable',
  )
  await pending(fixture.deployment.provider.governance.removeMember(fixture.change))
  valid = true
  resolverCalls = 0
  fixture.deployment.provider.stop()
  expect(await fixture.deployment.provider.reservations.settle(held.reservation)).toMatchObject({
    kind: 'unavailable',
    diagnostic: 'provider-stopped',
  })
  expect(resolverCalls).toBe(0)
})

it('rechecks the initiating login after drain and clears the denied mutation barrier', async () => {
  let expire = false
  let deployment: OpenedProvider | undefined
  const fixture = await setup({
    async seal(reservation) {
      if (expire) deployment?.clock.setTo(instant('2026-10-25T14:00:00Z'))
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  deployment = fixture.deployment
  await fixture.reserve()
  expire = true
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toEqual({
    kind: 'denied',
  })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('member')
  expect((await fixture.reserve('after-denial')).kind).toBe('held')
})

it('queues concurrent mutations deterministically, and a refusal clears its own gate', async () => {
  let available = false
  const fixture = await setup({
    async seal(reservation) {
      return available
        ? { kind: 'terminal', reservation, outcome: 'committed' }
        : { kind: 'unavailable', diagnostic: 'offline' }
    },
  })
  await fixture.reserve()
  const first = await pending(
    fixture.deployment.provider.governance.changeMemberRole({
      ...fixture.change,
      targetRole: 'super-admin',
    }),
  )
  const second = await pending(fixture.deployment.provider.governance.removeMember(fixture.change))
  available = true
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation: second,
    }),
  ).toEqual({ kind: 'pending', operation: second })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation: first,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation: second,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'conflict' } })
  expect((await fixture.reserve('after-conflict')).kind).toBe('held')
})

it('protects leave and invitation reactivation through the same worker gate', async () => {
  let available = false
  const fixture = await setup({
    async seal(reservation) {
      return available
        ? { kind: 'terminal', reservation, outcome: 'aborted' }
        : { kind: 'unavailable', diagnostic: 'offline' }
    },
  })
  const { governance } = fixture.deployment.provider
  expect(
    await governance.switchCurrentTenant({
      login: fixture.member.login,
      actingTenant: fixture.member.tenant,
      tenant: fixture.memberTenant,
    }),
  ).toMatchObject({ kind: 'succeeded' })
  await fixture.reserve()
  const leave = await pending(
    governance.leaveOrganization({
      login: fixture.member.login,
      actingTenant: fixture.memberTenant,
    }),
  )
  expect(await fixture.reserve('during-leave')).toEqual({ kind: 'blocked' })
  available = true
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.member.login,
      operation: leave,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  const invitation = await governance.issueMemberInvitation({
    login: fixture.admin.login,
    actingTenant: fixture.organization.tenant,
    invitedLoginIdentifier: 'member',
  })
  if (invitation.kind !== 'succeeded') throw new Error('invitation')
  expect(
    await governance.acceptMemberInvitation({
      login: fixture.member.login,
      actingTenant: fixture.memberTenant,
      invitation: invitation.invitation,
      expectedState: 'open',
    }),
  ).toMatchObject({ kind: 'succeeded' })
  expect((await fixture.reserve('after-rejoin')).kind).toBe('held')
  expect(
    await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant }),
  ).toMatchObject({ kind: 'member', role: { role: 'member' } })
})

it.each(['unknown', 'throw'] as const)(
  'recovers the exact logical admission after its receipt is %s',
  async fault => {
    let lose = false
    const seen: string[] = []
    const fixture = await setup(undefined, storage => ({
      ...storage,
      async commit(request, options) {
        const result = await storage.commit(request, options)
        if (lose && request.commands[0]?.facts['kind'] === 'membership-admit') {
          seen.push(JSON.stringify(request))
          if (fault === 'throw') throw new Error('lost connection')
          return { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        }
        return result
      },
      query: id =>
        lose
          ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'lost' })
          : storage.query(id),
    }))
    lose = true
    const operation = await pending(
      fixture.deployment.provider.governance.removeMember(fixture.change),
    )
    lose = false
    expect(
      await fixture.deployment.provider.governanceRecovery.resume({
        login: fixture.member.login,
        operation,
      }),
    ).toEqual({ kind: 'not-visible' })
    expect(
      await fixture.deployment.provider.governanceRecovery.resume({
        login: fixture.admin.login,
        operation,
      }),
    ).toMatchObject({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
    expect(
      await fixture.deployment.provider.governanceRecovery.resume({
        login: fixture.admin.login,
        operation,
      }),
    ).toMatchObject({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
    expect(seen).toHaveLength(1)
  },
)

it('retires an unsent old apply before fresh authorization, and fences the delayed envelope', async () => {
  let hold = false
  let delayed: Parameters<SqlStorage['commit']>[0] | undefined
  let underlying: SqlStorage | undefined
  const fixture = await setup(undefined, storage => {
    underlying = storage
    return {
      ...storage,
      async commit(request, options) {
        if (hold && request.commands[0]?.facts['kind'] === 'membership-apply') {
          delayed = request
          return { kind: 'unknown', identity: request.identity, diagnostic: 'unsent' }
        }
        return storage.commit(request, options)
      },
    }
  })
  hold = true
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  expect(delayed).toBeDefined()
  fixture.deployment.clock.setTo(instant('2026-10-25T14:00:00Z'))
  hold = false
  expect(await fixture.deployment.provider.governanceRecovery.recover()).toMatchObject({
    kind: 'recovered',
    finished: 1,
  })
  if (delayed === undefined || underlying === undefined) throw new Error('delayed apply')
  const late = await underlying.commit(delayed)
  expect(late.kind).toBe('committed')
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('member')
  expect((await fixture.reserve('after-expiry')).kind).toBe('held')
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toEqual({ kind: 'denied' })
})

it('persists holds and intents across Worker restart and fails closed without a route', async () => {
  const fixture = await setup()
  const held = await fixture.reserve()
  if (held.kind !== 'held') throw new Error('reservation')
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  expect(await fixture.deployment.provider.reservations.settle(held.reservation)).toEqual({
    kind: 'unavailable',
    diagnostic: 'destination-resolver-missing',
  })
  fixture.deployment.provider.stop()
  await fixture.deployment.scrypt.module.close()
  await fixture.deployment.storage.close({ remove: false })
  opened.splice(opened.indexOf(fixture.deployment), 1)
  const storage = await openSqliteStorage(fixture.deployment.storage.base)
  const replacement = await openProvider({
    storage,
    principalVerifier: fixture.authority.verifier,
    destinationResolver: {
      async seal(reservation) {
        return { kind: 'terminal', reservation, outcome: 'aborted' }
      },
    },
  })
  opened.push({
    ...replacement,
    async close() {
      await replacement.close()
      await storage.close({ remove: true })
    },
  })
  expect(
    await replacement.provider.governanceRecovery.resume({ login: fixture.admin.login, operation }),
  ).toMatchObject({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
  expect(await replacement.provider.reservations.settle(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(
    await replacement.provider.governanceRecovery.resume({ login: fixture.admin.login, operation }),
  ).toMatchObject({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
})

it('rejects direct legacy member commands at the Worker while a reservation is held', async () => {
  let captured: string | undefined
  const fixture = await setup(undefined, storage => ({
    ...storage,
    async commit(request, options) {
      const facts = request.commands[0]?.facts
      if (facts?.['kind'] === 'membership-admit' && typeof facts['facts'] === 'string')
        captured = facts['facts']
      return storage.commit(request, options)
    },
  }))
  await fixture.reserve()
  await pending(fixture.deployment.provider.governance.removeMember(fixture.change))
  if (captured === undefined) throw new Error('no raw membership facts')
  const registration = identitySqlRegistration()
  const raw = await fixture.deployment.storage.storage.commit({
    identity: {
      scope: registration.scope,
      transactionDomain: registration.transactionDomain,
      operation: 'identity.change-member',
      protocolVersion: '2',
      operationKey: 'legacy-direct',
    },
    combinationVersion: registration.combinationVersion,
    manifestDigest: registration.manifestDigest,
    commands: [{ participant: 'identity', facts: JSON.parse(captured) }],
  })
  expect(raw.kind).toBe('committed')
  if (raw.kind === 'committed')
    expect(raw.responses[0]?.reply).toMatchObject({
      kind: 'participated',
      response: { outcome: 'blocked' },
    })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('member')
})

it('rejects an older installed catalog after the standing migration', async () => {
  const fixture = await setup()
  await fixture.reserve()
  fixture.deployment.provider.stop()
  await fixture.deployment.scrypt.module.close()
  await fixture.deployment.storage.close({ remove: false })
  opened.splice(opened.indexOf(fixture.deployment), 1)
  const own = identitySqlMaterials()
  const older = {
    ...own,
    migrations: own.migrations.filter(item => item.id !== '003-standing'),
    readHandlers: own.readHandlers.filter(item => item.handler !== 'identity.coordination'),
    participants: own.participants.map(item => ({
      ...item,
      ownedTables: item.ownedTables.filter(
        table => table !== 'id_standing_reservation' && table !== 'id_membership_intent',
      ),
    })),
  }
  const storage = await openSqliteStorage(fixture.deployment.storage.base, older)
  try {
    const registration = identitySqlRegistration()
    const read = await storage.storage.read({
      domain: { scope: registration.scope, transactionDomain: registration.transactionDomain },
      handler: 'identity.standing',
      protocol: '1',
      requestKey: 'old-catalog',
      input: { tenantText: fixture.binding.scopeRef },
    })
    expect(read.kind).not.toBe('read')
  } finally {
    await storage.close({ remove: true })
  }
})

it('bounds recovery pages and does not release an unavailable destination', async () => {
  const fixture = await setup()
  await fixture.reserve('page-a')
  await fixture.reserve('page-b')
  const first = await fixture.deployment.provider.reservations.recover({ limit: 1 })
  expect(first).toMatchObject({ kind: 'recovered', examined: 1, settled: 0 })
  if (first.kind !== 'recovered' || first.next === null) throw new Error('cursor')
  const second = await fixture.deployment.provider.reservations.recover({
    after: first.next,
    limit: 1,
  })
  expect(second).toMatchObject({ kind: 'recovered', examined: 1, settled: 0 })
  if (second.kind !== 'recovered' || second.next === null) throw new Error('second cursor')
  expect(second.next).not.toEqual(first.next)
  expect(
    await fixture.deployment.provider.reservations.recover({ after: second.next, limit: 1 }),
  ).toMatchObject({ kind: 'recovered', examined: 0, settled: 0, next: null })
  expect(await fixture.deployment.provider.reservations.recover({ limit: 101 })).toMatchObject({
    kind: 'unavailable',
  })
  await pending(fixture.deployment.provider.governance.removeMember(fixture.change))
})

it('negative control: bypassing the Worker gate admits a direct removal while a hold exists', async () => {
  const mutant = await mutantBuild('standing-writer-gate', [
    {
      file: 'worker/standing.js',
      from: 'export function membershipGate(port, organization, account, mode) {',
      to: "export function membershipGate(port, organization, account, mode) { if (mode?.kind !== 'prepare') return undefined;",
    },
  ])
  mutants.push(mutant)
  let captured: string | undefined
  const fixture = await setup(
    undefined,
    storage => ({
      ...storage,
      async commit(request, options) {
        const facts = request.commands[0]?.facts
        if (facts?.['kind'] === 'membership-admit' && typeof facts['facts'] === 'string')
          captured = facts['facts']
        return storage.commit(request, options)
      },
    }),
    mutant.build,
  )
  await fixture.reserve()
  await pending(fixture.deployment.provider.governance.removeMember(fixture.change))
  if (captured === undefined) throw new Error('facts')
  const registration = mutant.build.identitySqlRegistration()
  await fixture.deployment.storage.storage.commit({
    identity: {
      scope: registration.scope,
      transactionDomain: registration.transactionDomain,
      operation: 'identity.change-member',
      protocolVersion: '2',
      operationKey: 'mutant-direct',
    },
    combinationVersion: registration.combinationVersion,
    manifestDigest: registration.manifestDigest,
    commands: [{ participant: 'identity', facts: JSON.parse(captured) }],
  })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('not-member')
})

it('negative control: inventing a destination terminal releases a hold before the target closes', async () => {
  const mutant = await mutantBuild('standing-early-release', [
    {
      file: 'coordination.js',
      from: 'proof = await core.resolver.seal(reservation);',
      to: "proof = { kind: 'terminal', reservation, outcome: 'aborted' };",
    },
  ])
  mutants.push(mutant)
  const fixture = await setup(
    {
      async seal() {
        return { kind: 'unavailable', diagnostic: 'offline' }
      },
    },
    undefined,
    mutant.build,
  )
  await fixture.reserve()
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toEqual({
    kind: 'succeeded',
  })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('not-member')
})

it('negative control: reusing admission time applies a removal after the initiating login expires', async () => {
  const mutant = await mutantBuild('standing-stale-login', [
    {
      file: 'worker/standing.js',
      from: /const facts = parse\((?=[^;]*\boriginal\b)[^;]*\);/u,
      to: 'const facts = parse(original);',
    },
  ])
  mutants.push(mutant)
  let deployment: OpenedProvider | undefined
  const fixture = await setup(
    {
      async seal(reservation) {
        deployment?.clock.setTo(instant('2026-10-25T14:00:00Z'))
        return { kind: 'terminal', reservation, outcome: 'aborted' }
      },
    },
    undefined,
    mutant.build,
  )
  deployment = fixture.deployment
  await fixture.reserve()
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toEqual({
    kind: 'succeeded',
  })
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('not-member')
})

it('rechecks the selected tenant after drain and terminates the rejected intent', async () => {
  let switchSelection: (() => Promise<unknown>) | undefined
  const fixture = await setup({
    async seal(reservation) {
      await switchSelection?.()
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  switchSelection = () =>
    fixture.deployment.provider.governance.switchCurrentTenant({
      login: fixture.admin.login,
      actingTenant: fixture.organization.tenant,
      tenant: fixture.admin.tenant,
    })
  await fixture.reserve()
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toEqual({
    kind: 'denied',
  })
  expect((await fixture.reserve('after-switch-denial')).kind).toBe('held')
})

it('rechecks the acting administrator role after drain', async () => {
  let demote: (() => Promise<unknown>) | undefined
  const fixture = await setup({
    async seal(reservation) {
      await demote?.()
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  expect(
    await fixture.deployment.provider.governance.changeMemberRole({
      ...fixture.change,
      targetRole: 'super-admin',
    }),
  ).toEqual({ kind: 'succeeded' })
  demote = () =>
    fixture.deployment.provider.governance.changeMemberRole({
      ...fixture.change,
      account: fixture.admin.account,
      expectedRole: 'super-admin',
      targetRole: 'member',
    })
  await fixture.reserve()
  expect(
    await fixture.deployment.provider.governance.removeMember({
      ...fixture.change,
      expectedRole: 'super-admin',
    }),
  ).toEqual({ kind: 'denied' })
  expect((await fixture.reserve('after-role-denial')).kind).toBe('held')
})

it('keeps an unknown apply envelope unchanged until its receipt becomes known', async () => {
  let hold = false
  let silent = false
  let delayed: Parameters<SqlStorage['commit']>[0] | undefined
  const applies: string[] = []
  const fixture = await setup(undefined, storage => ({
    ...storage,
    async commit(request, options) {
      if (request.commands[0]?.facts['kind'] === 'membership-apply') {
        applies.push(JSON.stringify(request))
        if (hold) {
          delayed = request
          return { kind: 'unknown', identity: request.identity, diagnostic: 'unsent' }
        }
      }
      return storage.commit(request, options)
    },
    query: id =>
      silent && id.operationKey.includes('/apply/')
        ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'unavailable' })
        : storage.query(id),
  }))
  applies.splice(0)
  hold = true
  silent = true
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  const original = JSON.stringify(delayed)
  fixture.deployment.clock.setTo(instant('2026-10-25T12:01:00Z'))
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toEqual({ kind: 'pending', operation })
  expect(applies).toEqual([original])
  hold = false
  silent = false
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  expect(applies).toHaveLength(2)
  const first = JSON.parse(applies[0] ?? '{}')
  const second = JSON.parse(applies[1] ?? '{}')
  expect(first.identity.operationKey).not.toBe(second.identity.operationKey)
  expect(first.commands[0].facts.nowKey).not.toBe(second.commands[0].facts.nowKey)
})

it('returns the original terminal if the old apply wins before retirement', async () => {
  let hold = false
  let race = false
  let delayed: Parameters<SqlStorage['commit']>[0] | undefined
  const fixture = await setup(undefined, storage => ({
    ...storage,
    async commit(request, options) {
      if (hold && request.commands[0]?.facts['kind'] === 'membership-apply') {
        delayed = request
        return { kind: 'unknown', identity: request.identity, diagnostic: 'unsent' }
      }
      if (race && request.commands[0]?.facts['kind'] === 'membership-prepare') {
        race = false
        if (delayed === undefined) throw new Error('no old attempt')
        expect((await storage.commit(delayed)).kind).toBe('committed')
      }
      return storage.commit(request, options)
    },
  }))
  hold = true
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  hold = false
  race = true
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.admin.login,
      operation,
    }),
  ).toMatchObject({ kind: 'finished', operation, outcome: { kind: 'succeeded' } })
})

it('keeps a continuation cursor when large valid bindings fill the byte-bounded recovery page', async () => {
  const fixture = await setup({
    async seal(reservation) {
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  for (let index = 0; index < 8; index += 1) {
    expect(
      (
        await fixture.deployment.provider.reservations.reserve({
          principal: fixture.principal,
          binding: {
            ...fixture.binding,
            operationId: `large-${index}`,
            targetRef: '\u0000'.repeat(16384),
          },
          required: [],
        })
      ).kind,
    ).toBe('held')
  }
  let after: string | undefined
  let examined = 0
  for (let pass = 0; pass < 10; pass += 1) {
    const page = await fixture.deployment.provider.reservations.recover({
      limit: 100,
      ...(after === undefined ? {} : { after }),
    })
    if (page.kind !== 'recovered') throw new Error('recovery unavailable')
    examined += page.examined
    expect(page.settled).toBe(page.examined)
    if (page.next === null) break
    after = page.next
  }
  expect(examined).toBe(8)
})

it('keeps distinct issued work principals in separate logical operation namespaces', async () => {
  const fixture = await setup()
  const other = fixture.authority.issuer.issueActingForTenant({
    actor: fixture.principal.actor,
    tenant: fixture.memberTenant,
    work: { owner: 'test', work: 'another-work' },
  })
  if (!('ok' in other)) throw new Error('other principal')
  const first = await fixture.reserve()
  const second = await fixture.deployment.provider.reservations.reserve({
    principal: other.ok,
    binding: { ...fixture.binding, principalRef: standingPrincipalRef(other.ok) },
    required: [],
  })
  expect(first.kind).toBe('held')
  expect(second.kind).toBe('held')
  if (first.kind === 'held' && second.kind === 'held')
    expect(first.reservation.id).not.toBe(second.reservation.id)
})

it('lets a fresh login of the same account recover an expired original operation without renewing it', async () => {
  let available = false
  const fixture = await setup({
    async seal(reservation) {
      return available
        ? { kind: 'terminal', reservation, outcome: 'aborted' }
        : { kind: 'unavailable', diagnostic: 'offline' }
    },
  })
  await fixture.reserve()
  const operation = await pending(
    fixture.deployment.provider.governance.removeMember(fixture.change),
  )
  fixture.deployment.clock.setTo(instant('2026-10-25T14:00:00Z'))
  const fresh = await fixture.deployment.provider.operations.issueLogin({
    loginIdentifier: 'admin',
    credential: 'secret-admin',
  })
  const other = await fixture.deployment.provider.operations.issueLogin({
    loginIdentifier: 'member',
    credential: 'secret-member',
  })
  if (fresh.kind !== 'succeeded' || other.kind !== 'succeeded') throw new Error('fresh logins')
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({ login: other.login, operation }),
  ).toEqual({ kind: 'not-visible' })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({ login: fresh.login, operation }),
  ).toEqual({ kind: 'denied' })
  expect(
    await fixture.deployment.provider.governance.switchCurrentTenant({
      login: fresh.login,
      actingTenant: fixture.admin.tenant,
      tenant: fixture.organization.tenant,
    }),
  ).toMatchObject({ kind: 'succeeded' })
  available = true
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({ login: fresh.login, operation }),
  ).toEqual({ kind: 'finished', operation, outcome: { kind: 'denied' } })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({ login: fresh.login, operation }),
  ).toEqual({ kind: 'finished', operation, outcome: { kind: 'denied' } })
  expect((await fixture.reserve('after-reconnect')).kind).toBe('held')
  expect(
    (await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant })).kind,
  ).toBe('member')
})

it('retains a completed leave receipt while a fresh login lacks its original selected scope', async () => {
  let lose = false
  const fixture = await setup(undefined, storage => ({
    ...storage,
    async commit(request, options) {
      const result = await storage.commit(request, options)
      return lose && request.commands[0]?.facts['kind'] === 'membership-admit'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        : result
    },
    query: id =>
      lose
        ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'lost' })
        : storage.query(id),
  }))
  expect(
    await fixture.deployment.provider.governance.switchCurrentTenant({
      login: fixture.member.login,
      actingTenant: fixture.member.tenant,
      tenant: fixture.memberTenant,
    }),
  ).toMatchObject({ kind: 'succeeded' })
  lose = true
  const operation = await pending(
    fixture.deployment.provider.governance.leaveOrganization({
      login: fixture.member.login,
      actingTenant: fixture.memberTenant,
    }),
  )
  lose = false
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.member.login,
      operation,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  const fresh = await fixture.deployment.provider.operations.issueLogin({
    loginIdentifier: 'member',
    credential: 'secret-member',
  })
  if (fresh.kind !== 'succeeded') throw new Error('fresh login')
  expect(
    await fixture.deployment.provider.governance.switchCurrentTenant({
      login: fresh.login,
      actingTenant: fixture.member.tenant,
      tenant: fixture.memberTenant,
    }),
  ).toEqual({ kind: 'denied' })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({ login: fresh.login, operation }),
  ).toEqual({ kind: 'not-visible' })
  expect(
    await fixture.deployment.provider.governanceRecovery.resume({
      login: fixture.member.login,
      operation,
    }),
  ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
})

it('accepts a terminal whose JSON object properties arrive in a different order', async () => {
  const fixture = await setup({
    async seal(reservation) {
      const b = reservation.binding
      return {
        kind: 'terminal',
        outcome: 'aborted',
        reservation: {
          ...reservation,
          binding: {
            inputDigest: b.inputDigest,
            targetRef: b.targetRef,
            scopeRef: b.scopeRef,
            destination: b.destination,
            principalRef: b.principalRef,
            operationId: b.operationId,
            owner: b.owner,
            version: b.version,
          },
        },
      }
    },
  })
  const held = await fixture.reserve()
  if (held.kind !== 'held') throw new Error('held')
  expect(await fixture.deployment.provider.reservations.settle(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toEqual({
    kind: 'succeeded',
  })
})
it('recovers invitation acceptance by the same logical operation after admission reply loss', async () => {
  let lose = false
  const fixture = await setup(undefined, storage => ({
    ...storage,
    async commit(request, options) {
      const result = await storage.commit(request, options)
      return lose ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' } : result
    },
    query: id =>
      lose
        ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'lost' })
        : storage.query(id),
  }))
  const { governance, governanceRecovery } = fixture.deployment.provider
  expect(await governance.removeMember(fixture.change)).toEqual({ kind: 'succeeded' })
  const invitation = await governance.issueMemberInvitation({
    login: fixture.admin.login,
    actingTenant: fixture.organization.tenant,
    invitedLoginIdentifier: 'member',
  })
  if (invitation.kind !== 'succeeded') throw new Error('invitation')
  lose = true
  const operation = await pending(
    governance.acceptMemberInvitation({
      login: fixture.member.login,
      actingTenant: fixture.member.tenant,
      invitation: invitation.invitation,
      expectedState: 'open',
    }),
  )
  lose = false
  for (let attempt = 0; attempt < 2; attempt++)
    expect(
      await governanceRecovery.resume({ login: fixture.member.login, operation }),
    ).toMatchObject({
      kind: 'finished',
      operation,
      outcome: { kind: 'succeeded', state: 'accepted' },
    })
  expect(
    await fixture.deployment.provider.standing.read({ tenant: fixture.memberTenant }),
  ).toMatchObject({ kind: 'member' })
})

it('settles a never-sent request and fences late reserve across Worker reopen', async () => {
  const fixture = await setup({
    async seal(reservation) {
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  const request = { binding: fixture.binding, required: [] }
  const result = await fixture.deployment.provider.reservations.settle(request)
  expect(result).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
    reservation: { id: standingReservationId(request.binding, []) },
  })
  expect(await fixture.reserve()).toEqual(result)
  fixture.deployment.provider.stop()
  await fixture.deployment.scrypt.module.close()
  await fixture.deployment.storage.close({ remove: false })
  opened.splice(opened.indexOf(fixture.deployment), 1)
  const storage = await openSqliteStorage(fixture.deployment.storage.base)
  const replacement = await openProvider({ storage, principalVerifier: fixture.authority.verifier })
  opened.push({
    ...replacement,
    async close() {
      await replacement.close()
      await storage.close({ remove: true })
    },
  })
  expect(await replacement.provider.reservations.settle(request)).toEqual(result)
  expect(
    await replacement.provider.reservations.reserve({ ...request, principal: fixture.principal }),
  ).toEqual(result)
  expect(await replacement.provider.reservations.recover()).toMatchObject({
    kind: 'recovered',
    examined: 0,
    settled: 0,
  })
})

it('closes a denied request without granting qualifications or blocking membership changes', async () => {
  const fixture = await setup({
    async seal(reservation) {
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  const request = { binding: fixture.binding, required: ['organization-settings-manage'] as const }
  expect(
    await fixture.deployment.provider.reservations.reserve({
      ...request,
      principal: fixture.principal,
    }),
  ).toEqual({ kind: 'denied' })
  expect(await fixture.deployment.provider.reservations.settle(request)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(
    await fixture.deployment.provider.reservations.reserve({
      ...request,
      principal: fixture.principal,
    }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(await fixture.deployment.provider.governance.removeMember(fixture.change)).toMatchObject({
    kind: 'succeeded',
  })
})

it.each(['aborted', 'committed'] as const)(
  'settles reserve that wins after the initial absent read with destination %s',
  async outcome => {
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const fixture = await setup({
      async seal(reservation) {
        entered.resolve()
        await resume.promise
        return { kind: 'terminal', reservation, outcome }
      },
    })
    const pending = fixture.deployment.provider.reservations.settle({
      binding: fixture.binding,
      required: [],
    })
    await entered.promise
    expect(await fixture.reserve()).toMatchObject({ kind: 'held' })
    resume.resolve()
    expect(await pending).toMatchObject({ kind: 'terminal', outcome })
    expect(await fixture.reserve()).toMatchObject({ kind: 'terminal', outcome })
  },
)

it('does not manufacture a committed reservation or poison its later valid settlement', async () => {
  const fixture = await setup({
    async seal(reservation) {
      return { kind: 'terminal', reservation, outcome: 'committed' }
    },
  })
  const request = { binding: fixture.binding, required: [] }
  expect(await fixture.deployment.provider.reservations.settle(request)).toEqual({
    kind: 'unavailable',
    diagnostic: 'committed-reservation-missing',
  })
  expect(await fixture.reserve()).toMatchObject({ kind: 'held' })
  expect(await fixture.deployment.provider.reservations.settle(request)).toMatchObject({
    kind: 'terminal',
    outcome: 'committed',
  })
})

it('preserves a never-sent request when the destination is unavailable', async () => {
  const fixture = await setup({
    async seal() {
      return { kind: 'unavailable', diagnostic: 'offline' }
    },
  })
  expect(
    await fixture.deployment.provider.reservations.settle({
      binding: fixture.binding,
      required: [],
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(await fixture.reserve()).toMatchObject({ kind: 'held' })
})

it('rejects changed request bindings and qualifications before routing to a destination', async () => {
  let calls = 0
  const fixture = await setup({
    async seal(reservation) {
      calls += 1
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  expect(await fixture.reserve()).toMatchObject({ kind: 'held' })
  for (const binding of [
    { ...fixture.binding, destination: 'other' },
    { ...fixture.binding, inputDigest: 'other' },
  ]) {
    expect(
      await fixture.deployment.provider.reservations.settle({ binding, required: [] }),
    ).toEqual({ kind: 'operation-conflict' })
  }
  expect(
    await fixture.deployment.provider.reservations.settle({
      binding: fixture.binding,
      required: ['organization-settings-manage'],
    }),
  ).toEqual({ kind: 'operation-conflict' })
  expect(calls).toBe(0)
  expect(await fixture.reserve()).toMatchObject({ kind: 'held' })
})

it('rechecks the original binding when a competing request wins during destination sealing', async () => {
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const fixture = await setup({
    async seal(reservation) {
      entered.resolve()
      await resume.promise
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  const pending = fixture.deployment.provider.reservations.settle({
    binding: fixture.binding,
    required: [],
  })
  await entered.promise
  const other = {
    principal: fixture.principal,
    binding: { ...fixture.binding, inputDigest: 'other' },
    required: [],
  }
  const held = await fixture.deployment.provider.reservations.reserve(other)
  expect(held.kind).toBe('held')
  resume.resolve()
  expect(await pending).toEqual({ kind: 'operation-conflict' })
  expect(await fixture.deployment.provider.reservations.reserve(other)).toEqual(held)
})

it('freezes the complete request before awaiting its destination', async () => {
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const fixture = await setup({
    async seal(reservation) {
      entered.resolve()
      await resume.promise
      return { kind: 'terminal', reservation, outcome: 'aborted' }
    },
  })
  const request = { binding: { ...fixture.binding }, required: [] }
  const pending = fixture.deployment.provider.reservations.settle(request)
  await entered.promise
  request.binding.inputDigest = 'changed-after-call'
  resume.resolve()
  expect(await pending).toMatchObject({
    kind: 'terminal',
    reservation: { binding: fixture.binding },
  })
  expect(await fixture.reserve()).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
})

it('recovers a lost settlement reply without submitting a new phase', async () => {
  let lose = false
  const keys: string[] = []
  const fixture = await setup(
    {
      async seal(reservation) {
        return { kind: 'terminal', reservation, outcome: 'aborted' }
      },
    },
    storage => ({
      ...storage,
      async commit(request, options) {
        const result = await storage.commit(request, options)
        if (request.commands[0]?.facts['kind'] === 'standing-settle-request') {
          keys.push(request.identity.operationKey)
          if (lose) return { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        }
        return result
      },
      query: id =>
        lose
          ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'lost' })
          : storage.query(id),
    }),
  )
  const request = { binding: fixture.binding, required: [] }
  lose = true
  expect(await fixture.deployment.provider.reservations.settle(request)).toMatchObject({
    kind: 'unavailable',
  })
  lose = false
  expect(await fixture.deployment.provider.reservations.settle(request)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(keys).toEqual([`${standingReservationId(request.binding, [])}/settle-request/1`])
  expect(await fixture.reserve()).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
})

it('reuses one canonical settlement envelope after an unsubmitted response is lost', async () => {
  let suppress = true
  const envelopes: unknown[] = []
  const fixture = await setup(
    {
      async seal(reservation) {
        return { kind: 'terminal', reservation, outcome: 'aborted' }
      },
    },
    storage => ({
      ...storage,
      async commit(request, options) {
        if (request.commands[0]?.facts['kind'] === 'standing-settle-request') {
          envelopes.push(structuredClone(request))
          if (suppress)
            return { kind: 'unknown', identity: request.identity, diagnostic: 'transport-lost' }
        }
        return storage.commit(request, options)
      },
      query: id =>
        suppress
          ? Promise.resolve({ kind: 'unknown', identity: id, diagnostic: 'transport-lost' })
          : storage.query(id),
    }),
  )
  const request = {
    binding: fixture.binding,
    required: ['organization-settings-manage', 'organization-cost-ledger-read'] as const,
  }
  expect(await fixture.deployment.provider.reservations.settle(request)).toMatchObject({
    kind: 'unavailable',
  })
  suppress = false
  expect(
    await fixture.deployment.provider.reservations.settle({
      ...request,
      required: [
        'organization-cost-ledger-read',
        'organization-settings-manage',
        'organization-cost-ledger-read',
      ],
    }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(envelopes).toHaveLength(2)
  expect(envelopes[1]).toEqual(envelopes[0])
})
