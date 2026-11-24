import { afterEach, describe, expect, it } from 'vitest'
import {
  createBuiltinExtensions,
  createEnabledExtensionsViews,
  createExtensionImplementations,
} from '@omne-harness/loop-extension-host-local'
import type { ExtensionInput } from '@omne-harness/agent-contract'
import {
  openTenant,
  passageOf,
  probe,
  reader,
  sourcesOf,
  tenantA,
  tenantB,
  type TenantWorld,
} from './world.ts'

const worlds: TenantWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

async function tenant(id = tenantA) {
  const world = await openTenant(id)
  worlds.push(world)
  return world
}

async function members(
  views: ReturnType<typeof createEnabledExtensionsViews<string>>,
  id = tenantA,
) {
  const read = await views.read(reader(id))
  if (read.kind !== 'view') throw new Error(JSON.stringify(read))
  return read.view.members.map(member => `${member.capability}@${member.version}`)
}

const on = { kind: 'value', value: true } as const
const input = {} as ExtensionInput
const signal = new AbortController().signal

describe('enabling, disabling and replacing an extension without a restart', () => {
  it('an extension the tenant holds runs only after run is turned on, and stops when the holding is disabled', async () => {
    const world = await tenant()
    const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
    const version = await world.publish(probe('probe'))
    expect(await members(views)).toEqual([])
    world.setRun('probe', on)
    const read = await views.read(reader(tenantA))
    expect(read).toEqual({
      kind: 'view',
      view: {
        members: [
          {
            capability: 'probe',
            assetRef: world.assetRef('probe'),
            version,
            declaration: probe('probe'),
          },
        ],
        basis: { assets: '2', settings: '1' },
      },
    })
    await world.setEnabled('probe', false)
    expect(await members(views)).toEqual([])
    await world.setEnabled('probe', true)
    expect(await members(views)).toEqual([`probe@${version}`])
    world.setRun('probe', { kind: 'value', value: false })
    expect(await members(views)).toEqual([])
  })

  it('answers from the cache until a signal of this tenant arrives', async () => {
    const world = await tenant()
    const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
    await world.publish(probe('probe'))
    world.setRun('probe', on)
    await members(views)
    const once = world.reads.list
    await members(views)
    await members(views)
    expect(world.reads.list).toBe(once)
    await world.setEnabled('probe', false)
    await members(views)
    expect(world.reads.list).toBeGreaterThan(once)
  })

  it('a new version wins the view, and a member recorded with the old version still resolves to the old implementation', async () => {
    const world = await tenant()
    const sources = sourcesOf(world)
    const views = createEnabledExtensionsViews({ sources })
    const builtins = createBuiltinExtensions()
    const calls: string[] = []
    for (const name of ['first', 'second'])
      builtins.register(name, async () => {
        calls.push(name)
        return { kind: 'output', value: { kind: 'observed' } }
      })
    const implementations = createExtensionImplementations({ sources, builtins })
    const first = await world.publish(
      probe('probe', { implementation: { kind: 'builtin', builtinName: 'first' } }),
    )
    world.setRun('probe', on)
    expect(await members(views)).toEqual([`probe@${first}`])
    const second = await world.publish(
      probe('probe', { implementation: { kind: 'builtin', builtinName: 'second' } }),
    )
    expect(second).not.toBe(first)
    expect(await members(views)).toEqual([`probe@${second}`])
    const recorded = { capability: 'probe', assetRef: world.assetRef('probe'), version: first }
    const resolved = await implementations.resolve({
      ...reader(tenantA),
      passage: passageOf(recorded),
    })
    if (!('ok' in resolved)) throw new Error(JSON.stringify(resolved))
    expect(resolved.ok.implementation).toEqual(passageOf(recorded).implementation)
    await resolved.ok.invoke(input, signal, { kind: 'fresh' })
    expect(calls).toEqual(['first'])
  })
})

describe('two tenants', () => {
  it('see only their own extensions, and one tenant cannot resolve the implementation of the other', async () => {
    const a = await tenant(tenantA)
    const b = await tenant(tenantB)
    const sources = sourcesOf(a, b)
    const views = createEnabledExtensionsViews({ sources })
    const builtins = createBuiltinExtensions()
    builtins.register('probe', async () => ({ kind: 'output', value: { kind: 'observed' } }))
    const implementations = createExtensionImplementations({ sources, builtins })
    const version = await a.publish(probe('probe'))
    a.setRun('probe', on)
    expect(await members(views, tenantA)).toEqual([`probe@${version}`])
    expect(await members(views, tenantB)).toEqual([])
    expect(b.reads.list).toBe(1)
    const listsOfA = a.reads.list
    await members(views, tenantB)
    b.setRun('probe', on)
    await members(views, tenantB)
    expect(a.reads.list).toBe(listsOfA)
    expect(await members(views, tenantA)).toEqual([`probe@${version}`])
    expect(a.reads.list).toBe(listsOfA)
    const recorded = passageOf({ capability: 'probe', assetRef: a.assetRef('probe'), version })
    expect(await implementations.resolve({ ...reader(tenantA), passage: recorded })).toHaveProperty(
      'ok',
    )
    expect(await implementations.resolve({ ...reader(tenantB), passage: recorded })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'loop-extension' },
    })
  })
})

