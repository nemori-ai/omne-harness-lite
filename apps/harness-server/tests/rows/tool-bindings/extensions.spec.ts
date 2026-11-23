import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capabilityId, digestBytes, type CapabilityId } from '@omne-harness/assets'
import { declare, empty, install, type Contract, type Registry } from '@omne-harness/dynamis'
import { readManifest } from '@omne-harness/plugin-protocol'
import type { ListedPlugin } from '@omne-harness/plugin-host-local'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createExtensionsSource,
  type ExtensionsPorts,
} from '../../../src/rows/tool-bindings/extensions.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'extensions-ws-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, ...path.split('/'))
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  return root
}

const manifestText = (name: string, members: readonly unknown[]): string =>
  JSON.stringify({ schema: 1, name, summary: `The ${name} plugin.`, client: { members } })

function listed(name: string, members: readonly unknown[], enabled = true): ListedPlugin {
  const read = readManifest(manifestText(name, members))
  if (read.kind !== 'read') throw new Error(read.reason)
  return {
    name,
    enabled,
    manifest: read.manifest,
    held: { asset: `held/${name}`, version: `sha256:${'a'.repeat(64)}` },
  }
}

const SEND = { point: 'shell.part-style', key: 'session.composer.send', data: { base: {} } }

const contract = (name: string, kind: Contract['item']['kind'], binding: Contract['binding']) =>
  ({
    name,
    tree: 'server',
    arity: 'keyed-one',
    keyFrom: null,
    key: 'a name',
    gives: 'nothing',
    item: { kind, fields: {} },
    resolve: 'most-specific',
    binding,
    onError: 'nothing',
    version: 1,
    revision: 1,
    keys: 'private',
    conformance: null,
    summary: `The ${name} point.`,
  }) satisfies Contract

function registryWith(contracts: readonly Contract[]): Registry {
  const made = install(
    empty,
    { fiber: 'test', generation: 1 },
    contracts.map(each => declare(each)),
  )
  if (made.kind !== 'installed') throw new Error(JSON.stringify(made))
  return made.registry
}

const plugin = (name: string): CapabilityId => {
  const made = capabilityId('plugin', name)
  if (!made.ok) throw new Error('capability')
  return made.id
}

function world(over: Partial<ExtensionsPorts> = {}) {
  const asked: string[] = []
  const ports: ExtensionsPorts = {
    faces: () => undefined,
    workingDirectory: async () => 'absent',
    listed: async tenant => (asked.push(`listed ${tenant}`), { kind: 'read', plugins: [] }),
    registry: () => registryWith([contract('skill.skills', 'data', 'run')]),
    reports: tenant => (asked.push(`reports ${tenant}`), []),
    describe: async () => ({ kind: 'absent' }),
    pointOf: () => undefined,
    revision: () => 'abcd.3',
    serverLoads: false,
    ...over,
  }
  const source = createExtensionsSource(ports, { tenant: 'alice', principal: { who: 'alice' } })
  return { source, asked }
}

