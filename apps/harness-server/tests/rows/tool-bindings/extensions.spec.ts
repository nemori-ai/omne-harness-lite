import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  type BodyContract,
  type CategoryEffect,
  type ManagedAsset,
} from '@omne-harness/assets'
import type { ExtensionsFaces } from '@omne-harness/assets-tools'
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

function world(over: Partial<ExtensionsPorts> = {}) {
  const ports: ExtensionsPorts = {
    faces: () => undefined,
    workingDirectory: async () => 'absent',
    revision: () => 'abcd.3',
    ...over,
  }
  const source = createExtensionsSource(ports, { tenant: 'alice', principal: { who: 'alice' } })
  return { source }
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

const contract = (category: string): BodyContract => ({
  category,
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
})

const capability = (category: string, name: string) => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('capability')
  return made.id
}

/** The faces with two categories: Plugin tells of its own, Skill tells nothing. */
function faces(described: ManagedAsset = { kind: 'absent' }) {
  const asked: unknown[] = []
  const told: CategoryEffect = {
    impact: {
      of: async input => (asked.push(input), { kind: 'unavailable', reason: 'told by plugin' }),
    },
    placement: {
      of: async input => (asked.push(input), { kind: 'unavailable', reason: 'told by plugin' }),
    },
  }
  const categories = createCategoryPoint()
  categories.contribute({
    contract: contract('plugin'),
    display: { title: 'Plugin', summary: 'p' },
    point: 'plugin.plugins',
    effect: told,
  })
  categories.contribute({
    contract: contract('skill'),
    display: { title: 'Skill', summary: 's' },
    point: 'skill.skills',
  })
  const management = {
    describe: async (scope: unknown) => (asked.push(scope), described),
  } as unknown as ExtensionsFaces['management']
  const made = { categories, management, publishing: {} } as unknown as ExtensionsFaces
  return { faces: () => made, asked }
}

describe('what a change would do and where a held one stands', () => {
  it('asks the owner of the category, as the tenant of the call whatever tenant the question names', async () => {
    const { faces: given, asked } = faces()
    const { source } = world({ faces: given })
    const tidy = capability('plugin', 'tidy')
    expect(await source.impact.of({ tenant: 'bob', capability: tidy, change: 'disable' })).toEqual({
      kind: 'unavailable',
      reason: 'told by plugin',
    })
    expect(await source.placement.of({ tenant: 'bob', capability: tidy })).toEqual({
      kind: 'unavailable',
      reason: 'told by plugin',
    })
    expect(asked).toEqual([
      { tenant: 'alice', capability: tidy, change: 'disable' },
      { tenant: 'alice', capability: tidy },
    ])
  })

  it('tells from the holding for a category whose owner tells nothing, asking as the principal of the call', async () => {
    const review = capability('skill', 'review')
    const { faces: given, asked } = faces({
      kind: 'asset',
      standing: { kind: 'filtered', reason: 'disabled' },
    } as ManagedAsset)
    const { source } = world({ faces: given })
    expect(await source.placement.of({ tenant: 'bob', capability: review })).toEqual({
      kind: 'placed',
      places: [
        { point: 'skill.skills', key: 'review', standing: 'not in effect', says: 'disabled' },
      ],
      clients: null,
      advice: null,
    })
    expect(asked).toEqual([{ tenant: 'alice', principal: { who: 'alice' }, capability: review }])
    const impact = await source.impact.of({ tenant: 'bob', capability: review, change: 'publish' })
    expect(impact.kind === 'changes' && impact.lines[0]).toMatchObject({
      mark: '+',
      point: 'skill.skills',
      key: 'review',
    })
  })

  it('says so when the assets cannot be read now', async () => {
    const { source } = world()
    const unread = { kind: 'unavailable', reason: 'the assets cannot be read now' }
    const tidy = capability('plugin', 'tidy')
    expect(await source.impact.of({ tenant: 'a', capability: tidy, change: 'remove' })).toEqual(
      unread,
    )
    expect(await source.placement.of({ tenant: 'a', capability: tidy })).toEqual(unread)
  })

  it('gives the revision of the tree, and the tenant and principal of the call', () => {
    const { source } = world()
    expect(source.revision()).toBe('abcd.3')
    expect([source.tenant, source.principal]).toEqual(['alice', { who: 'alice' }])
  })
})
