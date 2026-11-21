import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { usageSessionScopeKey, usageSourcesKey } from '@omne-harness/usage-cordis-contract/cordis'
import { UsageSourcesProvider } from '@omne-harness/usage/cordis'
import { createUsageAdaptersPlugin } from '@omne-harness/usage-adapters/cordis'

const input = {
  owners: { agent: '@omne-harness/agent', compaction: '@omne-harness/context-compaction' },
  limits: { model: { page: 200, works: 100 }, tool: { page: 500, works: 64 } },
  pageBytes: 65536,
}

describe('the usage adapters for Cordis', () => {
  it('exports the one plugin factory', async () => {
    const cordis = (await import('@omne-harness/usage-adapters/cordis')) as Record<string, unknown>
    expect(Object.keys(cordis)).toEqual(['createUsageAdaptersPlugin'])
  })

  it('registers the two sources and provides the session scope while it lives, and takes them back', async () => {
    const ctx = new Context()
    await ctx.plugin(UsageSourcesProvider)
    const fiber = await ctx.plugin(createUsageAdaptersPlugin(input))
    const registry = ctx.get(usageSourcesKey)
    expect(registry?.current().map(source => [source.name, source.limits])).toEqual([
      ['model', { page: 200, works: 100 }],
      ['tool', { page: 500, works: 64 }],
    ])
    expect(ctx.get(usageSessionScopeKey)).toBeDefined()
    expect(
      await registry?.current()[0]?.list({
        principal: {},
        tenant: {} as never,
        range: { from: '2026-11-19T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z' },
        consumer: null,
        after: null,
        limit: 1,
      }),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'the model dispatch facts read is not here' },
    })
    await fiber.dispose()
    expect(registry?.current()).toEqual([])
    expect(ctx.get(usageSessionScopeKey)).toBeUndefined()
  })

  it('does not start without the registry', async () => {
    const ctx = new Context()
    await ctx.plugin(createUsageAdaptersPlugin(input))
    expect(ctx.get(usageSessionScopeKey)).toBeUndefined()
  })
})
