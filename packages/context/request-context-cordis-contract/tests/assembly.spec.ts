import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { AssemblyPorts } from '@omne-harness/request-context-contract'
import { createAssemblyInput } from '@omne-harness/request-context-contract/testing'
import { ProbeProvider } from './provider.js'
function fixture() {
  const input = createAssemblyInput({ promptContributions: null })
  const adoption = input.selection.profile.adoption
  let reads = 0
  const basis = {
    supplier: input.selection.profile.definition.suppliers[0],
    meter: adoption,
    tokenization: { kind: 'not-used' as const, method: adoption },
    prompt: { kind: 'provider-private' as const, estimation: adoption },
    projection: adoption,
    mediaTransform: adoption,
    replay: adoption,
    evidence: adoption,
  }
  const ports: AssemblyPorts<unknown> = {
    history: {
      async read() {
        reads++
        return { kind: 'unknown' }
      },
      async compactionContext() {
        return { kind: 'unknown' }
      },
    },
    conversions: {
      async read() {
        return { kind: 'index', entries: new Map() }
      },
    },
    serializer: { bytesOf: () => '0' },
    meter: {
      basis,
      measure() {
        throw new Error('Unexpected meter')
      },
    },
  }
  return { input, ports, reads: () => reads }
}
it('hosted operations reject supplied contributions and mismatched scope before reading ports', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    f = fixture()
  const access = ctx.requestContext.assembly(f.input.history.scope, f.ports)
  expect(access.kind).toBe('operations')
  if (access.kind !== 'operations') throw new Error('No operations')
  expect(
    await access.operations.assemble({
      ...f.input,
      promptContributions: { contributions: [], digest: 'caller', generation: null },
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'contributions-not-accepted' })
  expect(
    await access.operations.assemble({
      ...f.input,
      assembleContext: {
        ...f.input.assembleContext,
        scope: { ref: 'scope:other' as typeof f.input.history.scope.ref },
      },
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'scope-mismatch' })
  expect(f.reads()).toBe(0)
  await fiber.dispose()
})
it('assembly groups use only their supplied ports and retained operations refuse after unload', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    a = fixture(),
    b = fixture()
  const first = ctx.requestContext.assembly(a.input.history.scope, a.ports),
    second = ctx.requestContext.assembly(b.input.history.scope, b.ports)
  if (first.kind !== 'operations' || second.kind !== 'operations') throw new Error('No operations')
  expect(await first.operations.assemble(a.input)).toMatchObject({ kind: 'unknown' })
  expect(a.reads()).toBe(1)
  expect(b.reads()).toBe(0)
  await second.operations.assemble(b.input)
  expect(b.reads()).toBe(1)
  await fiber.dispose()
  expect(await first.operations.assemble(a.input)).toMatchObject({
    kind: 'unavailable',
    owner: 'instance',
  })
  expect(a.reads()).toBe(1)
})
it('an existing operation group rereads live contributions and keeps prior returned candidates unchanged', async () => {
  const ctx = new Context(),
    fiber = await ctx.plugin(ProbeProvider),
    f = fixture()
  const input = { ...f.input, history: { ...f.input.history, upper: -1 } }
  const ports: AssemblyPorts<unknown> = {
    ...f.ports,
    history: {
      ...f.ports.history,
      async read() {
        return { kind: 'page', page: { rows: [], next: null } }
      },
    },
    meter: {
      ...f.ports.meter,
      measure() {
        return {
          ok: {
            kind: 'complete',
            inputDigest: 'budget',
            counting: [f.ports.meter.basis],
            checks: [],
          },
        }
      },
    },
  }
  const access = ctx.requestContext.assembly(input.history.scope, ports)
  if (access.kind !== 'operations') throw new Error('No operations')
  const before = await access.operations.assemble(input)
  const plugin = await ctx.plugin({
    inject: { requestContext: { scope: input.history.scope } },
    apply(c) {
      c.requestContext.contributeSection({
        kind: 'section',
        name: 'notice',
        order: '1',
        template: 'new prompt',
        uses: [],
        source: { owner: 'test', name: 'test', revision: '1', digest: 'd' },
      })
    },
  })
  const after = await access.operations.assemble(input)
  expect(before.kind).toBe('candidate-before-extension')
  expect(after.kind).toBe('candidate-before-extension')
  expect(JSON.stringify(before)).not.toContain('new prompt')
  expect(JSON.stringify(after)).toContain('new prompt')
  await plugin.dispose()
  const removed = await access.operations.assemble(input)
  expect(JSON.stringify(removed)).not.toContain('new prompt')
  await fiber.dispose()
})
