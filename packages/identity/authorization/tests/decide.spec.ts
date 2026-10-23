import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { TenantStandingReading } from '@omne-harness/identity'
import {
  decideAdmission,
  digestOf,
  type AdmissionDecision,
  type AdmissionFacts,
  type PermitLookup,
} from '@omne-harness/authorization'
import {
  ADMIN_ACCOUNT_TEXT,
  DEFAULT_ROLES,
  OTHER_ORGANIZATION_TEXT,
  READ_HISTORY,
  SESSION_TARGET,
  adminTenant,
  issued,
  memberTenant,
  parsedTenant,
  readHistoryInput,
  standingTable,
} from './support.ts'

const principals = issued()

async function memberStanding(value: TenantId, role: string): Promise<TenantStandingReading> {
  const table = standingTable()
  table.join(value, role)
  return table.source.read({ tenant: value })
}

async function allowedFacts(): Promise<AdmissionFacts> {
  return {
    principal: { kind: 'verified', principal: principals.actingForAdmin },
    standing: await memberStanding(adminTenant(), DEFAULT_ROLES.superAdmin),
    permit: null,
  }
}

function permitLookupFor(
  input: ReturnType<typeof readHistoryInput>,
  state: 'open' | 'consumed',
): PermitLookup {
  if (input.permit === null) throw new Error('fixture input has no permit')
  const grant = {
    ref: input.permit,
    operation: input.operation,
    target: input.target,
    granted: { owner: 'hitl', record: 'card_1', revision: '1', digest: 'd' },
  }
  if (state === 'open') return { kind: 'found', grant, state: { kind: 'open' } }
  return {
    kind: 'found',
    grant,
    state: {
      kind: 'consumed',
      fact: {
        permit: input.permit,
        consumer: { owner: 'tool', work: 'call_1', position: 'start' },
        evidence: { owner: 'authorization', record: 'consumption/x', revision: '2', digest: 'e' },
      },
    },
  }
}

describe('decideAdmission: allowed', () => {
  it('allows a verified acting principal that is a member of the tenant of the access', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const decision = decideAdmission(input, await allowedFacts())
    expect(decision.kind).toBe('allowed')
    if (decision.kind !== 'allowed') return
    expect(decision.basis.principal).toBe(principals.actingForAdmin)
    expect(decision.basis.standing?.kind).toBe('member')
    expect(decision.basis.operation).toEqual(READ_HISTORY)
    expect(decision.basis.target).toEqual(SESSION_TARGET)
    expect(decision.evidence.owner).toBe('authorization')
    expect(decision.evidence.record).toBe('admission/session/read-history')
    expect(decision.evidence.revision).toBe(decision.basis.standing?.evidence.revision)
    // A reader recomputes the digest from the carried basis.
    expect(decision.evidence.digest).toBe(digestOf({ kind: 'allowed', basis: decision.basis }))
    expect(Object.isFrozen(decision)).toBe(true)
  })

  it('allows the organization cost ledger read for a super administrator and denies it for a member', async () => {
    const requires = ['organization-cost-ledger-read'] as const
    const organizationTarget = {
      owner: 'model',
      kind: 'organization',
      key: 'org_abcdefghjkmnpqrstvwxyz2345',
    }
    const read = { owner: 'model', name: 'read-cost-ledger' }
    const admin = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      operation: read,
      target: organizationTarget,
      requires,
    })
    expect(decideAdmission(admin, await allowedFacts()).kind).toBe('allowed')
    const member = readHistoryInput(principals.actingFor(memberTenant()), memberTenant(), {
      operation: read,
      target: organizationTarget,
      requires,
    })
    const decision = decideAdmission(member, {
      principal: { kind: 'verified', principal: member.access.principal },
      standing: await memberStanding(memberTenant(), DEFAULT_ROLES.member),
      permit: null,
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'qualification-missing' })
  })
})

