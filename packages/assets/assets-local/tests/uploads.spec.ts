import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  type CapabilityId,
  type CategoryContribution,
} from '@omne-harness/assets'
import { createLocalUploads, type UploadPolicy } from '../src/uploads.ts'

const encoder = new TextEncoder()
const display = { title: 'Test', summary: 'A category that exists only in these tests.' }
const contract = {
  schema: { kind: 'null' },
  judge: () => ({ ok: true }) as const,
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
} as const
const bundle: CategoryContribution = {
  display,
  contract: {
    ...contract,
    category: 'bundle',
    layout: {
      namespace: 'bundles',
      limits: { files: 3, fileBytes: 16, totalBytes: 24 },
      inspect: async () => ({ ok: { kind: 'null' } }),
    },
  },
  point: 'bundle.items',
}

function idOf(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('fixture id')
  return made.id
}

const BUNDLE = idOf('bundle', 'docs')
const README = { path: 'README.md', bytes: 5 }
const LIB = { path: 'lib/a.txt', bytes: 3 }
const ENTRIES = [README, LIB]

function world(policy: Partial<UploadPolicy> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'uploads-')))
  const categories = createCategoryPoint()
  categories.contribute(bundle)
  categories.contribute({
    display,
    contract: { ...contract, category: 'plain' },
    point: 'plain.items',
  })
  const clock = { now: 1_000_000 }
  const uploads = createLocalUploads({
    root,
    categories,
    policy: { idleMs: 60_000, maxOpen: 2, partBytes: 4, ...policy },
    clock: () => clock.now,
  })
  const begin = (operationId = 'up-1', entries = ENTRIES, capability = BUNDLE) =>
    uploads.begin({ operationId, capability, entries })
  const append = (path: string, offset: number, text: string, operationId = 'up-1') =>
    uploads.append({ operationId, path, offset, bytes: encoder.encode(text) })
  const open = () =>
    existsSync(join(root, '.uploads')) ? readdirSync(join(root, '.uploads')).length : 0
  return { root, uploads, clock, begin, append, open }
}

async function collect(w: ReturnType<typeof world>, operationId = 'up-1') {
  await w.append('README.md', 0, 'hello', operationId)
  await w.append('lib/a.txt', 0, 'abc', operationId)
}

describe('begin (table one, first row)', () => {
  it('with none it accepts the declaration: the part size and nothing received yet', async () => {
    const w = world()
    expect(await w.begin()).toEqual({
      kind: 'accepted',
      partBytes: 4,
      received: [
        { path: 'README.md', bytes: 0 },
        { path: 'lib/a.txt', bytes: 0 },
      ],
    })
    expect(w.open()).toBe(1)
  })

  it.each([
    ['an unsafe path', [{ path: '../x', bytes: 1 }], 'manifest-path'],
    ['a path twice', [README, README], 'manifest-path'],
    [
      'a file under a file',
      [
        { path: 'a', bytes: 1 },
        { path: 'a/b', bytes: 1 },
      ],
      'manifest-path',
    ],
    [
      'too many files',
      ['a', 'b', 'c', 'd'].map(path => ({ path, bytes: 1 })),
      'limit-exceeded:files',
    ],
    ['a file over the file limit', [{ path: 'a', bytes: 17 }], 'limit-exceeded:fileBytes'],
    [
      'files over the total limit',
      [
        { path: 'a', bytes: 16 },
        { path: 'b', bytes: 9 },
      ],
      'limit-exceeded:totalBytes',
    ],
  ])('with none, %s is invalid and nothing is made', async (_label, entries, reason) => {
    const w = world()
    expect(await w.begin('up-1', entries)).toEqual({ kind: 'invalid', reason })
    expect(w.open()).toBe(0)
  })

  it('a category that is not a directory category is invalid; one not there is unknown', async () => {
    const w = world()
    expect(await w.begin('up-1', ENTRIES, idOf('plain', 'x'))).toEqual({
      kind: 'invalid',
      reason: 'not-a-directory-category',
    })
    expect(await w.begin('up-1', ENTRIES, idOf('gone', 'x'))).toEqual({ kind: 'unknown-category' })
    expect(w.open()).toBe(0)
  })

  it('in, not collected: the same declaration answers what has arrived', async () => {
    const w = world()
    await w.begin()
    await w.append('README.md', 0, 'hel')
    expect(await w.begin()).toEqual({
      kind: 'accepted',
      partBytes: 4,
      received: [
        { path: 'README.md', bytes: 3 },
        { path: 'lib/a.txt', bytes: 0 },
      ],
    })
  })

  it('in, collected: the same declaration answers everything received', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    expect(await w.begin()).toMatchObject({ kind: 'accepted', received: ENTRIES })
  })

  it.each([
    ['another file list', [README], BUNDLE],
    ['another size', [{ path: 'README.md', bytes: 6 }, LIB], BUNDLE],
    ['another capability', ENTRIES, idOf('bundle', 'other')],
  ])('in, the same operation with %s is an operation conflict', async (_label, entries, id) => {
    const w = world()
    await w.begin()
    expect(await w.begin('up-1', entries, id)).toEqual({ kind: 'operation-conflict' })
  })

  it('at the quota it first sweeps an idle upload, and answers busy when none is idle', async () => {
    const w = world()
    await w.begin('up-1')
    w.clock.now += 30_000
    await w.begin('up-2')
    expect(await w.begin('up-3')).toEqual({ kind: 'busy' })
    w.clock.now += 40_000
    expect(await w.begin('up-3')).toMatchObject({ kind: 'accepted' })
    expect(w.open()).toBe(2)
    expect(await w.append('README.md', 0, 'h', 'up-1')).toEqual({ kind: 'absent' })
    expect(await w.append('README.md', 0, 'h', 'up-2')).toEqual({ kind: 'received', bytes: 1 })
  })

  it('without a package root uploads are unavailable', async () => {
    const categories = createCategoryPoint()
    categories.contribute(bundle)
    const uploads = createLocalUploads({
      root: undefined,
      categories,
      policy: { idleMs: 1, maxOpen: 1, partBytes: 1 },
    })
    expect(
      await uploads.begin({ operationId: 'up-1', capability: BUNDLE, entries: ENTRIES }),
    ).toEqual({ kind: 'unavailable' })
    expect(await uploads.reader('up-1')).toEqual({ kind: 'unavailable' })
    expect(await uploads.sweep()).toBe(0)
    await expect(uploads.discard('up-1')).resolves.toBeUndefined()
  })
})

