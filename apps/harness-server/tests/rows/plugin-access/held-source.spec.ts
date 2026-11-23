import type { Principal } from '@omne-harness/access-cordis-contract'
import { digestBytes, packageBody, readBodyText, type AssetLayerSource } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  createHeldSource,
  type HeldSourcePorts,
} from '../../../src/rows/plugin-access/held-source.ts'

const encoder = new TextEncoder()
const VERSION = `sha256:${'b'.repeat(64)}`
const CARD = 'export const card = 1\n'
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'Keeps things tidy.',
  client: { members: [{ point: 'notes.card', key: 'tidy', module: 'card.js', export: 'card' }] },
})

function body() {
  const read = readBodyText(MANIFEST, {
    maxBytes: 10_000,
    maxDepth: 32,
    maxItems: 100,
    maxMembers: 100,
    maxStringLength: 1000,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error(read.kind)
  const entries = [
    { path: 'plugin.json', bytes: MANIFEST.length, digest: digestBytes(encoder.encode(MANIFEST)) },
    { path: 'card.js', bytes: CARD.length, digest: digestBytes(encoder.encode(CARD)) },
  ]
  const made = packageBody(read.value, { entries })
  if (!('ok' in made)) throw new Error('no body')
  return made.ok
}

const candidate = {
  asset: 'held/tidy',
  version: VERSION,
  disabled: false,
  immutable: false,
  replaceLocked: false,
}

const layers: readonly AssetLayerSource[] = [
  {
    layer: 'tenant',
    list: async ({ category }) => ({
      layer: 'tenant',
      state: 'read',
      page: {
        items: [
          {
            capability: { category, name: 'tidy' } as never,
            layer: 'tenant',
            asset: candidate.asset,
            version: VERSION,
            selection: 'latest' as never,
            enabled: true,
          },
        ],
        next: null,
        completeness: 'complete',
      },
    }),
    candidates: async () => ({ layer: 'tenant', state: 'read', candidates: [candidate] }),
  },
]

function world(standing: 'registered' | 'unregistered' | 'unknown' = 'registered') {
  const asked: string[] = []
  const listeners = new Map<string, () => void>()
  const local = {
    readVersion: async () => ({ kind: 'version', version: { body: body() } }),
    packages: {
      reader: (at: { assetRef: string; version: string }) => {
        asked.push(`reader ${at.assetRef} ${at.version}`)
        return {
          manifest: async () => fail('unavailable'),
          open: async (path: string) =>
            path === 'card.js' ? succeed(encoder.encode(CARD)) : fail('entry-not-found'),
        }
      },
    },
  } as unknown as AssetsLocal
  const ports: HeldSourcePorts = {
    assets: () => ({
      standing: async tenant => (asked.push(`standing ${tenant}`), standing),
      open: async tenant => (asked.push(`open ${tenant}`), local),
      layerSources: tenant => (asked.push(`layers ${tenant}`), layers),
    }),
    changes: () => ({
      subscribe(tenant, listener) {
        listeners.set(tenant, () => listener.changed())
        return () => void listeners.delete(tenant)
      },
    }),
  }
  return { ports, asked, listeners }
}

const ASKER = { principal: {} as Principal, tenant: 'alice' }
const AT = { name: 'tidy', version: 'b'.repeat(64), path: 'card.js', offset: 0, limit: 100 }

describe('the plugins a tenant holds, as a source', () => {
  it('offers the plugins the tenant holds, with a version that fits in a path', async () => {
    const list = await createHeldSource(world().ports).list(ASKER)
    if (list.kind !== 'read') throw new Error(list.kind)
    expect(list.offered.map(each => [each.manifest.name, each.version])).toEqual([
      ['tidy', 'b'.repeat(64)],
    ])
    expect(JSON.parse(list.offered[0]!.manifestText)).toEqual(JSON.parse(MANIFEST))
    expect(list.offered[0]!.files.map(file => file.path)).toEqual(['plugin.json', 'card.js'])
  })

  it('offers nothing for a tenant that was never registered: it holds nothing', async () => {
    const { ports, asked } = world('unregistered')
    const source = createHeldSource(ports)
    expect(await source.list(ASKER)).toEqual({ kind: 'read', offered: [] })
    expect(await source.read(ASKER, AT)).toEqual({ kind: 'absent', what: 'plugin' })
    expect(asked).toEqual(['standing alice', 'standing alice'])
  })

  it('is unavailable when it is not known whether the tenant is registered, or the assets are not there', async () => {
    const unknown = createHeldSource(world('unknown').ports)
    expect(await unknown.list(ASKER)).toEqual({ kind: 'unavailable' })
    expect(await unknown.read(ASKER, AT)).toEqual({ kind: 'unavailable' })
    const absent = createHeldSource({ ...world().ports, assets: () => undefined })
    expect(await absent.list(ASKER)).toEqual({ kind: 'unavailable' })
    expect(await absent.read(ASKER, AT)).toEqual({ kind: 'unavailable' })
  })

  it('reads a part of a file through the package of the version the tenant holds', async () => {
    const { ports, asked } = world()
    const read = await createHeldSource(ports).read(ASKER, { ...AT, offset: 7, limit: 5 })
    if (read.kind !== 'read') throw new Error(read.kind)
    expect([new TextDecoder().decode(read.part), read.next, read.bytes]).toEqual([
      'const',
      12,
      CARD.length,
    ])
    expect(asked).toContain(`reader held/tidy ${VERSION}`)
    expect(new Set(asked.filter(line => !line.startsWith('reader')))).toEqual(
      new Set(['standing alice', 'layers alice', 'open alice']),
    )
  })

  it.each([
    [{ ...AT, name: 'other' }, 'plugin'],
    [{ ...AT, version: 'c'.repeat(64) }, 'plugin'],
    [{ ...AT, path: 'gone.js' }, 'file'],
  ] as const)('says what is absent for %j', async (at, what) => {
    expect(await createHeldSource(world().ports).read(ASKER, at)).toEqual({ kind: 'absent', what })
  })

  it('tells the listener when the assets of the tenant change, and stops when it is told to', () => {
    const { ports, listeners } = world()
    let changes = 0
    const stop = createHeldSource(ports).subscribe('alice', () => (changes += 1))
    listeners.get('alice')?.()
    expect(changes).toBe(1)
    stop()
    expect(listeners.size).toBe(0)
  })

  it('listens to nothing when the change signal is not there', () => {
    const source = createHeldSource({ ...world().ports, changes: () => undefined })
    expect(() => source.subscribe('alice', () => undefined)()).not.toThrow()
  })
})
