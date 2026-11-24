import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  type BodyContract,
  type CategoryEffect,
  type ManagedAsset,
  type PackageReader,
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

/** A call whose files stay in its working directory: what the setting gives when nothing outside is allowed. */
const kept = (root: string) => ({ path: root, files: { read: root, write: root } })

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
    const { source } = world({ workingDirectory: async () => kept(root) })
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
    ['a path that steps up to nothing', '../outside'],
    ['an empty path', ''],
    ['a file, not a directory', 'plugins/tidy/plugin.json'],
    ['a directory that is not there', 'plugins/none'],
  ])('answers absent for %s', async (_name, path) => {
    const root = workspace({ 'plugins/tidy/plugin.json': '{}' })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.directory(path)).toBe('absent')
  })

  it('answers outside for a directory the files of the call do not reach: by an absolute path, by stepping up, by a link', async () => {
    const other = workspace({ 'secret/plugin.json': '{}' })
    const root = workspace({ 'plugins/tidy/plugin.json': '{}' })
    symlinkSync(join(other, 'secret'), join(root, 'plugins', 'leak'))
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.directory(join(other, 'secret'))).toBe('outside')
    expect(await source.directory(join('..', basename(other), 'secret'))).toBe('outside')
    expect(await source.directory('plugins/leak')).toBe('outside')
  })

  it.each<[string, (root: string) => { read?: string; write?: string }]>([
    ['reading is not limited', () => ({})],
    ['only writing is limited', root => ({ write: root })],
  ])('reads a directory outside the working directory when %s', async (_name, files) => {
    const other = workspace({ 'skins/sea/plugin.json': '{"schema":1}' })
    const root = workspace({})
    const { source } = world({
      workingDirectory: async () => ({ path: root, files: files(root) }),
    })
    for (const path of [join(other, 'skins/sea'), join('..', basename(other), 'skins/sea')]) {
      const pkg = await source.directory(path)
      if (typeof pkg === 'string') throw new Error(pkg)
      const manifest = await pkg.manifest()
      expect('ok' in manifest && manifest.ok.entries.map(entry => entry.path)).toEqual([
        'plugin.json',
      ])
    }
  })

  it('says what the call has for a working directory: none, or one that cannot be asked about', async () => {
    expect(await world().source.directory('plugins/tidy')).toBe('absent')
    const gone = world({ workingDirectory: async () => 'unavailable' })
    expect(await gone.source.directory('plugins/tidy')).toBe('unavailable')
  })
})

/** A held version in memory: what a store would give to be read. */
function held(files: Readonly<Record<string, string>>, unreadable: readonly string[] = []) {
  const bytes = (path: string) => new TextEncoder().encode(files[path])
  const reader: PackageReader = {
    manifest: async () => ({
      ok: {
        entries: Object.keys(files).map(path => ({
          path,
          bytes: bytes(path).length,
          digest: digestBytes(bytes(path)),
        })),
      },
    }),
    open: async path =>
      path in files && !unreadable.includes(path)
        ? { ok: bytes(path) }
        : { failure: 'material-unavailable' },
  }
  return reader
}

const TIDY = { 'plugin.json': '{"schema":1}', 'client/card.js': 'export const a = 1\n' }

