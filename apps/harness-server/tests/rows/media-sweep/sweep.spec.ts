import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { TenantDomainListing } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { sweepEveryTenant, type MediaSweepPorts } from '../../../src/rows/media-sweep/sweep.ts'

const text = (digit: string) =>
  JSON.stringify({ organization: `org_${digit.repeat(26)}`, account: `acc_${digit.repeat(26)}` })
const entry = (tenant: string, kind: 'tenant' | 'system' = 'tenant') =>
  ({
    tenant,
    domain: {
      scope: kind === 'tenant' ? { kind, tenant } : { kind },
      transactionDomain: `d/${tenant}`,
    },
  }) as never
const ready = (...entries: never[]): TenantDomainListing => ({
  kind: 'ready',
  revision: '1',
  entries,
})
const encoded = (tenant: TenantId) => {
  const made = tenantCodec.encode(tenant)
  return made.ok ? made.value : ''
}

function world(
  listing: () => Promise<TenantDomainListing>,
  removedOf: (tenant: string) => number | 'fail' | 'throw' = () => 1,
) {
  const swept: { tenant: string; limit: number }[] = []
  const warned: string[] = []
  const ports: MediaSweepPorts = {
    custody: () => ({
      async sweep({ tenant, limit }) {
        const name = encoded(tenant)
        swept.push({ tenant: name, limit })
        const removed = removedOf(name)
        if (removed === 'throw') throw new Error('the custody broke')
        if (removed === 'fail') return { failure: { kind: 'unavailable', dependency: 'index' } }
        return { ok: { removed, more: false } }
      },
    }),
    listing,
    limit: 7,
    warn: message => warned.push(message),
  }
  return { ports, swept, warned }
}

describe('one beat of the media sweep', () => {
  it('sweeps every tenant that has a storage domain once, with the limit of the row', async () => {
    const { ports, swept, warned } = world(async () => ready(entry(text('1')), entry(text('2'))))
    expect(await sweepEveryTenant(ports)).toEqual({ tenants: 2, removed: 2, failed: 0 })
    expect(swept).toEqual([
      { tenant: text('1'), limit: 7 },
      { tenant: text('2'), limit: 7 },
    ])
    expect(warned).toEqual([])
  })

  it('leaves out a domain that is not of a tenant and a tenant text that is no tenant', async () => {
    const { ports, swept } = world(async () =>
      ready(entry(text('1')), entry(text('3'), 'system'), entry('not a tenant')),
    )
    expect(await sweepEveryTenant(ports)).toEqual({ tenants: 1, removed: 1, failed: 0 })
    expect(swept.map(call => call.tenant)).toEqual([text('1')])
  })

  it('goes on to the next tenant when one sweep fails or throws, and says how many failed', async () => {
    const { ports, swept, warned } = world(
      async () => ready(entry(text('1')), entry(text('2')), entry(text('3'))),
      tenant => (tenant === text('1') ? 'fail' : tenant === text('2') ? 'throw' : 4),
    )
    expect(await sweepEveryTenant(ports)).toEqual({ tenants: 3, removed: 4, failed: 2 })
    expect(swept).toHaveLength(3)
    expect(warned).toEqual(['the media sweep failed for 2 of 3 tenants'])
  })

  it.each([
    ['is denied', async (): Promise<TenantDomainListing> => ({ kind: 'denied' })],
    [
      'is unavailable',
      async (): Promise<TenantDomainListing> => ({ kind: 'unavailable', diagnostic: 'off' }),
    ],
    ['breaks', async (): Promise<TenantDomainListing> => Promise.reject(new Error('off'))],
  ])('sweeps nobody when the listing of tenants %s', async (_, listing) => {
    const { ports, swept } = world(listing)
    expect(await sweepEveryTenant(ports)).toEqual({ tenants: 0, removed: 0, failed: 0 })
    expect(swept).toEqual([])
  })

  it('asks for no listing and sweeps nobody while media is not loaded', async () => {
    let asked = 0
    const { ports } = world(async () => {
      asked += 1
      return ready(entry(text('1')))
    })
    expect(await sweepEveryTenant({ ...ports, custody: () => undefined })).toEqual({
      tenants: 0,
      removed: 0,
      failed: 0,
    })
    expect(asked).toBe(0)
  })
})
