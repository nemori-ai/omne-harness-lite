import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { RuntimeContextTrustService } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'

const authority = { holder: async () => ({ kind: 'unknown' }) } as never
const bindings = { lookup: async () => ({ kind: 'unknown' }) } as never
class Trust extends RuntimeContextTrustService<string> {
  readonly authority = authority
  readonly bindings = bindings
}

it('stays pending while the trust key is absent, and constructs once it is provided', async () => {
  const ctx = new Context()
  const seen: unknown[] = []
  await ctx.plugin(createRuntimeContextPlugin<string>(trust => void seen.push(trust)))
  expect(seen).toEqual([])
  await ctx.plugin(Trust)
  expect(seen).toHaveLength(1)
  expect(seen[0]).toMatchObject({ authority, bindings })
})

it('receives exactly the two original ports and no other trust member', async () => {
  const ctx = new Context()
  await ctx.plugin(Trust)
  let keys: string[] = []
  await ctx.plugin(
    createRuntimeContextPlugin<string>(trust => void (keys = Object.keys(trust).sort())),
  )
  expect(keys).toEqual(['authority', 'bindings'])
})

it('falls back to pending again when the trust provider unloads', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(Trust)
  let runs = 0
  await ctx.plugin(createRuntimeContextPlugin<string>(() => void runs++))
  expect(runs).toBe(1)
  await provider.dispose()
  await ctx.plugin(Trust)
  expect(runs).toBe(2)
})
