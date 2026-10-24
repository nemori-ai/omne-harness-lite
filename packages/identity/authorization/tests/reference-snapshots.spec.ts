import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Principal, Qualification, TenantStandingReading } from '@omne-harness/identity'
import {
  decodePermitId,
  inMemoryPermitLedger,
  noArguments,
  referenceAdmissionCheck,
  type AdmissionInput,
  type PermitRef,
} from '@omne-harness/authorization'
import {
  DEFAULT_ROLES,
  READ_HISTORY,
  SESSION_TARGET,
  adminTenant,
  issued,
  memberTenant,
  reached,
  standingTable,
} from './support.ts'

type ReadStage = 'verifier' | 'standing' | 'permit'

function pause() {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  return {
    entered: entered.promise,
    release: () => released.resolve(),
    wait: () => {
      entered.resolve()
      return released.promise
    },
  }
}

function mutableInput(principal: Principal, tenant: TenantId, permit: PermitRef | null) {
  const requires: Qualification[] = []
  return {
    access: { principal, tenant },
    operation: { ...READ_HISTORY },
    target: { ...SESSION_TARGET },
    arguments: { ...noArguments() },
    requires,
    permit: permit === null ? null : { ...permit },
  } satisfies AdmissionInput
}

async function fixture(stage: ReadStage) {
  const principals = issued()
  const tenant = adminTenant()
  const table = standingTable()
  table.join(tenant, DEFAULT_ROLES.member)
  const permits = inMemoryPermitLedger()
  const grant = await permits.grantor.grant({
    tenant,
    operation: READ_HISTORY,
    target: SESSION_TARGET,
    arguments: noArguments(),
    granted: { owner: 'hitl', record: 'card_1', revision: '1', digest: 'd' },
  })
  if (grant.kind !== 'granted') throw new Error('fixture permit was not granted')
  const gate = pause()
  const verified: unknown[] = []
  const tenants: TenantId[] = []
  const lookedUp: PermitRef[] = []
  const check = referenceAdmissionCheck({
    verifier: {
      async verify(value) {
        verified.push(value)
        if (stage === 'verifier') await gate.wait()
        return principals.authority.verifier.verify(value)
      },
    },
    standing: {
      async read(input) {
        tenants.push(input.tenant)
        if (stage === 'standing') await gate.wait()
        return table.source.read(input)
      },
    },
    permits: {
      async lookup(input) {
        lookedUp.push(input.permit)
        if (stage === 'permit') await gate.wait()
        return permits.ledger.lookup(input)
      },
      consume: input => permits.ledger.consume(input),
    },
  })
  const input = mutableInput(principals.actingForAdmin, tenant, grant.grant.ref)
  return { check, input, gate, principals, table, permits, verified, tenants, lookedUp }
}

type MutableInput = ReturnType<typeof mutableInput>
const mutations: ReadonlyArray<readonly [string, (input: MutableInput) => void]> = [
  [
    'access wrapper',
    input => {
      input.access = { ...input.access, tenant: memberTenant() }
    },
  ],
  [
    'principal',
    input => {
      input.access.principal = issued().actingForAdmin
    },
  ],
  [
    'tenant',
    input => {
      input.access.tenant = memberTenant()
    },
  ],
  [
    'operation wrapper',
    input => {
      input.operation = { owner: 'other', name: 'other' }
    },
  ],
  [
    'operation owner',
    input => {
      input.operation.owner = 'other'
    },
  ],
  [
    'operation name',
    input => {
      input.operation.name = 'other'
    },
  ],
  [
    'target wrapper',
    input => {
      input.target = { owner: 'other', kind: 'other', key: 'other' }
    },
  ],
  [
    'target owner',
    input => {
      input.target.owner = 'other'
    },
  ],
  [
    'target kind',
    input => {
      input.target.kind = 'other'
    },
  ],
  [
    'target key',
    input => {
      input.target.key = 'other'
    },
  ],
  [
    'arguments wrapper',
    input => {
      input.arguments = { digest: 'other' }
    },
  ],
  [
    'arguments digest',
    input => {
      input.arguments.digest = 'other'
    },
  ],
  [
    'requires wrapper',
    input => {
      input.requires = ['organization-cost-ledger-read']
    },
  ],
  [
    'requires elements',
    input => {
      input.requires.push('organization-cost-ledger-read')
    },
  ],
  [
    'permit removal',
    input => {
      input.permit = null
    },
  ],
  [
    'permit wrapper',
    input => {
      if (input.permit !== null) input.permit = { ...input.permit, tenant: memberTenant() }
    },
  ],
  [
    'permit tenant',
    input => {
      if (input.permit !== null) input.permit.tenant = memberTenant()
    },
  ],
  [
    'permit text',
    input => {
      const decoded = decodePermitId('other-permit')
      if ('failure' in decoded) throw new Error('fixture permit did not decode')
      if (input.permit !== null) input.permit.permit = decoded.ok
    },
  ],
]

