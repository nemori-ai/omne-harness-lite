import type { DomainRef, SqlStorage, TenantDomainLookupResult } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { createTenantBindings } from '../../../src/rows/media-storage-sql/binding.ts'

const A = 'tenant/o/a'
const B = 'tenant/o/b'
const domainOf = (tenant: string, name: string): DomainRef => ({
  scope: { kind: 'tenant', tenant },
  transactionDomain: name,
})
const COMBINATION = { combinationVersion: 'harness-media/test', manifestDigest: 'digest-1' }
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
    combinations: 0,
  }
  const reported: string[] = []
  const bind = createTenantBindings({
    storage: {
      async registerCombination(input: Registration) {
        registered.push(input)
        if (state.register === 'throws') throw new Error('storage is down')
        return { kind: state.register === 'registered' ? 'registered' : 'invalid_storage' }
      },
    } as unknown as Pick<SqlStorage, 'registerCombination'>,
    lookup: { lookup: async ({ tenant }) => domains.get(tenant) ?? { kind: 'unregistered' } },
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
    report: (tenant, reason) => void reported.push(`${tenant}: ${reason}`),
  })
  return { bind, domains, registered, state, reported }
}

describe('where a tenant keeps the metadata of its media', () => {
  it('binds a tenant to its own domain and registers the media combination there once', async () => {
    const w = world()
    const bound = { transactionDomain: 'td-a', ...COMBINATION }
    expect(await w.bind(A)).toEqual(bound)
    expect(await w.bind(A)).toEqual(bound)
    expect(w.registered).toEqual([
      {
        scope: { kind: 'tenant', tenant: A },
        transactionDomain: 'td-a',
        ...COMBINATION,
        participants: ['media.index'],
      },
    ])
    expect(w.state.combinations).toBe(1)
  })

  it('registers once when the first calls for a tenant arrive together', async () => {
    const w = world()
    await Promise.all([w.bind(A), w.bind(A), w.bind(A)])
    expect(w.registered).toHaveLength(1)
  })

  it('gives each tenant its own domain, computes the combination once, and never binds to the domain of another', async () => {
    const w = world()
    expect((await w.bind(A))?.transactionDomain).toBe('td-a')
    expect((await w.bind(B))?.transactionDomain).toBe('td-b')
    expect(w.registered.map(input => input.scope)).toEqual([
      { kind: 'tenant', tenant: A },
      { kind: 'tenant', tenant: B },
    ])
    expect(w.state.combinations).toBe(1)
    w.domains.set('tenant/o/c', { kind: 'ready', domain: domainOf(B, 'td-b') })
    expect(await w.bind('tenant/o/c')).toBeNull()
    expect(w.registered).toHaveLength(2)
  })

  it('registers the domain of a tenant that has none yet, when somebody can', async () => {
    const w = world()
    w.domains.delete(A)
    w.state.ensure = 'ready'
    expect(await w.bind(A)).toEqual({ transactionDomain: 'td-new', ...COMBINATION })
  })

  it.each([
    [
      'the directory cannot answer',
      (w: ReturnType<typeof world>) =>
        void w.domains.set(A, { kind: 'unavailable', diagnostic: 'down' }),
    ],
    [
      'the tenant has no domain and nobody registers one',
      (w: ReturnType<typeof world>) => void w.domains.delete(A),
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
      (w: ReturnType<typeof world>) => void (w.state.register = 'refused'),
    ],
    ['the storage throws', (w: ReturnType<typeof world>) => void (w.state.register = 'throws')],
    [
      'the combination cannot be computed',
      (w: ReturnType<typeof world>) => void (w.state.combination = 'throws'),
    ],
  ])('has no binding while %s, and binds once that is over', async (_name, arrange) => {
    const w = world()
    const before = new Map(w.domains)
    arrange(w)
    expect(await w.bind(A)).toBeNull()
    expect(await w.bind(A)).toBeNull()
    for (const [tenant, answer] of before) w.domains.set(tenant, answer)
    Object.assign(w.state, { register: 'registered', combination: 'ready', ensure: undefined })
    expect(await w.bind(A)).toEqual({ transactionDomain: 'td-a', ...COMBINATION })
  })

  it.each([
    [
      'the storage refuses the combination',
      'refused',
      `${A}: the storage answered invalid_storage`,
    ],
    ['the storage throws', 'throws', `${A}: Error: storage is down`],
  ] as const)('says why when %s, once for each try', async (_name, register, line) => {
    const w = world()
    w.state.register = register
    await w.bind(A)
    await w.bind(A)
    expect(w.reported).toEqual([line, line])
  })
})
