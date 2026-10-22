import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  RequestContextService,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { createAssemblyInput } from '@omne-harness/request-context-contract/testing'
import type { ScopeRef, ContributionResult } from '@omne-harness/request-context-contract'
import { ProbeProvider } from './provider.js'
const source = { owner: 'test', name: 'prompt', revision: '1', digest: 'd' }
const variable = (name: string, value: string) => ({
  kind: 'variable' as const,
  name,
  value,
  volatility: 'stable' as const,
  source,
})
function current(ctx: Context, scope: ScopeRef | null) {
  const result = ctx.requestContext.contributions(scope)
  if (result.kind !== 'current') throw new Error('Registry closed')
  return result.set
}
it('exports only the Service definition and its derived key', async () => {
  expect(requestContextKey).toBe(RequestContextService.provide)
  expect(
    Object.keys(await import('@omne-harness/request-context-cordis-contract/cordis')).sort(),
  ).toEqual(['RequestContextService', 'requestContextKey'])
})
it('subclass loads under the unique key and unregisters on provider unload', async () => {
  const ctx = new Context()
  const fiber = await ctx.plugin(ProbeProvider)
  expect(ctx.get(requestContextKey)).toBeInstanceOf(ProbeProvider)
  await fiber.dispose()
  expect(ctx.get(requestContextKey)).toBeUndefined()
})
it('object inject passes each caller scope and registrations belong to contributor fibers', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  const one = createAssemblyInput().history.scope
  const two = { ...one, ref: one.ref } // a scope is compared by its opaque ref, not object identity
  const a = await ctx.plugin({
    inject: { [requestContextKey]: { scope: one } },
    apply(c) {
      c.requestContext.contributeVariable(variable('one', '1'))
    },
  })
  const b = await ctx.plugin({
    inject: { [requestContextKey]: { scope: two } },
    apply(c) {
      c.requestContext.contributeVariable(variable('two', '2'))
    },
  })
  expect(
    current(ctx, one)
      .contributions.map(x => x.name)
      .sort(),
  ).toEqual(['one', 'two'])
  await a.dispose()
  expect(current(ctx, one).contributions.map(x => x.name)).toEqual(['two'])
  await b.dispose()
  expect(current(ctx, one).contributions).toEqual([])
  await provider.dispose()
})
it('missing scope refuses registration; explicit null means global; ancestor scope is inherited', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  const scope = createAssemblyInput().history.scope
  let missing: ContributionResult | undefined
  const noScope = await ctx.plugin({
    inject: [requestContextKey],
    apply(c) {
      missing = c.requestContext.contributeVariable(variable('missing', 'x'))
    },
  })
  expect(missing).toMatchObject({ kind: 'rejected', reason: 'no-scope' })
  const global = await ctx.plugin({
    inject: { [requestContextKey]: { scope: null } },
    apply(c) {
      c.requestContext.contributeVariable(variable('global', 'g'))
    },
  })
  const inherited = await ctx.intercept(requestContextKey, { scope }).plugin({
    inject: [requestContextKey],
    apply(c) {
      c.requestContext.contributeVariable(variable('inherited', 'i'))
    },
  })
  expect(current(ctx, null).contributions.map(x => x.name)).toEqual(['global'])
  expect(
    current(ctx, scope)
      .contributions.map(x => x.name)
      .sort(),
  ).toEqual(['global', 'inherited'])
  await inherited.dispose()
  await global.dispose()
  await noScope.dispose()
  await provider.dispose()
})
it('scope shadows global; duplicate names and per-request variables are rejected without replacement', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  const scope = createAssemblyInput().history.scope
  const global = await ctx.plugin({
    inject: { [requestContextKey]: { scope: null } },
    apply(c) {
      c.requestContext.contributeVariable(variable('name', 'global'))
    },
  })
  let duplicate: ContributionResult | undefined, volatile: ContributionResult | undefined
  const local = await ctx.plugin({
    inject: { [requestContextKey]: { scope } },
    apply(c) {
      c.requestContext.contributeVariable(variable('name', 'local'))
      duplicate = c.requestContext.contributeVariable(variable('name', 'overwrite'))
      volatile = c.requestContext.contributeVariable({
        ...variable('date', 'now'),
        volatility: 'per-request',
      })
    },
  })
  expect(duplicate).toMatchObject({ kind: 'rejected', reason: 'duplicate-name' })
  expect(volatile).toMatchObject({ kind: 'rejected', reason: 'per-request-variable' })
  expect(current(ctx, scope).contributions[0]).toMatchObject({ kind: 'variable', value: 'local' })
  await local.dispose()
  expect(current(ctx, scope).contributions[0]).toMatchObject({ value: 'global' })
  await global.dispose()
  await provider.dispose()
})
it('changed event uses positional arguments, layer revisions, generation, and no content', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  const scope = createAssemblyInput().history.scope
  const received: unknown[][] = []
  ctx.on('request-context-cordis-contract/changed', (changed, revision, generation) => {
    received.push([changed, revision, generation])
  })
  const contributor = await ctx.plugin({
    inject: { [requestContextKey]: { scope } },
    apply(c) {
      c.requestContext.contributeVariable(variable('secret', 'private text'))
    },
  })
  await contributor.dispose()
  expect(received.map(x => x[1])).toEqual(['1', '2'])
  expect(received[0]?.[0]).toEqual(scope)
  expect(received[0]?.[2]).toBe(received[1]?.[2])
  expect(JSON.stringify(received)).not.toContain('private text')
  await provider.dispose()
})
it('emit filters listener contexts; global listeners bypass filtering', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  const events: string[] = []
  const one = ctx.extend(),
    two = ctx.extend()
  const a = await one.plugin(c => {
    c.on('request-context-cordis-contract/changed', () => {
      events.push('one')
    })
  })
  const b = await two.plugin(c => {
    c.on('request-context-cordis-contract/changed', () => {
      events.push('two')
    })
    c.on(
      'request-context-cordis-contract/changed',
      () => {
        events.push('global')
      },
      { global: true },
    )
  })
  ctx.emit(
    { [Context.filter]: (target: Context) => target === a.ctx },
    'request-context-cordis-contract/changed',
    null,
    '1',
    'g',
  )
  expect(events.sort()).toEqual(['global', 'one'])
  await b.dispose()
  await a.dispose()
  await provider.dispose()
})
it('ctx.set updates value without emitting request-context changed', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(ProbeProvider)
  let changed = 0
  ctx.on('request-context-cordis-contract/changed', () => {
    changed++
  })
  const original = ctx.get(requestContextKey)
  expect(original).toBeDefined()
  provider.ctx.set(requestContextKey, original)
  expect(changed).toBe(0)
  await provider.dispose()
})
