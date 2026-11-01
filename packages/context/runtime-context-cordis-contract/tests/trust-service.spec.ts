import { readFileSync, readdirSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { RuntimeContextTrust } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import {
  RuntimeContextService,
  RuntimeContextTrustService,
  runtimeContextKey,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { plugin } from './support.js'

/** A fixture provider: the product definition is abstract and holds no implementation. */
function providerOf(trust: RuntimeContextTrust<string>) {
  return class Provider extends RuntimeContextTrustService<string> {
    readonly authority = trust.authority
    readonly bindings = trust.bindings
  }
}
function fresh() {
  const ports = createTestAuthorityPorts<string>()
  return { ports, trust: { authority: ports.authority, bindings: ports.bindings } }
}

it('the key is the static provide of the abstract class, and a different key from runtimeContext', () => {
  expect(runtimeContextTrustKey).toBe(RuntimeContextTrustService.provide)
  expect(runtimeContextTrustKey).toBe('runtimeContextTrust')
  expect(runtimeContextTrustKey).not.toBe(runtimeContextKey)
  expect(RuntimeContextService.provide).toBe('runtimeContext')
})

it('the key string is written once in the source of the package', () => {
  const dir = new URL('../src/', import.meta.url)
  const sources = readdirSync(dir).filter(name => name.endsWith('.ts'))
  const hits = sources.flatMap(name =>
    (readFileSync(new URL(name, dir), 'utf8').match(/['"]runtimeContextTrust['"]/g) ?? []).map(
      () => name,
    ),
  )
  expect(hits).toEqual(['cordis.ts'])
})

it('a real subclass is provided under the key and removed on unload', async () => {
  const ctx = new Context()
  const { trust } = fresh()
  const Provider = providerOf(trust)
  const fiber = await ctx.plugin(Provider)
  expect(ctx.get(runtimeContextTrustKey)).toBeInstanceOf(Provider)
  await fiber.dispose()
  expect(ctx.get(runtimeContextTrustKey)).toBeUndefined()
})

it('a consumer injecting the key receives exactly the two ports it was given', async () => {
  const ctx = new Context()
  const { trust } = fresh()
  await ctx.plugin(providerOf(trust))
  const seen: RuntimeContextTrust<unknown>[] = []
  await ctx.plugin(
    plugin(
      'trust-consumer',
      inner => {
        seen.push(inner.runtimeContextTrust)
      },
      [runtimeContextTrustKey],
    ),
  )
  expect(seen).toHaveLength(1)
  expect(seen[0]?.authority).toBe(trust.authority)
  expect(seen[0]?.bindings).toBe(trust.bindings)
})

it('a consumer stays pending while the key is absent and starts when it appears', async () => {
  const ctx = new Context()
  const { trust } = fresh()
  let runs = 0
  await ctx.plugin(
    plugin(
      'early-consumer',
      () => {
        runs++
      },
      [runtimeContextTrustKey],
    ),
  )
  expect(runs).toBe(0)
  await ctx.plugin(providerOf(trust))
  expect(runs).toBe(1)
})

it('providing the trust key does not provide the runtimeContext capability', async () => {
  const ctx = new Context()
  await ctx.plugin(providerOf(fresh().trust))
  expect(ctx.get(runtimeContextKey)).toBeUndefined()
})