describe('a source that cannot be read', () => {
  it('makes the view unavailable, never empty, and the next read tries again', async () => {
    const world = await tenant()
    const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
    await world.publish(probe('probe'))
    world.setRun('probe', { kind: 'unavailable' })
    expect(await views.read(reader(tenantA))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the extension probe cannot be read',
    })
    world.setRun('probe', on)
    world.broken.basis = true
    expect(await views.read(reader(tenantA))).toMatchObject({ kind: 'unavailable' })
    world.broken.basis = false
    expect(await members(views)).toHaveLength(1)
    expect(await views.read(reader(tenantB))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the sources of the tenant are away',
    })
  })

  it('a change that arrives while the view is computed makes it compute again, so the basis and the members agree', async () => {
    const world = await tenant()
    const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
    await world.publish(probe('probe'))
    world.setRun('probe', on)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    world.broken.body = async () => {
      world.broken.body = null
      entered.resolve()
      await release.promise
    }
    const reading = views.read(reader(tenantA))
    await entered.promise
    await world.setEnabled('probe', false)
    release.resolve()
    expect(await reading).toEqual({
      kind: 'view',
      view: { members: [], basis: { assets: '3', settings: '1' } },
    })
  })

  it('closing leaves every source: no listener stays behind, and later reads answer unavailable', async () => {
    const world = await tenant()
    const views = createEnabledExtensionsViews({ sources: sourcesOf(world) })
    await members(views)
    expect(world.listening()).toBe(1)
    views.close()
    expect(world.listening()).toBe(0)
    expect(await views.read(reader(tenantA))).toMatchObject({ kind: 'unavailable' })
  })
})

describe('resolving an implementation', () => {
  it('answers unavailable for a holding that is disabled, a builtin that is not registered, and a command with no runner', async () => {
    const world = await tenant()
    const sources = sourcesOf(world)
    const builtins = createBuiltinExtensions()
    const implementations = createExtensionImplementations({ sources, builtins })
    const unavailable = { failure: { kind: 'unavailable', owner: 'loop-extension' } }
    const resolve = (member: { capability: string; assetRef: string; version: string }) =>
      implementations.resolve({ ...reader(tenantA), passage: passageOf(member) })
    const version = await world.publish(probe('probe'))
    const recorded = { capability: 'probe', assetRef: world.assetRef('probe'), version }
    expect(await resolve(recorded)).toMatchObject(unavailable)
    const leave = builtins.register('probe', async () => ({ kind: 'notStartedUnavailable' }))
    if (!('ok' in leave)) throw new Error('the name was free')
    expect(builtins.register('probe', async () => ({ kind: 'notStartedUnavailable' }))).toEqual({
      failure: 'taken',
    })
    expect(await resolve(recorded)).toHaveProperty('ok')
    expect(await resolve({ ...recorded, version: 'sha256:absent' })).toMatchObject(unavailable)
    await world.setEnabled('probe', false)
    expect(await resolve(recorded)).toMatchObject(unavailable)
    await world.setEnabled('probe', true)
    leave.ok()
    leave.ok()
    expect(await resolve(recorded)).toMatchObject(unavailable)
    const script = await world.publish(
      probe('script', {
        implementation: { kind: 'command', interpreter: 'node', entry: 'run.mjs', timeout: 'PT5S' },
      }),
      { 'run.mjs': 'process.stdout.write("{}")\n' },
    )
    expect(
      await resolve({ capability: 'script', assetRef: world.assetRef('script'), version: script }),
    ).toMatchObject({ failure: { diagnostic: 'this host runs no command implementation' } })
  })

  it('refuses an identity that is not of this group', async () => {
    const world = await tenant()
    const implementations = createExtensionImplementations({
      sources: sourcesOf(world),
      builtins: createBuiltinExtensions(),
    })
    const passage = passageOf({ capability: 'probe', assetRef: 'a', version: 'v' })
    const foreign = { ...passage, implementation: { ...passage.implementation, owner: 'other' } }
    expect(await implementations.resolve({ ...reader(tenantA), passage: foreign })).toMatchObject({
      failure: { kind: 'invalid', field: 'implementation' },
    })
  })
})
