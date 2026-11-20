import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { UsageQuery, UsageSource } from '@omne-harness/usage-contract'
import {
  UsageSessionScopeService,
  usageKey,
  usageSourcesKey,
} from '@omne-harness/usage-cordis-contract/cordis'
import { UsageSourcesProvider, createUsagePlugin } from '@omne-harness/usage/cordis'

const LIMITS = { page: 10, pages: 10, buckets: 48 }
const tenant = { organization: { text: 'org' }, account: { text: 'acc' } } as never
const query = (scope: UsageQuery['scope']) => ({
  principal: {},
  tenant,
  scope,
  range: { from: '2026-11-19T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z' },
  zone: 'UTC',
  bucket: 'day' as const,
  groupBy: [],
})
const empty: UsageSource<unknown> = {
  name: 'model',
  limits: { page: 10, works: 10 },
  list: () => Promise.resolve({ ok: { entries: [], undated: 2, next: null } }),
}

class FixedScope extends UsageSessionScopeService<unknown> {
  readonly resolve: UsageSessionScopeService<unknown>['resolve'] = () =>
    Promise.resolve({ ok: { kind: 'found', consumers: [{ owner: 'agent', works: ['exec-1'] }] } })
}

describe('the usage entry for Cordis', () => {
  it('exports the registry and the query plugin only', async () => {
    const cordis = (await import('@omne-harness/usage/cordis')) as Record<string, unknown>
    expect(Object.keys(cordis).sort()).toEqual(['UsageSourcesProvider', 'createUsagePlugin'])
  })

  it('queries the sources registered in the tree, and takes the session scope at each query', async () => {
    const ctx = new Context()
    await ctx.plugin(UsageSourcesProvider)
    await ctx.plugin(createUsagePlugin({ limits: LIMITS }))
    expect(ctx.get(usageSourcesKey)?.register(empty)).toMatchObject({ kind: 'registered' })
    const usage = ctx.get(usageKey)
    if (usage === undefined) throw new Error('the usage service did not start')
    expect(await usage.query(query({ kind: 'tenant' }))).toMatchObject({
      ok: { coverage: { sources: ['model'], undated: 2 } },
    })
    expect(await usage.query(query({ kind: 'session', session: 's-1' }))).toMatchObject({
      failure: { kind: 'unavailable', dependency: { kind: 'session-scope' } },
    })
    await ctx.plugin(FixedScope)
    expect(await usage.query(query({ kind: 'session', session: 's-1' }))).toMatchObject({
      ok: { coverage: { sources: ['model'] } },
    })
  })

  it('does not start the query service without a registry', async () => {
    const ctx = new Context()
    await ctx.plugin(createUsagePlugin({ limits: LIMITS }))
    expect(ctx.get(usageKey)).toBeUndefined()
    const registry = await ctx.plugin(UsageSourcesProvider)
    expect(ctx.get(usageKey)).toBeDefined()
    await registry.dispose()
    expect(ctx.get(usageKey)).toBeUndefined()
  })
})