describe('a directory of the working directory of the call, as a package', () => {
  it('lists its files with their sizes and digests, and opens one that is as listed', async () => {
    const root = workspace({
      'plugins/tidy/plugin.json': '{"schema":1}',
      'plugins/tidy/client/card.js': 'export const a = 1\n',
      'plugins/tidy/.DS_Store': 'finder',
      'plugins/other/plugin.json': '{}',
    })
    const { source } = world({ workingDirectory: async () => root })
    const pkg = await source.directory('plugins/tidy')
    if (typeof pkg === 'string') throw new Error(pkg)
    const manifest = await pkg.manifest()
    if (!('ok' in manifest)) throw new Error('manifest')
    const bytes = new TextEncoder().encode('export const a = 1\n')
    expect(manifest.ok.entries).toEqual([
      { path: 'client/card.js', bytes: bytes.length, digest: digestBytes(bytes) },
      {
        path: 'plugin.json',
        bytes: 12,
        digest: digestBytes(new TextEncoder().encode('{"schema":1}')),
      },
    ])
    const opened = await pkg.open('client/card.js', digestBytes(bytes))
    expect('ok' in opened && new TextDecoder().decode(opened.ok)).toBe('export const a = 1\n')
    expect(await pkg.open('client/card.js', 'sha256:other')).toEqual({
      failure: 'material-unavailable',
    })
    expect(await pkg.open('../other/plugin.json', 'sha256:x')).toEqual({
      failure: 'entry-not-found',
    })
  })

  it.each([
    ['a path that steps up', '../outside'],
    ['an absolute path', '/etc'],
    ['an empty path', ''],
    ['a path with an empty segment', 'plugins//tidy'],
    ['a file, not a directory', 'plugins/tidy/plugin.json'],
    ['a directory that is not there', 'plugins/none'],
  ])('answers absent for %s', async (_name, path) => {
    const root = workspace({ 'plugins/tidy/plugin.json': '{}' })
    const { source } = world({ workingDirectory: async () => root })
    expect(await source.directory(path)).toBe('absent')
  })

  it('answers absent for a link that leads out of the working directory', async () => {
    const outside = workspace({ 'secret/plugin.json': '{}' })
    const root = workspace({ 'plugins/tidy/plugin.json': '{}' })
    symlinkSync(join(outside, 'secret'), join(root, 'plugins', 'leak'))
    const { source } = world({ workingDirectory: async () => root })
    expect(await source.directory('plugins/leak')).toBe('absent')
  })

  it('says what the call has for a working directory: none, or one that cannot be asked about', async () => {
    expect(await world().source.directory('plugins/tidy')).toBe('absent')
    const gone = world({ workingDirectory: async () => 'unavailable' })
    expect(await gone.source.directory('plugins/tidy')).toBe('unavailable')
  })
})

describe('what a change of a plugin would do', () => {
  const tidy = { 'plugins/tidy/plugin.json': manifestText('tidy', [SEND]) }

  async function contentOf(root: string, source: ReturnType<typeof world>['source']) {
    const from = await source.directory('plugins/tidy')
    if (typeof from === 'string') throw new Error(from)
    void root
    return { kind: 'directory', from } as const
  }

  it('reads the manifest of a directory not yet published, and asks as the tenant of the call', async () => {
    const root = workspace(tidy)
    const { source, asked } = world({
      workingDirectory: async () => root,
      reports: tenant => {
        asked.push(`reports ${tenant}`)
        return [
          {
            client: 'desktop-1',
            plugins: [],
            points: [{ name: 'shell.part-style', summary: 's' }],
            parts: [],
          },
        ]
      },
    })
    const answer = await source.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'publish',
      content: await contentOf(root, source),
    })
    expect(answer).toEqual({
      kind: 'changes',
      lines: [
        {
          mark: '+',
          of: null,
          point: 'shell.part-style',
          key: 'session.composer.send',
          says: '→ in effect',
        },
      ],
      loads: 'loads on: client. Server: nothing to load.',
      advice: null,
    })
    expect(asked).toEqual(['listed alice', 'reports alice'])
  })

  it('answers for the tenant of the call whatever tenant the question names', async () => {
    const { source, asked } = world({
      listed: async tenant => {
        asked.push(`listed ${tenant}`)
        return { kind: 'read', plugins: [listed('tidy', [SEND])] }
      },
    })
    await source.impact.of({ tenant: 'bob', capability: plugin('tidy'), change: 'disable' })
    await source.placement.of({ tenant: 'bob', capability: plugin('tidy') })
    expect(asked.filter(line => line.includes('bob'))).toEqual([])
  })

  it('says a client point is not known while no client is connected', async () => {
    const root = workspace(tidy)
    const { source } = world({ workingDirectory: async () => root })
    const answer = await source.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'publish',
      content: await contentOf(root, source),
    })
    expect(answer.kind === 'changes' && answer.lines[0]?.says).toContain(
      'no client is connected now',
    )
  })

  it('says why when the manifest of the directory cannot be read', async () => {
    const root = workspace({ 'plugins/tidy/plugin.json': '{"schema":1,"name":"Tidy"}' })
    const { source } = world({ workingDirectory: async () => root })
    const answer = await source.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'publish',
      content: await contentOf(root, source),
    })
    expect(answer).toEqual({
      kind: 'unavailable',
      reason: 'plugin.json: the name "Tidy" is not lower-case letters, digits and hyphens',
    })
  })

  it('takes the manifest of a held one from what the tenant holds; one it does not hold is said', async () => {
    const { source } = world({
      listed: async () => ({ kind: 'read', plugins: [listed('tidy', [SEND])] }),
    })
    const held = await source.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'disable',
    })
    expect(held.kind === 'changes' && held.lines.map(line => line.mark)).toEqual(['-'])
    expect(
      await source.impact.of({ tenant: 'alice', capability: plugin('none'), change: 'remove' }),
    ).toEqual({ kind: 'unavailable', reason: 'the tenant holds no plugin named none' })
  })

  it('is unavailable when what the tenant holds cannot be read', async () => {
    const { source } = world({ listed: async () => ({ kind: 'unavailable' }) })
    expect(
      await source.impact.of({ tenant: 'alice', capability: plugin('tidy'), change: 'disable' }),
    ).toEqual({ kind: 'unavailable', reason: 'what the tenant holds cannot be read now' })
  })
})

