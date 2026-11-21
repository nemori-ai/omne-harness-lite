import type { TenantDomainListing } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { openRegisteredTenants } from '../../src/rows/registered-tenants.ts'

const domain = (scope: 'tenant' | 'system', tenant: string) => ({
  tenant,
  domain: {
    scope: scope === 'tenant' ? { kind: 'tenant' as const, tenant } : { kind: 'system' as const },
    transactionDomain: `domain-${tenant}`,
  },
})

const ready =
  (...entries: ReturnType<typeof domain>[]) =>
  async (): Promise<TenantDomainListing> => ({
    kind: 'ready',
    revision: 'r1',
    entries,
  })

function run(
  listing: () => Promise<TenantDomainListing>,
  open: (tenant: string) => void | Promise<void> = () => {},
  label = 'governance warm-up',
) {
  const opened: string[] = []
  const warnings: string[] = []
  return {
    opened,
    warnings,
    done: openRegisteredTenants(label, {
      listing,
      open: tenant => {
        opened.push(tenant)
        return open(tenant)
      },
      warn: message => warnings.push(message),
    }),
  }
}

describe('opening the registered tenants', () => {
  it('opens every tenant-scoped domain the listing names, in its order, and nothing else', async () => {
    const seen = run(
      ready(domain('tenant', 't-1'), domain('system', 'sys'), domain('tenant', 't-2')),
    )
    expect(await seen.done).toBe(2)
    expect(seen.opened).toEqual(['t-1', 't-2'])
    expect(seen.warnings).toEqual([])
  })

  it.each([
    ['denied', async (): Promise<TenantDomainListing> => ({ kind: 'denied' })],
    [
      'unavailable',
      async (): Promise<TenantDomainListing> => ({ kind: 'unavailable', diagnostic: 'down' }),
    ],
  ])('opens nothing and says so when the listing answers %s', async (kind, listing) => {
    const seen = run(listing)
    expect(await seen.done).toBe(0)
    expect(seen.opened).toEqual([])
    expect(seen.warnings).toEqual([
      `governance warm-up: the tenant domain listing answered ${kind}; tenants open on first use`,
    ])
  })

  it('opens nothing and says so when the listing throws', async () => {
    const seen = run(() => Promise.reject(new Error('boom')))
    expect(await seen.done).toBe(0)
    expect(seen.opened).toEqual([])
    expect(seen.warnings).toHaveLength(1)
  })

  it('opens each tenant once with at most four at a time, and waits for every one', async () => {
    const tenants = Array.from({ length: 9 }, (_, at) => domain('tenant', `t-${String(at)}`))
    let running = 0
    let most = 0
    const finished: string[] = []
    const seen = run(
      ready(...tenants),
      async tenant => {
        running += 1
        most = Math.max(most, running)
        await new Promise(resolve => setTimeout(resolve, 5))
        running -= 1
        finished.push(tenant)
      },
      'execution log opening',
    )
    expect(await seen.done).toBe(9)
    expect(most).toBe(4)
    expect([...seen.opened].sort()).toEqual(tenants.map(item => item.tenant).sort())
    expect(finished).toHaveLength(9)
    expect(seen.warnings).toEqual([])
  })

  it('a tenant that fails to open is said with the label of the caller, and the others still open', async () => {
    const seen = run(
      ready(domain('tenant', 't-1'), domain('tenant', 't-2'), domain('tenant', 't-3')),
      async tenant => {
        if (tenant === 't-2') throw new Error('the domain is not ready')
      },
      'execution log opening',
    )
    expect(await seen.done).toBe(3)
    expect(seen.opened).toEqual(['t-1', 't-2', 't-3'])
    expect(seen.warnings).toEqual([
      'execution log opening: the tenant t-2 did not open: the domain is not ready; it opens on first use',
    ])
  })
})