describe('a held version written into a directory of the working directory', () => {
  it('writes every file into a directory that is not there yet, parents included, and leaves nothing else', async () => {
    const root = workspace({ 'README.md': '# project\n' })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place('ext/tidy', held(TIDY))).toEqual({
      kind: 'written',
      files: 2,
      bytes: 12 + 19,
    })
    expect(readFileSync(join(root, 'ext/tidy/client/card.js'), 'utf8')).toBe(TIDY['client/card.js'])
    expect(readFileSync(join(root, 'ext/tidy/plugin.json'), 'utf8')).toBe(TIDY['plugin.json'])
    expect(readdirSync(join(root, 'ext'))).toEqual(['tidy'])
  })

  it('reads back as the same package: publishing it unchanged gives the version it came from', async () => {
    const root = workspace({})
    const { source } = world({ workingDirectory: async () => kept(root) })
    await source.place('tidy', held(TIDY))
    const back = await source.directory('tidy')
    if (typeof back === 'string') throw new Error(back)
    const [written, original] = await Promise.all([back.manifest(), held(TIDY).manifest()])
    if (!('ok' in written) || !('ok' in original)) throw new Error('manifest')
    const sorted = [...original.ok.entries].sort((a, b) => (a.path < b.path ? -1 : 1))
    expect(written.ok.entries).toEqual(sorted)
  })

  it.each([
    ['an empty directory', {}],
    ['a directory that holds only files whose name begins with a dot', { 'tidy/.DS_Store': 'x' }],
  ])('writes into %s', async (_name, there) => {
    const root = workspace(there)
    mkdirSync(join(root, 'tidy'), { recursive: true })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect((await source.place('tidy', held(TIDY))).kind).toBe('written')
    expect(existsSync(join(root, 'tidy/client/card.js'))).toBe(true)
  })

  it('writes nothing where the directory already holds exactly these files, and says so', async () => {
    const root = workspace({
      'tidy/plugin.json': TIDY['plugin.json'],
      'tidy/client/card.js': TIDY['client/card.js'],
    })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place('tidy', held(TIDY))).toEqual({ kind: 'same' })
  })

  it('writes nothing where the directory holds something else: it names what differs, changed, missing or extra', async () => {
    const root = workspace({
      'tidy/plugin.json': '{"schema":1,"edited":true}',
      'tidy/notes.md': 'mine',
    })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place('tidy', held(TIDY))).toEqual({
      kind: 'differs',
      paths: ['client/card.js', 'notes.md', 'plugin.json'],
      more: 0,
    })
    expect(readFileSync(join(root, 'tidy/plugin.json'), 'utf8')).toBe('{"schema":1,"edited":true}')
    expect(existsSync(join(root, 'tidy/client'))).toBe(false)
  })

  it('names ten of what differs at the most, and counts the rest', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [`f${String(index).padStart(2, '0')}.txt`, 'x']),
    )
    const root = workspace({ 'tidy/other.txt': 'y' })
    const { source } = world({ workingDirectory: async () => kept(root) })
    const answer = await source.place('tidy', held(many))
    expect(answer).toMatchObject({ kind: 'differs', more: 4 })
    expect(answer.kind === 'differs' && answer.paths).toHaveLength(10)
  })

  it.each([
    ['an empty path', ''],
    ['a file', 'README.md'],
    ['a path under a file', 'README.md/tidy'],
  ])('answers absent for %s, and writes nothing', async (_name, path) => {
    const root = workspace({ 'README.md': '# project\n' })
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place(path, held(TIDY))).toEqual({ kind: 'absent' })
    expect(readdirSync(root)).toEqual(['README.md'])
  })

  it.each<[string, (other: string) => string]>([
    ['a path that steps up', other => join('..', basename(other), 'tidy')],
    ['an absolute path', other => join(other, 'tidy')],
    ['a link that leads out', () => 'leak'],
    ['a path under a link that leads out', () => 'leak/tidy'],
  ])(
    'answers outside for %s when writing stays in the working directory, and writes nothing',
    async (_name, path) => {
      const other = workspace({ 'kept.txt': 'kept' })
      const root = workspace({ 'README.md': '# project\n' })
      symlinkSync(other, join(root, 'leak'))
      for (const files of [{ read: root, write: root }, { write: root }]) {
        const { source } = world({ workingDirectory: async () => ({ path: root, files }) })
        expect(await source.place(path(other), held(TIDY))).toEqual({ kind: 'outside' })
      }
      expect(readdirSync(other)).toEqual(['kept.txt'])
      expect(readdirSync(root).sort()).toEqual(['README.md', 'leak'])
    },
  )

  it('writes into a directory outside the working directory when writing is not limited', async () => {
    const other = workspace({})
    const root = workspace({})
    const { source } = world({ workingDirectory: async () => ({ path: root, files: {} }) })
    expect(await source.place(join(other, 'ext/tidy'), held(TIDY))).toMatchObject({
      kind: 'written',
      files: 2,
    })
    expect(readFileSync(join(other, 'ext/tidy/plugin.json'), 'utf8')).toBe(TIDY['plugin.json'])
    expect(readdirSync(root)).toEqual([])
  })

  it('leaves nothing behind when a file of the held version cannot be read', async () => {
    const root = workspace({})
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place('ext/tidy', held(TIDY, ['client/card.js']))).toEqual({
      kind: 'unavailable',
    })
    expect(readdirSync(root)).toEqual([])
  })

  it('writes nothing for a held version that names a path outside its own directory', async () => {
    const root = workspace({})
    const { source } = world({ workingDirectory: async () => kept(root) })
    expect(await source.place('tidy', held({ '../escaped.txt': 'x' }))).toEqual({
      kind: 'unavailable',
    })
    expect(readdirSync(root)).toEqual([])
  })

  it('says what the call has for a working directory: none is absent, one that cannot be asked about is unavailable', async () => {
    expect(await world().source.place('tidy', held(TIDY))).toEqual({ kind: 'absent' })
    const gone = world({ workingDirectory: async () => 'unavailable' })
    expect(await gone.source.place('tidy', held(TIDY))).toEqual({ kind: 'unavailable' })
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
