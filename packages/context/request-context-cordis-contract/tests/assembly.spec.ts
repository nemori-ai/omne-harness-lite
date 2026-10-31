import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { AssemblyCall, ContextSources } from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'
import { ProbeProvider } from './provider.js'

const owner = { owner: 'test', name: 'sources', revision: '1', digest: 'd' }
function fixture() {
  const f = createAssemblyFixture()
  return {
    f,
    call: f.call as AssemblyCall<unknown>,
    sources: f.sources as unknown as ContextSources<unknown>,
  }
}
const section = {
  kind: 'section' as const,
  name: 'notice',
  order: '1',
  template: 'new prompt',
  uses: [],
  source: { owner: 'test', name: 'test', revision: '1', digest: 'd' },
}

it('a target without a registered source set is unavailable before any source read', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call } = fixture()
  expect(await ctx.requestContext.assembly(f.target).assemble(call)).toMatchObject({
    kind: 'unavailable',
    owner: 'source-registry',
  })
  expect(f.sources.sourceReads('history')).toBe(0)
  await fiber.dispose()
})

it('a second registration of the same target conflicts; replace publishes a new generation', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call, sources } = fixture()
  const first = await ctx.requestContext.register({
    access: call.access,
    target: f.target,
    owner,
    sources,
  })
  if (first.kind !== 'registered') throw new Error(first.kind)
  expect(
    await ctx.requestContext.register({ access: call.access, target: f.target, owner, sources }),
  ).toEqual({ kind: 'conflict' })
  const next = await ctx.requestContext.replace({
    access: call.access,
    expected: first.handle.ref,
    sources,
  })
  if (next.kind !== 'registered') throw new Error(next.kind)
  expect(next.handle.generation).not.toBe(first.handle.generation)
  // Withdrawing the old handle does not remove its successor.
  first.handle.withdraw()
  expect((await ctx.requestContext.assembly(f.target).assemble(call)).kind).toBe(
    'candidate-before-extension',
  )
  await fiber.dispose()
})

it('a registration lives on the caller fiber: unloading the registering plugin withdraws it', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call, sources } = fixture()
  const adapter = await ctx.plugin({
    inject: ['requestContext'],
    async apply(c) {
      await c.requestContext.register({ access: call.access, target: f.target, owner, sources })
    },
  })
  const operations = ctx.requestContext.assembly(f.target)
  expect((await operations.assemble(call)).kind).toBe('candidate-before-extension')
  await adapter.dispose()
  expect(await operations.assemble(call)).toMatchObject({
    kind: 'unavailable',
    owner: 'source-registry',
  })
  await fiber.dispose()
})

it('the operation group rereads live contributions; earlier candidates stay unchanged', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call, sources } = fixture()
  await ctx.requestContext.register({ access: call.access, target: f.target, owner, sources })
  const operations = ctx.requestContext.assembly(f.target)
  const before = await operations.assemble(call)
  const plugin = await ctx.plugin({
    inject: { requestContext: { scope: f.target.scope } },
    apply(c) {
      c.requestContext.contributeSection(section)
    },
  })
  const after = await operations.assemble(call)
  expect(before.kind).toBe('candidate-before-extension')
  expect(after.kind).toBe('candidate-before-extension')
  expect(JSON.stringify(before)).not.toContain('new prompt')
  expect(JSON.stringify(after)).toContain('new prompt')
  await plugin.dispose()
  expect(JSON.stringify(await operations.assemble(call))).not.toContain('new prompt')
  await fiber.dispose()
})

it('a target scope that differs from the assembly context is invalid', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call, sources } = fixture()
  const groups = f.sources.values()
  f.sources.update('prompt', {
    ...groups.prompt,
    assembleContext: {
      ...groups.prompt.assembleContext,
      scope: { ref: 'scope:other' as typeof f.target.scope.ref },
    },
  })
  await ctx.requestContext.register({ access: call.access, target: f.target, owner, sources })
  expect(await ctx.requestContext.assembly(f.target).assemble(call)).toMatchObject({
    kind: 'invalid',
  })
  await fiber.dispose()
})

it('retained operation groups refuse after the provider unloads', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    { f, call, sources } = fixture()
  await ctx.requestContext.register({ access: call.access, target: f.target, owner, sources })
  const operations = ctx.requestContext.assembly(f.target)
  await fiber.dispose()
  const reads = f.sources.sourceReads('history')
  expect(await operations.assemble(call)).toMatchObject({
    kind: 'unavailable',
    owner: 'source-registry',
  })
  expect(f.sources.sourceReads('history')).toBe(reads)
})
