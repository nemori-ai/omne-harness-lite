import { describe, expect, it } from 'vitest'
import type {
  DomainRef,
  SqlStorage,
  TenantDomainListing,
  TenantDomainLookupResult,
} from '@omne-harness/sql-contract'
import { tenantIdSchema } from '@omne-harness/notification-contract'
import { createTenantBindings } from '../../../src/rows/notification/binding.ts'

const A = tenantIdSchema.parse('tenant/o/a')
const B = tenantIdSchema.parse('tenant/o/b')
const domainOf = (tenant: string, name: string): DomainRef => ({
  scope: { kind: 'tenant', tenant },
  transactionDomain: name,
})
const COMBINATION = { combinationVersion: 'harness-notification/test', manifestDigest: 'digest-1' }
type Registration = Parameters<SqlStorage['registerCombination']>[0]

function world() {
  const domains = new Map<string, TenantDomainLookupResult>([
    [A, { kind: 'ready', domain: domainOf(A, 'td-a') }],
    [B, { kind: 'ready', domain: domainOf(B, 'td-b') }],
  ])
  const registered: Registration[] = []
  const state = {
    register: 'registered' as 'registered' | 'refused' | 'throws',
    combination: 'ready' as 'ready' | 'throws',
    ensure: undefined as 'ready' | 'unavailable' | undefined,
    listing: { kind: 'ready', revision: '1', entries: [] } as TenantDomainListing | 'throws',
    lookups: 0,
    combinations: 0,
  }
  const bindings = createTenantBindings({
    storage: {
      async registerCombination(input: Registration) {
        registered.push(input)
        if (state.register === 'throws') throw new Error('storage is down')
        return { kind: state.register === 'registered' ? 'registered' : 'invalid_storage' }
      },
    } as unknown as Pick<SqlStorage, 'registerCombination'>,
    lookup: {
      async lookup({ tenant }) {
        state.lookups += 1
        return domains.get(tenant) ?? { kind: 'unregistered' }
      },
    },
    registration: () =>
      state.ensure === undefined
        ? undefined
        : {
            async ensure({ tenant }) {
              if (state.ensure === 'ready')
                domains.set(tenant, { kind: 'ready', domain: domainOf(tenant, 'td-new') })
              return state.ensure === 'ready'
                ? { kind: 'ready' }
                : { kind: 'unavailable', diagnostic: 'down' }
            },
          },
    async combination() {
      state.combinations += 1
      if (state.combination === 'throws') throw new Error('catalogue is not readable')
      return COMBINATION
    },
    async listing() {
      if (state.listing === 'throws') throw new Error('directory is down')
      return state.listing
    },
  })
  return { bindings, domains, registered, state }
}

describe('where a tenant keeps its notifications', () => {
  it('binds a tenant to its own domain and registers the combination there once', async () => {
    const w = world()
    const bound = { transactionDomain: 'td-a', ...COMBINATION }
    expect(await w.bindings.bind(A)).toEqual(bound)
    expect(await w.bindings.bind(A)).toEqual(bound)
    expect(w.registered).toEqual([
      {
        scope: { kind: 'tenant', tenant: A },
        transactionDomain: 'td-a',
        ...COMBINATION,
        participants: ['notification.persistence'],
      },
    ])
    expect(w.state.combinations).toBe(1)
  })

  it('registers once when two first calls for a tenant arrive together', async () => {
    const w = world()
    await Promise.all([w.bindings.bind(A), w.bindings.bind(A), w.bindings.bind(A)])
    expect(w.registered).toHaveLength(1)
  })

  it('gives each tenant its own domain and never the domain of another', async () => {
    const w = world()
    expect((await w.bindings.bind(A))?.transactionDomain).toBe('td-a')
    expect((await w.bindings.bind(B))?.transactionDomain).toBe('td-b')
    expect(w.registered.map(input => input.scope)).toEqual([
      { kind: 'tenant', tenant: A },
      { kind: 'tenant', tenant: B },
    ])
  })

  it('does not bind to a domain the directory gives for another tenant', async () => {
    const w = world()
    w.domains.set(A, { kind: 'ready', domain: domainOf(B, 'td-b') })
    expect(await w.bindings.bind(A)).toBeNull()
    expect(w.registered).toEqual([])
  })

  it.each([
    [
      'the directory cannot answer',
      (w: ReturnType<typeof world>) => {
        w.domains.set(A, { kind: 'unavailable', diagnostic: 'down' })
      },
    ],
    [
      'the tenant has no domain and nobody registers one',
      (w: ReturnType<typeof world>) => {
        w.domains.delete(A)
      },
    ],
    [
      'the registration of the domain fails',
      (w: ReturnType<typeof world>) => {
        w.domains.delete(A)
        w.state.ensure = 'unavailable'
      },
    ],
    [
      'the storage refuses the combination',
      (w: ReturnType<typeof world>) => {
        w.state.register = 'refused'
      },
    ],
    [
      'the storage throws',
      (w: ReturnType<typeof world>) => {
        w.state.register = 'throws'
      },
    ],
    [
      'the combination cannot be computed',
      (w: ReturnType<typeof world>) => {
        w.state.combination = 'throws'
      },
    ],
  ])('has no binding while %s, and binds once that is over', async (_name, arrange) => {
    const w = world()
    const before = new Map(w.domains)
    arrange(w)
    expect(await w.bindings.bind(A)).toBeNull()
    expect(await w.bindings.bind(A)).toBeNull()
    for (const [tenant, answer] of before) w.domains.set(tenant, answer)
    Object.assign(w.state, { register: 'registered', combination: 'ready', ensure: undefined })
    expect(await w.bindings.bind(A)).toEqual({ transactionDomain: 'td-a', ...COMBINATION })
  })

  it('registers the domain of a tenant that has none yet, then binds to it', async () => {
    const w = world()
    w.domains.delete(A)
    w.state.ensure = 'ready'
    expect(await w.bindings.bind(A)).toEqual({ transactionDomain: 'td-new', ...COMBINATION })
  })
})

describe('which tenants may hold notifications now', () => {
  it('lists the tenants that have a domain of their own', async () => {
    const w = world()
    w.state.listing = {
      kind: 'ready',
      revision: '7',
      entries: [
        { tenant: A, domain: domainOf(A, 'td-a') },
        { tenant: B, domain: domainOf(B, 'td-b') },
        { tenant: 'tenant/o/c', domain: { scope: { kind: 'system' }, transactionDomain: 'sys' } },
        { tenant: 'tenant/o/d', domain: domainOf(A, 'td-a') },
      ],
    }
    expect(await w.bindings.tenants()).toEqual([A, B])
  })

  it.each([
    ['is denied', { kind: 'denied' } as const],
    ['is unavailable', { kind: 'unavailable', diagnostic: 'down' } as const],
    ['throws', 'throws' as const],
  ])('does not know them while the directory %s', async (_name, listing) => {
    const w = world()
    w.state.listing = listing
    expect(await w.bindings.tenants()).toBeNull()
  })
})
