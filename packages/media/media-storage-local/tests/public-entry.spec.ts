import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { byteStoreConformanceCases, type StoreWorld } from '@omne-harness/media-contract/testing'
import { createLocalByteStore } from '@omne-harness/media-storage-local'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function root(): string {
  const made = realpathSync(mkdtempSync(join(tmpdir(), 'omne-media-local-')))
  roots.push(made)
  return made
}

async function world(): Promise<StoreWorld> {
  const at = root()
  return {
    store: createLocalByteStore({ root: at }),
    reopen: async () => createLocalByteStore({ root: at }),
  }
}

it('exports the local byte store', async () => {
  const entry = (await import('@omne-harness/media-storage-local')) as Record<string, unknown>
  expect(Object.keys(entry)).toEqual(['createLocalByteStore'])
})

it.each(byteStoreConformanceCases)('local store: $name', async item => {
  await expect(item.run(world)).resolves.toBeUndefined()
})

it('names itself as configured, and local by default', () => {
  expect(createLocalByteStore({ root: root() }).name).toBe('local')
  expect(createLocalByteStore({ root: root(), name: 'disk-2' }).name).toBe('disk-2')
})

it('does not read a draft a crash left beside an object as that object', async () => {
  const at = root()
  const key = 'c'.repeat(32)
  mkdirSync(join(at, 'objects', 'cc'), { recursive: true })
  writeFileSync(join(at, 'objects', 'cc', `${key}.1234.draft`), 'half')
  expect(await createLocalByteStore({ root: at }).open(key)).toEqual({
    failure: { kind: 'not-found' },
  })
})

it('leaves one file under its root for a sealed object, with the bytes of the object', async () => {
  const at = root()
  const store = createLocalByteStore({ root: at })
  const begun = await store.begin('ab'.padEnd(32, '0'))
  if ('failure' in begun) throw new Error(begun.failure.kind)
  await store.append(begun.ok.write, 0, Buffer.from('ke'))
  await store.append(begun.ok.write, 1, Buffer.from('pt'))
  await store.seal(begun.ok.write, 2)
  const files = readdirSync(at, { recursive: true, withFileTypes: true }).filter(entry =>
    entry.isFile(),
  )
  expect(files.map(file => readFileSync(join(file.parentPath, file.name), 'utf8'))).toEqual([
    'kept',
  ])
})

const openFiles = (): number => readdirSync('/dev/fd').length

it.skipIf(process.platform === 'win32')(
  'syncs every segment, the object and its directory, and leaves no file open',
  async () => {
    const store = createLocalByteStore({ root: root() })
    const probe = await open(root(), 'r')
    const handles = Object.getPrototypeOf(probe) as { sync(): Promise<void> }
    await probe.close()
    const before = openFiles()
    const sync = vi.spyOn(handles, 'sync')
    try {
      const begun = await store.begin('e'.repeat(32))
      if ('failure' in begun) throw new Error(begun.failure.kind)
      await store.append(begun.ok.write, 0, Buffer.from('one '))
      await store.append(begun.ok.write, 1, Buffer.from('two'))
      expect(sync.mock.calls).toHaveLength(2)
      expect(await store.seal(begun.ok.write, 2)).toEqual({ ok: { bytes: 7 } })
      expect(sync.mock.calls).toHaveLength(4)
      expect(openFiles()).toBe(before)
    } finally {
      sync.mockRestore()
    }
  },
)

it('does not reach a file outside its root through a key or a write that climbs out', async () => {
  const at = root()
  const outside = `omne-media-outside-${randomUUID()}`
  const secret = join(dirname(at), outside)
  writeFileSync(secret, 'not a medium')
  roots.push(secret)
  const store = createLocalByteStore({ root: at })
  expect(await store.open(`../${outside}`)).toEqual({ failure: { kind: 'not-found' } })
  expect(await store.remove(`../${outside}`)).toEqual({ ok: null })
  expect(await store.abort(`local:../../${outside}`)).toEqual({ ok: null })
  expect(readFileSync(secret, 'utf8')).toBe('not a medium')
})

it('says what it knows when its root is broken: a write did not happen, a seal or a removal may have', async () => {
  const at = root()
  writeFileSync(join(at, 'writing'), 'a file where the directory should be')
  const store = createLocalByteStore({ root: at })
  const key = 'd'.repeat(32)
  const broken = (kind: string) => ({ failure: { kind, diagnostic: 'ENOTDIR' } })
  expect(await store.begin(key)).toEqual(broken('unavailable'))
  expect(await store.append(`local:${key}`, 0, Buffer.from('x'))).toEqual(broken('unavailable'))
  expect(await store.seal(`local:${key}`, 1)).toEqual(broken('unknown'))
  expect(await store.remove(key)).toEqual(broken('unknown'))
  expect(await store.abort(`local:${key}`)).toEqual(broken('unknown'))
})

it('answers unavailable, not not-found, when an object cannot be looked at', async () => {
  const at = root()
  const key = 'f'.repeat(32)
  writeFileSync(join(at, 'objects'), 'a file where the directory should be')
  expect(await createLocalByteStore({ root: at }).open(key)).toEqual({
    failure: { kind: 'unavailable', diagnostic: 'ENOTDIR' },
  })
})
