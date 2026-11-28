import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
        items:
          category === 'plugin'
            ? [
                {
                  capability: { category, name: 'tidy' } as never,
                  layer: 'tenant',
                  asset: candidate.asset,
                  version: VERSION,
                  selection: 'latest' as never,
                  enabled: true,
                },
              ]
            : [],
        next: null,
        completeness: 'complete',
      },
    }),
    candidates: async () => ({ layer: 'tenant', state: 'read', candidates: [candidate] }),
  },
]

function world(
  standing: 'registered' | 'unregistered' | 'unknown' = 'registered',
  located: { kind: 'local-directory'; path: string } | { kind: 'absent' | 'unavailable' } = {
    kind: 'absent',
  },
) {
  const asked: string[] = []
  const listeners = new Map<string, Set<() => void>>()
  const fire = (tenant: string): void => {
    for (const listener of listeners.get(tenant) ?? []) listener()
  }
  const local = {
    readVersion: async () => ({ kind: 'version', version: { body: body() } }),
    packages: {
      locate: async (at: { assetRef: string; version: string }) => {
        asked.push(`locate ${at.assetRef} ${at.version}`)
        return located
      },
      reader: (at: { assetRef: string; version: string }) => {
        asked.push(`reader ${at.assetRef} ${at.version}`)
        return {
          manifest: async () => fail('unavailable'),
          open: async (path: string) => {
            asked.push(`open-file ${path}`)
            return path === 'card.js' ? succeed(encoder.encode(CARD)) : fail('entry-not-found')
          },
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
        const own = (): void => listener.changed()
        const of = listeners.get(tenant) ?? new Set()
        listeners.set(tenant, of.add(own))
        return () => void of.delete(own)
      },
    }),
  }
  return { ports, asked, listeners, fire }
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
    expect(new Set(asked.filter(line => !/^(reader|open-file|locate)/u.test(line)))).toEqual(
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

  it('reads a part straight from the directory of the published version, and that part alone', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-held-')))
    try {
      writeFileSync(join(directory, 'card.js'), CARD)
      const { ports, asked } = world('registered', { kind: 'local-directory', path: directory })
      const ranges: number[] = []
      const source = createHeldSource({
        ...ports,
        io: {
          digest: async () => ({ digest: '', text: null }),
          async range(path, offset, length) {
            ranges.push(length)
            return new Uint8Array(Buffer.from(CARD).subarray(offset, offset + length))
          },
        },
      })
      const read = await source.read(ASKER, { ...AT, offset: 7, limit: 5 })
      if (read.kind !== 'read') throw new Error(read.kind)
      expect([new TextDecoder().decode(read.part), read.next, read.bytes]).toEqual([
        'const',
        12,
        CARD.length,
      ])
      expect(ranges).toEqual([5])
      expect(asked).toContain(`locate held/tidy ${VERSION}`)
      expect(asked.filter(line => line.startsWith('open-file'))).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('is unavailable when the published version cannot be located, or its file is not of the size listed', async () => {
    const gone = createHeldSource(world('registered', { kind: 'unavailable' }).ports)
    expect(await gone.read(ASKER, AT)).toEqual({ kind: 'unavailable' })
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-held-')))
    try {
      writeFileSync(join(directory, 'card.js'), 'short')
      const odd = createHeldSource(
        world('registered', { kind: 'local-directory', path: directory }).ports,
      )
      expect(await odd.read(ASKER, AT)).toEqual({ kind: 'unavailable' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('tells the listener when the assets of the tenant change, and stops when it is told to', () => {
    const { ports, listeners, fire } = world()
    let changes = 0
    const stop = createHeldSource(ports).subscribe('alice', () => (changes += 1))
    fire('alice')
    expect(changes).toBe(1)
    stop()
    expect(listeners.get('alice')?.size).toBe(0)
  })

  it('reads the parts of one file with one listing of what the tenant holds and one opening of the file', async () => {
    const { ports, asked } = world()
    const source = createHeldSource(ports)
    const parts: string[] = []
    for (let offset: number | null = 0; offset !== null;) {
      const read = await source.read(ASKER, { ...AT, offset, limit: 6 })
      if (read.kind !== 'read') throw new Error(read.kind)
      parts.push(new TextDecoder().decode(read.part))
      offset = read.next
    }
    expect(parts.join('')).toBe(CARD)
    expect(parts.length).toBeGreaterThan(2)
    expect(asked.filter(line => line === 'layers alice')).toHaveLength(1)
    expect(asked.filter(line => line === 'open-file card.js')).toHaveLength(1)
  })

  it('lists anew once the assets of the tenant changed', async () => {
    const { ports, asked, fire } = world()
    const source = createHeldSource(ports)
    await source.list(ASKER)
    await source.list(ASKER)
    expect(asked.filter(line => line === 'layers alice')).toHaveLength(1)
    fire('alice')
    await source.list(ASKER)
    expect(asked.filter(line => line === 'layers alice')).toHaveLength(2)
  })

  it('keeps no listing when no change signal is there to say it went stale', async () => {
    const { ports, asked } = world()
    const source = createHeldSource({ ...ports, changes: () => undefined })
    await source.list(ASKER)
    await source.list(ASKER)
    expect(asked.filter(line => line === 'layers alice')).toHaveLength(2)
  })

  it('keeps no answer that was not a reading: a tenant that was not registered is asked again', async () => {
    const { ports, asked } = world('unregistered')
    const source = createHeldSource(ports)
    await source.list(ASKER)
    await source.list(ASKER)
    expect(asked).toEqual(['standing alice', 'standing alice'])
  })

  it('stops listening for every tenant when it is closed', async () => {
    const { ports, listeners } = world()
    const source = createHeldSource(ports)
    await source.list(ASKER)
    expect(listeners.get('alice')?.size).toBe(1)
    source.close()
    expect(listeners.get('alice')?.size).toBe(0)
  })

  it('listens to nothing when the change signal is not there', () => {
    const source = createHeldSource({ ...world().ports, changes: () => undefined })
    expect(() => source.subscribe('alice', () => undefined)()).not.toThrow()
  })
})
