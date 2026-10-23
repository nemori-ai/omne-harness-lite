import { describe, expect, it } from 'vitest'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  PERMIT_ID_MAX_LENGTH,
  decodePermitId,
  inMemoryPermitLedger,
  type PermitGrant,
  type PermitRef,
} from '@omne-harness/authorization'
import { READ_HISTORY, SESSION_TARGET, adminTenant, memberTenant } from './support.ts'

const GRANTED = { owner: 'hitl', record: 'card_1', revision: '1', digest: 'abc' } as const
const CONSUMER = { owner: 'tool', work: 'call_1', position: 'start' } as const

async function granted(ledger = inMemoryPermitLedger(), tenant: TenantId = adminTenant()) {
  const outcome = await ledger.grantor.grant({
    tenant,
    operation: READ_HISTORY,
    target: SESSION_TARGET,
    granted: GRANTED,
  })
  if (outcome.kind !== 'granted') throw new Error('fixture permit was not granted')
  return { ledger, grant: outcome.grant }
}

describe('decodePermitId', () => {
  it('accepts printable ASCII without space up to the length limit', () => {
    expect(decodePermitId('pmt_1')).toEqual({ ok: 'pmt_1' })
    expect(decodePermitId('x'.repeat(PERMIT_ID_MAX_LENGTH))).toEqual({
      ok: 'x'.repeat(PERMIT_ID_MAX_LENGTH),
    })
  })

  it.each([
    ['a number', 7, 'type'],
    ['empty text', '', 'empty'],
    ['text over the limit', 'x'.repeat(PERMIT_ID_MAX_LENGTH + 1), 'length'],
    ['a space', 'pmt 1', 'character'],
    ['a non-ASCII character', 'pmt_é', 'character'],
  ])('rejects %s with %s', (_case, value, reason) => {
    expect(decodePermitId(value)).toEqual({ failure: { field: 'PermitId', reason } })
  })
})

describe('the in-memory permit ledger', () => {
  it('grants an open permit under the tenant and finds it by reference', async () => {
    const { ledger, grant } = await granted()
    expect(tenantEquals(grant.ref.tenant, adminTenant())).toBe(true)
    expect(grant.operation).toEqual(READ_HISTORY)
    expect(grant.target).toEqual(SESSION_TARGET)
    expect(grant.granted).toEqual(GRANTED)
    await expect(ledger.ledger.lookup({ permit: grant.ref })).resolves.toEqual({
      kind: 'found',
      grant,
      state: { kind: 'open' },
    })
  })

  it('does not find a permit under another tenant, and does not tell it from a never-granted one', async () => {
    const { ledger, grant } = await granted()
    const foreign: PermitRef = { tenant: memberTenant(), permit: grant.ref.permit }
    await expect(ledger.ledger.lookup({ permit: foreign })).resolves.toEqual({ kind: 'unknown' })
    await expect(ledger.ledger.consume({ permit: foreign, consumer: CONSUMER })).resolves.toEqual({
      kind: 'unknown',
    })
    const never = decodePermitId('pmt_999')
    if ('failure' in never) throw new Error('fixture')
    await expect(
      ledger.ledger.lookup({ permit: { tenant: adminTenant(), permit: never.ok } }),
    ).resolves.toEqual({ kind: 'unknown' })
  })

  it('treats a hand-built tenant as unknown and refuses to grant under it', async () => {
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
      account: { name: 'AccountId', text: 'acc_abcdefghjkmnpqrstvwxyz2345' },
    }
    const { ledger, grant } = await granted()
    await expect(
      ledger.ledger.lookup({ permit: { tenant: forged, permit: grant.ref.permit } }),
    ).resolves.toEqual({ kind: 'unknown' })
    const outcome = await ledger.grantor.grant({
      tenant: forged,
      operation: READ_HISTORY,
      target: SESSION_TARGET,
      granted: GRANTED,
    })
    expect(outcome.kind).toBe('unavailable')
  })

  it('consumes once; a repeat answers with the original fact and makes no second consumption', async () => {
    const { ledger, grant } = await granted()
    const first = await ledger.ledger.consume({ permit: grant.ref, consumer: CONSUMER })
    expect(first.kind).toBe('consumed')
    if (first.kind !== 'consumed') return
    expect(first.fact.permit).toEqual(grant.ref)
    expect(first.fact.consumer).toEqual(CONSUMER)
    expect(first.fact.evidence.owner).toBe('authorization')
    expect(Object.isFrozen(first.fact)).toBe(true)
    const again = await ledger.ledger.consume({ permit: grant.ref, consumer: CONSUMER })
    expect(again).toEqual({ kind: 'already-consumed', fact: first.fact })
    const other = await ledger.ledger.consume({
      permit: grant.ref,
      consumer: { owner: 'tool', work: 'call_2', position: 'start' },
    })
    expect(other).toEqual({ kind: 'already-consumed', fact: first.fact })
    await expect(ledger.ledger.lookup({ permit: grant.ref })).resolves.toEqual({
      kind: 'found',
      grant,
      state: { kind: 'consumed', fact: first.fact },
    })
  })

  it('gives each grant its own permit text', async () => {
    const ledger = inMemoryPermitLedger()
    const first: PermitGrant = (await granted(ledger)).grant
    const second: PermitGrant = (await granted(ledger)).grant
    expect(first.ref.permit).not.toBe(second.ref.permit)
  })
})
