import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { RuntimeContextTrust } from '@omne-harness/runtime-context-contract'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type { RuntimeContextOptions } from '@omne-harness/runtime-context'
import { createRuntimeContextPlugin } from '@omne-harness/runtime-context-cordis/cordis'
import { trustOf } from './support.js'

const authority = {
  holder: async () => ({ kind: 'unknown' as const }),
  producer: async () => ({ kind: 'unknown' as const }),
  reader: async () => ({ kind: 'unknown' as const }),
}
const bindings = { lookup: async () => ({ kind: 'unknown' as const }) }
const Trust = trustOf({ authority, bindings })

/** The test-only factory override records what the plugin hands to the mechanism factory. */
function recording(seen: RuntimeContextTrust<unknown>[]) {
  return createRuntimeContextPlugin({
    mechanism: (options: RuntimeContextOptions<unknown>) => {
      seen.push(options.trust)
      return createRuntimeContext(options)
    },
  })
}

it('stays pending while the trust key is absent, and builds the mechanism once it is provided', async () => {
  const ctx = new Context()
  const seen: RuntimeContextTrust<unknown>[] = []
  await ctx.plugin(recording(seen))
  expect(seen).toEqual([])
  expect(ctx.get('runtimeContext')).toBeUndefined()
  await ctx.plugin(Trust)
  expect(seen).toHaveLength(1)
  expect(seen[0]?.authority).toBe(authority)
  expect(seen[0]?.bindings).toBe(bindings)
  expect(ctx.get('runtimeContext')).toBeDefined()
})

it('hands the factory exactly the two original ports and no other trust member', async () => {
  const ctx = new Context()
  await ctx.plugin(Trust)
  const seen: RuntimeContextTrust<unknown>[] = []
  await ctx.plugin(recording(seen))
  expect(Object.keys(seen[0] ?? {}).sort()).toEqual(['authority', 'bindings'])
})

it('falls back to pending when the trust provider unloads, and builds a new mechanism when it returns', async () => {
  const ctx = new Context()
  const provider = await ctx.plugin(Trust)
  const seen: RuntimeContextTrust<unknown>[] = []
  await ctx.plugin(recording(seen))
  expect(seen).toHaveLength(1)
  await provider.dispose()
  expect(ctx.get('runtimeContext')).toBeUndefined()
  await ctx.plugin(Trust)
  expect(seen).toHaveLength(2)
})
