import type { TenantDomainListing } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { warmRegisteredTenants } from '../../../src/rows/governance/warm-tenants.ts'

const domain = (scope: 'tenant' | 'system', tenant: string) => ({
  tenant,
  domain: {
    scope: scope === 'tenant' ? { kind: 'tenant' as const, tenant } : { kind: 'system' as const },
    transactionDomain: `domain-${tenant}`,
  },
})

function run(listing: () => Promise<TenantDomainListing>) {
  const warmed: string[] = []
  const warnings: string[] = []
  return {
    warmed,
    warnings,
    done: warmRegisteredTenants({
      listing,
      warm: tenant => warmed.push(tenant),
      warn: message => warnings.push(message),
    }),
  }
}

describe('warming the registered tenants', () => {
  it('warms every tenant-scoped domain the listing names, in its order, and nothing else', async () => {
    const seen = run(async () => ({
      kind: 'ready',
      revision: 'r1',
      entries: [domain('tenant', 't-1'), domain('system', 'sys'), domain('tenant', 't-2')],
    }))
    expect(await seen.done).toBe(2)
    expect(seen.warmed).toEqual(['t-1', 't-2'])
    expect(seen.warnings).toEqual([])
  })

  it.each([
    ['denied', async (): Promise<TenantDomainListing> => ({ kind: 'denied' })],
    [
      'unavailable',
      async (): Promise<TenantDomainListing> => ({ kind: 'unavailable', diagnostic: 'down' }),
    ],
  ])('warms nothing and says so when the listing answers %s', async (kind, listing) => {
    const seen = run(listing)
    expect(await seen.done).toBe(0)
    expect(seen.warmed).toEqual([])
    expect(seen.warnings).toEqual([
      `governance warm-up: the tenant domain listing answered ${kind}; tenants open on first use`,
    ])
  })

  it('warms nothing and says so when the listing throws', async () => {
    const seen = run(() => Promise.reject(new Error('boom')))
    expect(await seen.done).toBe(0)
    expect(seen.warmed).toEqual([])
    expect(seen.warnings).toHaveLength(1)
  })
})