describe('decideAdmission: the principal', () => {
  it('denies a principal the verifier rejected, before any standing is read', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      principal: { kind: 'rejected' },
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    if (decision.kind !== 'denied') return
    expect(decision.basis.principal).toBeNull()
    expect(decision.basis.standing).toBeNull()
    expect(decision.evidence.revision).toBe('0')
    expect(decision.evidence.digest).toBe(
      digestOf({ kind: 'denied', reason: 'untrusted-principal', basis: decision.basis }),
    )
  })

  it('is unavailable when the verifier is unavailable, never allowed', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      principal: { kind: 'unavailable', diagnostic: 'verifier down' },
    })
    expect(decision).toEqual({ kind: 'unavailable', diagnostic: 'verifier down' })
  })

  it('denies a system principal inside a tenant access with scope-mismatch', async () => {
    const input = readHistoryInput(principals.coordinator, adminTenant())
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      principal: { kind: 'verified', principal: principals.coordinator },
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'scope-mismatch' })
  })

  it('denies an acting principal whose tenant differs from the tenant of the access', async () => {
    const input = readHistoryInput(principals.actingForAdmin, memberTenant())
    const decision = decideAdmission(input, await allowedFacts())
    expect(decision).toMatchObject({ kind: 'denied', reason: 'tenant-mismatch' })
  })

  it('denies a hand-built tenant in the access', async () => {
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
      account: { name: 'AccountId', text: ADMIN_ACCOUNT_TEXT },
    }
    expect(tenantCodec.encode(forged).ok).toBe(false)
    const input = readHistoryInput(principals.actingForAdmin, forged)
    const decision = decideAdmission(input, await allowedFacts())
    expect(decision).toMatchObject({ kind: 'denied', reason: 'tenant-mismatch' })
  })
})

describe('decideAdmission: the standing', () => {
  it('denies a tenant whose account is not a member now', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const table = standingTable()
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      standing: await table.source.read({ tenant: adminTenant() }),
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'not-member' })
    if (decision.kind !== 'denied') return
    expect(decision.basis.standing?.kind).toBe('not-member')
  })

  it.each([
    ['not read', null],
    ['unavailable', { kind: 'unavailable', diagnostic: 'directory down' } as const],
  ])('is unavailable when the standing is %s', async (_case, standing) => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const decision = decideAdmission(input, { ...(await allowedFacts()), standing })
    expect(decision.kind).toBe('unavailable')
  })

  it('denies a tenant of another organization that was never a member, with the same reason', async () => {
    const other = parsedTenant(OTHER_ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    const input = readHistoryInput(principals.actingFor(other), other)
    const decision = decideAdmission(input, {
      principal: { kind: 'verified', principal: input.access.principal },
      standing: await standingTable().source.read({ tenant: other }),
      permit: null,
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'not-member' })
  })
})

describe('decideAdmission: the permit', () => {
  const permitRef = () => ({ tenant: adminTenant(), permit: 'pmt_1' as never })

  it('allows an open permit that matches the operation and the target', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
    })
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      permit: permitLookupFor(input, 'open'),
    })
    expect(decision.kind).toBe('allowed')
    if (decision.kind !== 'allowed') return
    expect(decision.basis.permit).toEqual(input.permit)
  })

  it('denies a consumed permit, so one permit never admits twice', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
    })
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      permit: permitLookupFor(input, 'consumed'),
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
  })

  it('denies an unknown permit', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
    })
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      permit: { kind: 'unknown' },
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-unknown' })
  })

  it('denies a permit granted for another operation or target', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
    })
    const other = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
      operation: { owner: 'session', name: 'append' },
    })
    const decision = decideAdmission(input, {
      ...(await allowedFacts()),
      permit: permitLookupFor(other, 'open'),
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
  })

  it('denies a permit reference of another tenant without reading the ledger', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: { tenant: memberTenant(), permit: 'pmt_1' as never },
    })
    const decision = decideAdmission(input, { ...(await allowedFacts()), permit: null })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
  })

  it.each([
    ['not looked up', null],
    ['unavailable', { kind: 'unavailable', diagnostic: 'ledger down' } as const],
  ])('is unavailable when a presented permit is %s', async (_case, permit) => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: permitRef(),
    })
    const decision = decideAdmission(input, { ...(await allowedFacts()), permit })
    expect(decision.kind).toBe('unavailable')
  })
})

describe('decideAdmission: the order of the steps', () => {
  it('reports the first failed step: a rejected principal hides a missing membership', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const decision: AdmissionDecision = decideAdmission(input, {
      principal: { kind: 'rejected' },
      standing: await standingTable().source.read({ tenant: adminTenant() }),
      permit: null,
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
  })

  it('is a pure function: the same input and facts give the same evidence', async () => {
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const facts = await allowedFacts()
    const first = decideAdmission(input, facts)
    const again = decideAdmission(input, facts)
    expect(again).toEqual(first)
  })
})
