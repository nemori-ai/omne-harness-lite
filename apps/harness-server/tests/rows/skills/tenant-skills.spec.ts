import { describe, expect, it } from 'vitest'
import { access } from '@omne-harness/legal-identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import {
  routedSkills,
  TenantSkillsHost,
  type TenantSkills,
} from '../../../src/rows/skills/tenant-skills.ts'
import { fixtureTenant } from '../../entry/support.ts'

const alpha = fixtureTenant('a')
const beta = fixtureTenant('b')

function keyOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('tenant')
  return encoded.value
}

function domainOf(tenant: TenantId): DomainRef {
  return {
    scope: { kind: 'tenant', tenant: keyOf(tenant) },
    transactionDomain: `domain-${keyOf(tenant)}`,
  }
}

function setOf(label: string, closed: string[]): TenantSkills {
  return {
    catalog: {
      summaries: async () => ({ ok: [] }),
      search: async () => ({ ok: [{ kind: 'adopted', name: label } as never] }),
    },
    access: {
      read: async () => ({ failure: { kind: 'resource-missing' } }),
      list: async () => ({ failure: { kind: 'source-unavailable' } }),
    },
    close: async () => {
      closed.push(label)
    },
  }
}

function world(
  answer: (tenant: string) => Awaited<ReturnType<TenantDomainLookup['lookup']>> = tenant => ({
    kind: 'ready',
    domain: domainOf(tenant === keyOf(alpha) ? alpha : beta),
  }),
) {
  const lookups: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  let failOpen = false
  const gates: (() => void)[] = []
  let gated = false
  const host = new TenantSkillsHost({
    domains: {
      async lookup({ tenant }) {
        lookups.push(tenant)
        return answer(tenant)
      },
    },
    async open(tenant, domain) {
      if (gated) await new Promise<void>(resolve => gates.push(resolve))
      if (failOpen) throw new Error('store down')
      opened.push(domain.transactionDomain)
      return setOf(keyOf(tenant) === keyOf(alpha) ? 'alpha' : 'beta', closed)
    },
  })
  return {
    host,
    routed: routedSkills(host),
    lookups,
    opened,
    closed,
    failNext: (value: boolean) => {
      failOpen = value
    },
    hold: () => {
      gated = true
    },
    release: () => {
      gated = false
      for (const go of gates.splice(0)) go()
    },
  }
}

describe('one Skill service set per tenant', () => {
  it('builds one set for concurrent first calls and reuses it after', async () => {
    const w = world()
    w.hold()
    const first = w.host.get(alpha)
    const second = w.host.get(alpha)
    expect(second).toBe(first)
    w.release()
    expect(await first).toBe(await second)
    expect(await w.host.get(alpha)).toBe(await first)
    expect(w.opened).toEqual([`domain-${keyOf(alpha)}`])
    expect(w.lookups).toEqual([keyOf(alpha)])
  })

  it('routes each call to the set of the tenant in its access', async () => {
    const w = world()
    expect(await w.routed.catalog.search(access('p', alpha), null, { text: '' })).toMatchObject({
      ok: [{ name: 'alpha' }],
    })
    expect(await w.routed.catalog.search(access('p', beta), null, { text: '' })).toMatchObject({
      ok: [{ name: 'beta' }],
    })
    expect(await w.routed.catalog.summaries(access('p', beta), null)).toStrictEqual({ ok: [] })
    expect(
      await w.routed.access.read(access('p', alpha), null, {
        capability: { category: 'skill', name: 'x' } as never,
        part: { kind: 'body' },
      }),
    ).toStrictEqual({ failure: { kind: 'resource-missing' } })
    expect(
      await w.routed.access.list(access('p', beta), null, {
        category: 'skill',
        name: 'x',
      } as never),
    ).toStrictEqual({ failure: { kind: 'source-unavailable' } })
  })

  it('answers no set, and keeps no failure, when the domain is not ready or the set cannot be built', async () => {
    let state: 'unregistered' | 'down' | 'ready' = 'unregistered'
    const w = world(() =>
      state === 'ready'
        ? { kind: 'ready', domain: domainOf(alpha) }
        : state === 'down'
          ? ({ kind: 'unavailable', diagnostic: 'down' } as never)
          : { kind: 'unregistered' },
    )
    expect(await w.host.get(alpha)).toBeUndefined()
    state = 'down'
    expect(await w.host.get(alpha)).toBeUndefined()
    state = 'ready'
    w.failNext(true)
    expect(await w.host.get(alpha)).toBeUndefined()
    w.failNext(false)
    expect(await w.host.get(alpha)).toBeDefined()
    expect(w.lookups).toHaveLength(4)
  })

  it('refuses a domain that belongs to another tenant', async () => {
    const w = world(() => ({ kind: 'ready', domain: domainOf(beta) }))
    expect(await w.host.get(alpha)).toBeUndefined()
    expect(w.opened).toEqual([])
  })

  it('answers unknown through the routed services when there is no set', async () => {
    const w = world(() => ({ kind: 'unregistered' }))
    expect(await w.routed.catalog.search(access('p', alpha), null, { text: '' })).toStrictEqual({
      failure: 'unknown',
    })
    expect(await w.routed.catalog.summaries(access('p', alpha), null)).toStrictEqual({
      failure: 'unknown',
    })
    expect(
      await w.routed.access.list(access('p', alpha), null, {
        category: 'skill',
        name: 'x',
      } as never),
    ).toStrictEqual({ failure: { kind: 'unknown' } })
    expect(
      await w.routed.access.read(access('p', alpha), null, {
        capability: { category: 'skill', name: 'x' } as never,
        part: { kind: 'body' },
      }),
    ).toStrictEqual({ failure: { kind: 'unknown' } })
  })

  it('closes every set it built, answers no set after closing, and closes a set that finishes building after', async () => {
    const w = world()
    await w.host.get(alpha)
    w.hold()
    const late = w.host.get(beta)
    const closing = w.host.close()
    w.release()
    await closing
    expect(await late).toBeUndefined()
    expect(w.closed.sort()).toEqual(['alpha', 'beta'])
    expect(await w.host.get(alpha)).toBeUndefined()
  })
})
