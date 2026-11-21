import { describe, expect, it } from 'vitest'
import type { DomainRef, TenantDomainLookupResult } from '@omne-harness/sql-contract'
import type { TenantDomainRegistrationResult } from '../../../src/rows/governance/tenant-domain-registration-service.ts'
import { tenantDomainOf } from '../../../src/rows/schedule/tenant-domain.ts'

const TENANT = 'tenant/o/a'
const own: DomainRef = { scope: { kind: 'tenant', tenant: TENANT }, transactionDomain: 'td-a' }
const other: DomainRef = {
  scope: { kind: 'tenant', tenant: 'tenant/o/b' },
  transactionDomain: 'td-b',
}
const system: DomainRef = { scope: { kind: 'system' }, transactionDomain: 'td-s' }

/** A lookup answering the given results in turn, and a registration that records whether it ran. */
function world(
  answers: readonly TenantDomainLookupResult[],
  ensured?: TenantDomainRegistrationResult,
) {
  const asked: string[] = []
  const lookup = {
    async lookup(input: Readonly<{ tenant: string }>) {
      asked.push(`lookup:${input.tenant}`)
      return answers[asked.filter(step => step.startsWith('lookup')).length - 1]!
    },
  }
  const registration =
    ensured === undefined
      ? undefined
      : {
          async ensure(input: Readonly<{ tenant: string }>) {
            asked.push(`ensure:${input.tenant}`)
            return ensured
          },
        }
  return { ports: { lookup, registration }, asked }
}

const ready = (domain: DomainRef): TenantDomainLookupResult => ({ kind: 'ready', domain })
const unregistered: TenantDomainLookupResult = { kind: 'unregistered' }
const unavailable: TenantDomainLookupResult = { kind: 'unavailable', diagnostic: 'down' }

describe('tenantDomainOf: the tenant domain the schedule row opens a store in', () => {
  it.each([
    ['a registered tenant', [ready(own)], { kind: 'ready' } as const, own, 1],
    ['a lookup that is not available', [unavailable], { kind: 'ready' } as const, undefined, 1],
    ['a lookup naming another tenant', [ready(other)], { kind: 'ready' } as const, undefined, 1],
    ['a lookup naming the system scope', [ready(system)], { kind: 'ready' } as const, undefined, 1],
  ])('%s is answered by the first lookup alone', async (_, answers, ensured, expected, lookups) => {
    const w = world(answers, ensured)
    expect(await tenantDomainOf(w.ports, TENANT)).toEqual(expected)
    expect(w.asked).toHaveLength(lookups)
  })

  it('registers an unregistered tenant and then opens in the domain the lookup answers', async () => {
    const w = world([unregistered, ready(own)], { kind: 'ready' })
    expect(await tenantDomainOf(w.ports, TENANT)).toEqual(own)
    expect(w.asked).toEqual([`lookup:${TENANT}`, `ensure:${TENANT}`, `lookup:${TENANT}`])
  })

  it.each([
    ['no registration service', [unregistered], undefined],
    [
      'a registration that is not available',
      [unregistered],
      { kind: 'unavailable', diagnostic: 'x' },
    ],
    [
      'a lookup still unregistered after registering',
      [unregistered, unregistered],
      { kind: 'ready' },
    ],
    [
      'a lookup naming another tenant after registering',
      [unregistered, ready(other)],
      { kind: 'ready' },
    ],
  ] as const)('answers nothing for %s', async (_, answers, ensured) => {
    const w = world(answers, ensured)
    expect(await tenantDomainOf(w.ports, TENANT)).toBeUndefined()
  })
})
