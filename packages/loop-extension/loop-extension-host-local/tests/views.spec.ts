import { describe, expect, it } from 'vitest'
import type { AssetLayerSource } from '@omne-harness/assets'
import type { TenantExtensionSources } from '@omne-harness/loop-extension-contract'
import { createEnabledExtensionsViews } from '@omne-harness/loop-extension-host-local'
import { reader, tenantA } from './world.ts'

/** Sources that hold nothing, with a switch for each way they can fail and a count of the reads of the basis. */
function sources(
  options: Partial<{
    list: 'unavailable'
    basis(): Promise<{ assets: string; settings: string } | undefined>
  }> = {},
) {
  const listeners = new Set<() => void>()
  const counted = { basis: 0 }
  const layer: AssetLayerSource = {
    layer: 'tenant',
    async list() {
      if (options.list === 'unavailable') return { layer: 'tenant', state: 'unavailable' }
      return {
        layer: 'tenant',
        state: 'read',
        page: { items: [], next: null, completeness: 'complete' },
      }
    },
    candidates: async () => ({ layer: 'tenant', state: 'read', candidates: [] }),
  }
  const given: TenantExtensionSources = {
    layers: [layer],
    body: async () => undefined,
    run: async () => ({ kind: 'absent' }),
    locate: async () => ({ kind: 'absent' }),
    async basis() {
      counted.basis += 1
      return options.basis === undefined ? { assets: '1', settings: '1' } : options.basis()
    },
    changes: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  const change = () => {
    for (const listener of listeners) listener()
  }
  return { given, counted, change }
}

const turn = () => new Promise<void>(resolve => setImmediate(resolve))
const viewsOf = (given: TenantExtensionSources | undefined) =>
  createEnabledExtensionsViews<string>({ sources: { of: async () => given } })
const empty = { kind: 'view', view: { members: [], basis: { assets: '1', settings: '1' } } }

describe('the view of a tenant', () => {
  it.each([
    ['the sources of the tenant are away', undefined],
    ['the holdings cannot be read', sources({ list: 'unavailable' }).given],
    [
      'the revisions of the sources cannot be read',
      sources({ basis: async () => undefined }).given,
    ],
    [
      'the revisions of the sources cannot be read',
      sources({ basis: () => Promise.reject(new Error('away')) }).given,
    ],
  ] as const)('is unavailable and says why: %s', async (diagnostic, given) => {
    expect(await viewsOf(given).read(reader(tenantA))).toEqual({ kind: 'unavailable', diagnostic })
  })

  it('gives up after three computations when a change arrives during each one', async () => {
    const s = sources({
      async basis() {
        s.change()
        return { assets: '1', settings: '1' }
      },
    })
    expect(await viewsOf(s.given).read(reader(tenantA))).toEqual({
      kind: 'unavailable',
      diagnostic: 'the sources kept changing',
    })
    expect(s.counted.basis).toBe(3)
  })

  it('computes once for the readers of one moment, and again only after a change', async () => {
    const s = sources()
    const views = viewsOf(s.given)
    expect(await Promise.all([views.read(reader(tenantA)), views.read(reader(tenantA))])).toEqual([
      empty,
      empty,
    ])
    expect(s.counted.basis).toBe(1)
    s.change()
    expect(await views.read(reader(tenantA))).toEqual(empty)
    expect(s.counted.basis).toBe(2)
  })

  it('an unreadable computation that a change overtook does not drop the computation that came after it', async () => {
    const first = Promise.withResolvers<undefined>()
    const second = Promise.withResolvers<{ assets: string; settings: string }>()
    const answers = [first.promise, second.promise]
    const s = sources({ basis: () => answers.shift() ?? Promise.resolve(undefined) })
    const views = viewsOf(s.given)
    const overtaken = views.read(reader(tenantA))
    await turn()
    s.change()
    const current = views.read(reader(tenantA))
    await turn()
    expect(s.counted.basis).toBe(2)
    first.resolve(undefined)
    expect(await overtaken).toMatchObject({ kind: 'unavailable' })
    const joined = views.read(reader(tenantA))
    second.resolve({ assets: '1', settings: '1' })
    expect(await Promise.all([current, joined])).toEqual([empty, empty])
    expect(s.counted.basis).toBe(2)
  })

  it('answers that it is closed once it is closed, to a read that began before as well', async () => {
    const asked = Promise.withResolvers<TenantExtensionSources | undefined>()
    const views = createEnabledExtensionsViews<string>({ sources: { of: () => asked.promise } })
    const early = views.read(reader(tenantA))
    views.close()
    asked.resolve(sources().given)
    const closed = { kind: 'unavailable', diagnostic: 'the views are closed' }
    expect(await early).toEqual(closed)
    expect(await views.read(reader(tenantA))).toEqual(closed)
  })
})
