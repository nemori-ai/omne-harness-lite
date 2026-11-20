import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
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

it('answers unavailable when its root cannot hold a write', async () => {
  const at = root()
  writeFileSync(join(at, 'writing'), 'a file where the directory should be')
  const begun = await createLocalByteStore({ root: at }).begin('d'.repeat(32))
  expect(begun).toMatchObject({ failure: { kind: 'unavailable' } })
})
