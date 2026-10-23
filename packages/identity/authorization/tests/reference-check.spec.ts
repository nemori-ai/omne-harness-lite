import { describe, expect, it } from 'vitest'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import {
  inMemoryPermitLedger,
  referenceAdmissionCheck,
  type AdmissionCheck,
  type PermitRef,
} from '@omne-harness/authorization'
import {
  DEFAULT_ROLES,
  READ_HISTORY,
  SESSION_TARGET,
  adminTenant,
  issued,
  memberTenant,
  readHistoryInput,
  standingTable,
} from './support.ts'

const CONSUMER = { owner: 'tool', work: 'call_1', position: 'start' } as const

function installed() {
  const principals = issued()
  const table = standingTable()
  const permits = inMemoryPermitLedger()
  const check = referenceAdmissionCheck({
    verifier: principals.authority.verifier,
    standing: table.source,
    permits: permits.ledger,
  })
  return { principals, table, permits, check }
}

describe('the reference admission check', () => {
  it('reads the standing of now: a revoked membership makes the next check deny', async () => {
    const { principals, table, check } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const before = await check.check(input)
    expect(before.kind).toBe('allowed')
    table.leave(adminTenant())
    const after = await check.check(input)
    expect(after).toMatchObject({ kind: 'denied', reason: 'not-member' })
    // The same principal object, unchanged, is now denied: the decision is not cached on it.
    expect(input.access.principal).toBe(principals.actingForAdmin)
    table.join(adminTenant(), DEFAULT_ROLES.member)
    const rejoined = await check.check(input)
    expect(rejoined.kind).toBe('allowed')
    expect(table.reads()).toBe(3)
  })

  it('does not keep an allowed answer: every check reads again', async () => {
    const { principals, table, check } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    await check.check(input)
    await check.check(input)
    expect(table.reads()).toBe(2)
    table.fail('directory down')
    const third = await check.check(input)
    expect(third).toEqual({ kind: 'unavailable', diagnostic: 'directory down' })
  })

  it('answers unavailable, never allowed, when a dependency throws', async () => {
    const { principals, table } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const input = readHistoryInput(principals.actingForAdmin, adminTenant())
    const throwingVerifier: PrincipalVerifier = {
      verify: () => Promise.reject(new Error('secret detail')),
    }
    const throwingStanding: TenantStandingSource = {
      read: () => {
        throw new Error('secret detail')
      },
    }
    const verifierDown = referenceAdmissionCheck({
      verifier: throwingVerifier,
      standing: table.source,
      permits: null,
    })
    const standingDown = referenceAdmissionCheck({
      verifier: principals.authority.verifier,
      standing: throwingStanding,
      permits: null,
    })
    for (const check of [verifierDown, standingDown]) {
      const decision = await check.check(input)
      expect(decision.kind).toBe('unavailable')
      if (decision.kind !== 'unavailable') return
      expect(decision.diagnostic).not.toContain('secret detail')
    }
  })

  it('denies a hand-built principal of the right shape', async () => {
    const { principals, table, check } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const copy = { ...principals.actingForAdmin }
    const decision = await check.check(readHistoryInput(copy, adminTenant()))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
  })

  it('does not read the standing for a system principal or a rejected principal', async () => {
    const { principals, table, check } = installed()
    await check.check(readHistoryInput(principals.coordinator, adminTenant()))
    await check.check(readHistoryInput({ ...principals.coordinator }, adminTenant()))
    expect(table.reads()).toBe(0)
  })

  it('is unavailable for a presented permit when no ledger is installed', async () => {
    const { principals, table, permits } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const grant = await permits.grantor.grant({
      tenant: adminTenant(),
      operation: READ_HISTORY,
      target: SESSION_TARGET,
      granted: { owner: 'hitl', record: 'card_1', revision: '1', digest: 'd' },
    })
    if (grant.kind !== 'granted') throw new Error('fixture')
    const check: AdmissionCheck = referenceAdmissionCheck({
      verifier: principals.authority.verifier,
      standing: table.source,
      permits: null,
    })
    const decision = await check.check(
      readHistoryInput(principals.actingForAdmin, adminTenant(), { permit: grant.grant.ref }),
    )
    expect(decision.kind).toBe('unavailable')
  })
})

describe('a permit through the reference check', () => {
  async function grantedRef(permits: ReturnType<typeof inMemoryPermitLedger>): Promise<PermitRef> {
    const grant = await permits.grantor.grant({
      tenant: adminTenant(),
      operation: READ_HISTORY,
      target: SESSION_TARGET,
      granted: { owner: 'hitl', record: 'card_1', revision: '1', digest: 'd' },
    })
    if (grant.kind !== 'granted') throw new Error('fixture permit was not granted')
    return grant.grant.ref
  }

  it('admits with an open permit, then denies once the permit is consumed', async () => {
    const { principals, table, permits, check } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const permit = await grantedRef(permits)
    const input = readHistoryInput(principals.actingForAdmin, adminTenant(), { permit })
    const before = await check.check(input)
    expect(before.kind).toBe('allowed')
    const consumed = await permits.ledger.consume({ permit, consumer: CONSUMER })
    expect(consumed.kind).toBe('consumed')
    const after = await check.check(input)
    expect(after).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
    const again = await permits.ledger.consume({ permit, consumer: CONSUMER })
    expect(again.kind).toBe('already-consumed')
    // Membership alone still admits the operation without the permit.
    const withoutPermit = await check.check(
      readHistoryInput(principals.actingForAdmin, adminTenant()),
    )
    expect(withoutPermit.kind).toBe('allowed')
  })

  it('denies a permit of another tenant without looking it up under that tenant', async () => {
    const { principals, table, permits, check } = installed()
    table.join(adminTenant(), DEFAULT_ROLES.superAdmin)
    const permit = await grantedRef(permits)
    const foreign = readHistoryInput(principals.actingForAdmin, adminTenant(), {
      permit: { tenant: principals.actingFor(adminTenant()).tenant, permit: permit.permit },
    })
    expect((await check.check(foreign)).kind).toBe('allowed')
    const otherTenant = { ...permit, tenant: memberTenant() }
    const decision = await check.check(
      readHistoryInput(principals.actingForAdmin, adminTenant(), { permit: otherTenant }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
  })
})