describe('resume (begin without making anything)', () => {
  it('answers absent with none, and makes nothing', async () => {
    const w = world()
    expect(
      await w.uploads.resume({ operationId: 'up-1', capability: BUNDLE, entries: ENTRIES }),
    ).toEqual({ kind: 'absent' })
    expect(w.open()).toBe(0)
  })

  it('answers what has arrived for the same declaration, and a conflict for another', async () => {
    const w = world()
    await w.begin()
    await w.append('README.md', 0, 'he')
    expect(
      await w.uploads.resume({ operationId: 'up-1', capability: BUNDLE, entries: ENTRIES }),
    ).toEqual({
      kind: 'accepted',
      partBytes: 4,
      received: [
        { path: 'README.md', bytes: 2 },
        { path: 'lib/a.txt', bytes: 0 },
      ],
    })
    expect(
      await w.uploads.resume({ operationId: 'up-1', capability: BUNDLE, entries: [README] }),
    ).toEqual({ kind: 'operation-conflict' })
  })

  it('does not keep an upload alive: a resumed one is still swept', async () => {
    const w = world()
    await w.begin()
    w.clock.now += 70_000
    await w.uploads.resume({ operationId: 'up-1', capability: BUNDLE, entries: ENTRIES })
    expect(await w.uploads.sweep()).toBe(1)
  })
})