describe('where a held extension is placed now', () => {
  it('tells of a plugin from its manifest and what each connected client told of this version', async () => {
    const report = (version: string, state: 'loaded' | 'failed') => ({
      client: 'desktop-1',
      plugins: [
        { name: 'tidy', version, state, reason: state === 'failed' ? 'card.js threw' : null },
      ],
      points: [],
      parts: [],
    })
    const holding = {
      listed: async () => ({ kind: 'read', plugins: [listed('tidy', [SEND])] }) as const,
    }
    const loaded = world({ ...holding, reports: () => [report('a'.repeat(64), 'loaded')] })
    expect(
      await loaded.source.placement.of({ tenant: 'alice', capability: plugin('tidy') }),
    ).toEqual({
      kind: 'placed',
      places: [
        {
          point: 'shell.part-style',
          key: 'session.composer.send',
          standing: 'in effect',
          says: '',
        },
      ],
      clients: [{ label: 'desktop-1, connected', says: 'loaded' }],
      advice: null,
    })
    const older = world({ ...holding, reports: () => [report('b'.repeat(64), 'loaded')] })
    const stale = await older.source.placement.of({ tenant: 'alice', capability: plugin('tidy') })
    expect(stale.kind === 'placed' && stale.clients).toEqual([
      { label: 'desktop-1, connected', says: 'not loaded yet' },
    ])
    const gone = world({ ...holding, reports: () => undefined })
    const unread = await gone.source.placement.of({ tenant: 'alice', capability: plugin('tidy') })
    expect(unread.kind === 'placed' && unread.clients).toBeNull()
  })

  it('tells of an extension of another category by how the asset rules stand on it', async () => {
    const skill = capabilityId('skill', 'review')
    if (!skill.ok) throw new Error('capability')
    const { source } = world({
      pointOf: category => (category === 'skill' ? 'skill.skills' : undefined),
      describe: async () => ({ kind: 'asset', standing: { kind: 'selected' } }),
    })
    expect(await source.placement.of({ tenant: 'alice', capability: skill.id })).toEqual({
      kind: 'placed',
      places: [
        {
          point: 'skill.skills',
          key: 'review',
          standing: 'selected',
          says: 'sessions of this tenant get this one',
        },
      ],
      clients: null,
      advice: null,
    })
    const off = world({
      pointOf: () => 'skill.skills',
      describe: async () => ({
        kind: 'asset',
        standing: { kind: 'filtered', reason: 'disabled' },
      }),
    })
    const filtered = await off.source.placement.of({ tenant: 'alice', capability: skill.id })
    expect(filtered.kind === 'placed' && filtered.places[0]).toMatchObject({
      standing: 'not in effect',
      says: 'disabled',
    })
  })

  it('gives the revision of the tree, and the tenant and principal of the call', () => {
    const { source } = world()
    expect(source.revision()).toBe('abcd.3')
    expect([source.tenant, source.principal]).toEqual(['alice', { who: 'alice' }])
  })
})
