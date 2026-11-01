// The trusted tenant domain lookup: the suite passes on the memory double, each scenario fails
// under a variant that breaks it, and the Service loads under its key in a real Context.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { TenantDomain, TenantDomainLookup } from '@omne-harness/sql-contract'
import { TenantDomainLookupService, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import {
  createMemoryTenantDomainLookup,
  runTenantDomainLookupConformance,
  type TenantDomainLookupFixture,
} from '@omne-harness/sql-contract/testing'

const registered: TenantDomain = {
  tenant: 'org-a/acct-a',
  domain: { scope: { kind: 'tenant', tenant: 'org-a/acct-a' }, transactionDomain: 'td-a' },
}

function fixture(wrap?: (real: TenantDomainLookup) => TenantDomainLookup) {
  return (): TenantDomainLookupFixture => {
    const real = createMemoryTenantDomainLookup([registered])
    return {
      lookup: wrap === undefined ? real : wrap(real),
      registered,
      unregistered: 'org-b/acct-b',
      setUnavailable: real.controls.setUnavailable,
    }
  }
}

const failedIds = async (make: () => TenantDomainLookupFixture) =>
  (await runTenantDomainLookupConformance(make)).failed.map(item => item.id)

describe('runTenantDomainLookupConformance', () => {
  it('passes on the memory double', async () => {
    expect(await runTenantDomainLookupConformance(fixture())).toEqual({
      passed: ['L1', 'L2', 'L3'],
      failed: [],
      notApplicable: [],
    })
  })

  it('is not applicable for the unreadable snapshot without its handle', async () => {
    const verdicts = await runTenantDomainLookupConformance(() => {
      const { setUnavailable: _s, ...rest } = fixture()()
      return rest
    })
    expect(verdicts.notApplicable).toEqual(['L3'])
    expect(verdicts.failed).toEqual([])
  })

  it('fails L1 when the lookup answers another domain', async () => {
    const variant = fixture(real => ({
      lookup: async input => {
        const result = await real.lookup(input)
        return result.kind === 'ready'
          ? { kind: 'ready', domain: { ...result.domain, transactionDomain: 'td-x' } }
          : result
      },
    }))
    expect(await failedIds(variant)).toEqual(['L1'])
  })

  it('fails L2 when the lookup registers an unknown tenant', async () => {
    const variant = fixture(real => {
      const seen = new Set<string>()
      return {
        lookup: async input => {
          if (seen.has(input.tenant))
            return { kind: 'ready', domain: { ...registered.domain, transactionDomain: 'new' } }
          seen.add(input.tenant)
          return real.lookup(input)
        },
      }
    })
    expect(await failedIds(variant)).toEqual(['L2'])
  })

  it('fails L3 when an unreadable snapshot reads as unregistered', async () => {
    const variant = fixture(real => ({
      lookup: async input => {
        const result = await real.lookup(input)
        return result.kind === 'unavailable' ? { kind: 'unregistered' } : result
      },
    }))
    expect(await failedIds(variant)).toEqual(['L3'])
  })

  it('records each request and publishes a later entry', async () => {
    const lookup = createMemoryTenantDomainLookup()
    expect(await lookup.lookup({ tenant: registered.tenant })).toEqual({ kind: 'unregistered' })
    lookup.controls.publish(registered)
    expect(await lookup.lookup({ tenant: registered.tenant })).toEqual({
      kind: 'ready',
      domain: registered.domain,
    })
    expect(lookup.controls.asked()).toEqual([
      { tenant: registered.tenant },
      { tenant: registered.tenant },
    ])
  })
})

describe('TenantDomainLookupService', () => {
  it('loads under the tenantDomainLookup key with only lookup, and leaves on unload', async () => {
    const real = createMemoryTenantDomainLookup([registered])
    class Lookup extends TenantDomainLookupService {
      readonly lookup: TenantDomainLookup['lookup'] = input => real.lookup(input)
    }
    expect(TenantDomainLookupService.provide).toBe('tenantDomainLookup')
    expect(tenantDomainLookupKey).toBe('tenantDomainLookup')
    const ctx = new Context()
    const fiber = await ctx.plugin(Lookup)
    const service = ctx.get(tenantDomainLookupKey)
    expect(service).toBeInstanceOf(Lookup)
    expect(Object.keys(service ?? {}).filter(key => key !== 'ctx' && key !== 'name')).toEqual([
      'lookup',
    ])
    await expect(service?.lookup({ tenant: registered.tenant })).resolves.toEqual({
      kind: 'ready',
      domain: registered.domain,
    })
    await fiber.dispose()
    expect(ctx.get(tenantDomainLookupKey)).toBeUndefined()
  })
})