describe('append (table one, second row)', () => {
  it('with none it answers absent', async () => {
    const w = world()
    expect(await w.append('README.md', 0, 'hello')).toEqual({ kind: 'absent' })
  })

  it('in, an undeclared path is invalid', async () => {
    const w = world()
    await w.begin()
    expect(await w.append('other.md', 0, 'x')).toEqual({
      kind: 'invalid',
      reason: 'undeclared-path',
    })
  })

  it('in, at the received offset and within the declaration it writes and answers the new count', async () => {
    const w = world()
    await w.begin()
    expect(await w.append('README.md', 0, 'hel')).toEqual({ kind: 'received', bytes: 3 })
    expect(await w.append('README.md', 3, 'lo')).toEqual({ kind: 'received', bytes: 5 })
  })

  it('in, at another offset it writes nothing and answers what has arrived', async () => {
    const w = world()
    await w.begin()
    await w.append('README.md', 0, 'hel')
    expect(await w.append('README.md', 0, 'hel')).toEqual({ kind: 'received', bytes: 3 })
    expect(await w.append('README.md', 5, 'xx')).toEqual({ kind: 'received', bytes: 3 })
    await w.append('README.md', 3, 'lo')
    await w.append('lib/a.txt', 0, 'abc')
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    const manifest = await ready.from.manifest()
    expect('ok' in manifest && manifest.ok.entries[0]?.digest).toBe(
      digestBytes(encoder.encode('hello')),
    )
  })

  it('in, past the declared size it is invalid and writes nothing', async () => {
    const w = world()
    await w.begin()
    await w.append('README.md', 0, 'hel')
    expect(await w.append('README.md', 3, 'lo!')).toEqual({
      kind: 'invalid',
      reason: 'beyond-declared',
    })
    expect(await w.append('README.md', 3, 'lo')).toEqual({ kind: 'received', bytes: 5 })
  })

  it('collected, no append changes a byte', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    expect(await w.append('README.md', 5, 'x')).toEqual({
      kind: 'invalid',
      reason: 'beyond-declared',
    })
    expect(await w.append('README.md', 0, 'HELLO')).toEqual({ kind: 'received', bytes: 5 })
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    const opened = await ready.from.open('README.md', digestBytes(encoder.encode('hello')))
    expect('ok' in opened && new TextDecoder().decode(opened.ok)).toBe('hello')
  })

  it('appends to one upload go one after another, so racing parts land once each', async () => {
    const w = world()
    await w.begin()
    const answers = await Promise.all([
      w.append('README.md', 0, 'hel'),
      w.append('README.md', 0, 'hel'),
      w.append('README.md', 3, 'lo'),
    ])
    expect(answers).toEqual([
      { kind: 'received', bytes: 3 },
      { kind: 'received', bytes: 3 },
      { kind: 'received', bytes: 5 },
    ])
  })
})

describe('the reader (the start of a commit, table one, third row)', () => {
  it('with none it answers absent', async () => {
    expect(await world().uploads.reader('up-1')).toEqual({ kind: 'absent' })
  })

  it('in, not collected, it names every path still missing bytes', async () => {
    const w = world()
    await w.begin()
    await w.append('README.md', 0, 'hel')
    expect(await w.uploads.reader('up-1')).toEqual({
      kind: 'incomplete',
      missing: ['README.md', 'lib/a.txt'],
    })
  })

  it('collected, it gives the capability and a reader whose manifest digests the received bytes', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    expect(ready.capability).toEqual(BUNDLE)
    expect(await ready.from.manifest()).toEqual({
      ok: {
        entries: [
          { path: 'README.md', bytes: 5, digest: digestBytes(encoder.encode('hello')) },
          { path: 'lib/a.txt', bytes: 3, digest: digestBytes(encoder.encode('abc')) },
        ],
      },
    })
  })

  it('a file opened after the upload was swept answers material-unavailable', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    rmSync(join(w.root, '.uploads'), { recursive: true, force: true })
    expect(await ready.from.open('README.md', digestBytes(encoder.encode('hello')))).toEqual({
      failure: 'material-unavailable',
    })
  })

  it('a file changed after it was received answers material-unavailable, never the changed bytes', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    const [place] = readdirSync(join(w.root, '.uploads'))
    writeFileSync(join(w.root, '.uploads', place ?? '', 'files', 'README.md'), 'HELLO')
    expect(await ready.from.open('README.md', digestBytes(encoder.encode('hello')))).toEqual({
      failure: 'material-unavailable',
    })
  })

  it('a path or digest outside the manifest is not an entry', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    const ready = await w.uploads.reader('up-1')
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    expect(await ready.from.open('README.md', 'sha256:00')).toEqual({ failure: 'entry-not-found' })
    expect(await ready.from.open('other.md', 'sha256:00')).toEqual({ failure: 'entry-not-found' })
  })
})

describe('discard and sweep (table one, last row)', () => {
  it('discard removes the upload; it is absent afterwards and discarding again is no error', async () => {
    const w = world()
    await w.begin()
    await w.uploads.discard('up-1')
    await w.uploads.discard('up-1')
    expect(await w.uploads.reader('up-1')).toEqual({ kind: 'absent' })
    expect(w.open()).toBe(0)
  })

  it('a sweep removes only uploads idle longer than the policy; an append keeps one alive', async () => {
    const w = world()
    await w.begin('up-1')
    await w.begin('up-2')
    w.clock.now += 50_000
    await w.append('README.md', 0, 'h', 'up-2')
    w.clock.now += 20_000
    expect(await w.uploads.sweep()).toBe(1)
    expect(await w.uploads.reader('up-1')).toEqual({ kind: 'absent' })
    expect(await w.uploads.reader('up-2')).toMatchObject({ kind: 'incomplete' })
  })

  it('an upload is no package: nothing is written under the package directories', async () => {
    const w = world()
    await w.begin()
    await collect(w)
    expect(readdirSync(w.root)).toEqual(['.uploads'])
  })
})
