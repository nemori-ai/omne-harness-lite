import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { agentExtensionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { ExtensionSources } from '@omne-harness/loop-extension-contract'
import {
  ExtensionSourcesService,
  loopExtensionBuiltinsKey,
  loopExtensionViewsKey,
} from '@omne-harness/loop-extension-cordis-contract/cordis'
import { loopExtensionPlugin } from '@omne-harness/loop-extension-host-local/cordis'
import {
  openTenant,
  passageOf,
  probe,
  reader,
  sourcesOf,
  tenantA,
  type TenantWorld,
} from './world.ts'

const worlds: TenantWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

function sourcesService(port: ExtensionSources<unknown>) {
  return class extends ExtensionSourcesService<unknown> {
    of(...args: Parameters<ExtensionSources<unknown>['of']>) {
      return port.of(...args)
    }
  }
}

function service<
  K extends
    | typeof loopExtensionViewsKey
    | typeof loopExtensionBuiltinsKey
    | typeof agentExtensionsKey,
>(ctx: Context, key: K) {
  const found = ctx.get(key)
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

async function enabled() {
  const world = await openTenant(tenantA)
  worlds.push(world)
  const version = await world.publish(probe('probe'))
  world.setRun('probe', { kind: 'value', value: true })
  const recorded = { capability: 'probe', assetRef: world.assetRef('probe'), version }
  return { world, version, passage: passageOf(recorded) }
}

it('without the sources of the assembly the view and the implementations answer unavailable, and they answer once the sources arrive', async () => {
  const { world, version, passage } = await enabled()
  const ctx = new Context()
  await ctx.plugin(loopExtensionPlugin, {})
  const views = service(ctx, loopExtensionViewsKey)
  const implementations = service(ctx, agentExtensionsKey)
  expect(await views.read(reader(tenantA))).toEqual({
    kind: 'unavailable',
    diagnostic: 'the sources of the tenant are away',
  })
  expect(await implementations.resolve({ ...reader(tenantA), passage })).toMatchObject({
    failure: { kind: 'unavailable', owner: 'loop-extension' },
  })
  const provided = await ctx.plugin(sourcesService(sourcesOf(world) as ExtensionSources<unknown>))
  expect(await views.read(reader(tenantA))).toMatchObject({
    kind: 'view',
    view: { members: [{ capability: 'probe', version }] },
  })
  const leave = service(ctx, loopExtensionBuiltinsKey).register('probe', async () => ({
    kind: 'output',
    value: { kind: 'observed' },
  }))
  expect(await implementations.resolve({ ...reader(tenantA), passage })).toHaveProperty('ok')
  if ('ok' in leave) leave.ok()
  await provided.dispose()
  expect(await views.read(reader(tenantA))).toMatchObject({ kind: 'unavailable' })
})

it('unloading the plugin withdraws its services and leaves the sources', async () => {
  const { world } = await enabled()
  const ctx = new Context()
  await ctx.plugin(sourcesService(sourcesOf(world) as ExtensionSources<unknown>))
  const fiber = await ctx.plugin(loopExtensionPlugin, {})
  expect(await service(ctx, loopExtensionViewsKey).read(reader(tenantA))).toMatchObject({
    kind: 'view',
  })
  expect(world.listening()).toBe(1)
  await fiber.dispose()
  expect(world.listening()).toBe(0)
  for (const key of [loopExtensionViewsKey, loopExtensionBuiltinsKey, agentExtensionsKey])
    expect(ctx.get(key)).toBeUndefined()
})

it.each([
  ['a field it does not know', { anything: 1 }],
  [
    'an interpreter path that is not absolute',
    { commands: { interpreters: { node: 'node' }, env: {}, stateDirectory: '/state' } },
  ],
  [
    'a state directory that is not absolute',
    { commands: { interpreters: {}, env: {}, stateDirectory: 'state' } },
  ],
  [
    'an environment that is not texts',
    { commands: { interpreters: {}, env: { A: 1 }, stateDirectory: '/state' } },
  ],
])('the plugin refuses a configuration with %s', async (_name, config) => {
  const ctx = new Context()
  await expect(ctx.plugin(loopExtensionPlugin, config as never)).rejects.toThrow()
})