describe.each<ReadStage>(['verifier', 'standing', 'permit'])('input binding during %s', stage => {
  it.each(mutations)('retains the original %s', async (_name, mutate) => {
    const { check, input, gate, verified, tenants, lookedUp } = await fixture(stage)
    const original = mutableInput(input.access.principal, input.access.tenant, input.permit)
    const callerObjects = [
      input,
      input.access,
      input.operation,
      input.target,
      input.arguments,
      input.requires,
      input.permit,
    ]
    const pending = check.check(input)
    await reached(gate.entered, pending)
    expect(callerObjects.every(value => !Object.isFrozen(value))).toBe(true)
    mutate(input)
    gate.release()
    const result = await pending
    expect(result.kind).toBe('allowed')
    if (result.kind !== 'allowed') throw new Error('expected admission')
    expect(result.basis).toMatchObject({
      operation: original.operation,
      target: original.target,
      arguments: original.arguments,
      required: original.requires,
      permit: original.permit,
    })
    expect(result.basis.principal).toBe(original.access.principal)
    expect(result.basis.tenant).toBe(original.access.tenant)
    expect(result.basis.permit?.tenant).toBe(original.permit?.tenant)
    expect(verified).toEqual([original.access.principal])
    expect(tenants).toEqual([original.access.tenant])
    expect(lookedUp).toEqual([original.permit])
    expect(callerObjects.every(value => !Object.isFrozen(value))).toBe(true)
  })

  it('does not admit after the caller removes a missing qualification', async () => {
    const { check, input, gate } = await fixture(stage)
    input.requires.push('organization-cost-ledger-read')
    const pending = check.check(input)
    await reached(gate.entered, pending)
    input.requires.length = 0
    gate.release()
    expect(await pending).toMatchObject({
      kind: 'denied',
      reason: 'qualification-missing',
      basis: { required: ['organization-cost-ledger-read'] },
    })
  })

  it('does not admit after the caller removes an unknown permit', async () => {
    const { check, input, gate } = await fixture(stage)
    const permit = decodePermitId('unknown-permit')
    if ('failure' in permit) throw new Error('fixture permit did not decode')
    input.permit = { tenant: input.access.tenant, permit: permit.ok }
    const pending = check.check(input)
    await reached(gate.entered, pending)
    input.permit = null
    gate.release()
    expect(await pending).toMatchObject({
      kind: 'denied',
      reason: 'permit-unknown',
      basis: { permit: { permit: permit.ok } },
    })
  })
})

it('captures the input before calling the verifier', async () => {
  const principals = issued()
  const input = mutableInput(principals.actingForAdmin, adminTenant(), null)
  const table = standingTable()
  table.join(input.access.tenant, DEFAULT_ROLES.member)
  const check = referenceAdmissionCheck({
    verifier: {
      verify(value) {
        input.access.tenant = memberTenant()
        input.requires.push('organization-cost-ledger-read')
        return principals.authority.verifier.verify(value)
      },
    },
    standing: table.source,
    permits: null,
  })
  expect(await check.check(input)).toMatchObject({ kind: 'allowed', basis: { required: [] } })
})

it('does not combine another tenant standing with a changed access tenant', async () => {
  const { check, input, gate, table, tenants } = await fixture('standing')
  const foreign = memberTenant()
  input.access.tenant = foreign
  input.permit = null
  table.leave(adminTenant())
  table.join(foreign, DEFAULT_ROLES.superAdmin)
  input.requires.push('organization-cost-ledger-read')
  const pending = check.check(input)
  await reached(gate.entered, pending)
  input.access.tenant = adminTenant()
  gate.release()
  const result = await pending
  expect(result).toMatchObject({ kind: 'denied', reason: 'tenant-mismatch' })
  if (result.kind !== 'denied') throw new Error('expected denial')
  expect(result.basis.tenant).toBe(foreign)
  expect(result.basis.standing).toBeNull()
  expect(tenants).toEqual([foreign])
})

it('retains a verification answer while the standing source is pending', async () => {
  const principals = issued()
  const verification = { kind: 'verified' as const, principal: principals.actingForAdmin }
  const gate = pause()
  const table = standingTable()
  table.join(adminTenant(), DEFAULT_ROLES.member)
  const check = referenceAdmissionCheck({
    verifier: { verify: async () => verification },
    standing: {
      read: async input => {
        await gate.wait()
        return table.source.read(input)
      },
    },
    permits: null,
  })
  const pending = check.check(mutableInput(principals.actingForAdmin, adminTenant(), null))
  await reached(gate.entered, pending)
  verification.principal = principals.actingFor(memberTenant())
  gate.release()
  const result = await pending
  expect(result).toMatchObject({ kind: 'allowed', basis: { principal: principals.actingForAdmin } })
  expect(Object.isFrozen(verification)).toBe(false)
})

it('retains the standing read before a pending permit lookup', async () => {
  const { input, principals, permits } = await fixture('permit')
  input.requires.push('organization-cost-ledger-read')
  const qualifications: Qualification[] = []
  const standing = {
    kind: 'member' as const,
    role: { role: 'member', model: { model: 'default-team', revision: '1' } },
    qualifications,
    evidence: { record: 'original', revision: '1' },
  } satisfies TenantStandingReading
  const gate = pause()
  const check = referenceAdmissionCheck({
    verifier: principals.authority.verifier,
    standing: { read: async () => standing },
    permits: {
      lookup: async input => {
        await gate.wait()
        return permits.ledger.lookup(input)
      },
      consume: input => permits.ledger.consume(input),
    },
  })
  const pending = check.check(input)
  await reached(gate.entered, pending)
  qualifications.push('organization-cost-ledger-read')
  standing.role.role = 'super-admin'
  standing.role.model.revision = '2'
  standing.evidence.record = 'replacement'
  standing.evidence.revision = '2'
  gate.release()
  expect(await pending).toMatchObject({
    kind: 'denied',
    reason: 'qualification-missing',
    basis: {
      standing: {
        role: { role: 'member', model: { model: 'default-team', revision: '1' } },
        qualifications: [],
        evidence: { record: 'original', revision: '1' },
      },
    },
  })
  expect(
    [standing, standing.role, standing.role.model, qualifications, standing.evidence].every(
      value => !Object.isFrozen(value),
    ),
  ).toBe(true)
})
