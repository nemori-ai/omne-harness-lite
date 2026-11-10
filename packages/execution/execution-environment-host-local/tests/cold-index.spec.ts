// The cold index's marker files: how they are written, read, listed and removed.
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createColdIndex } from '../src/cold-index.ts'

type Marker = Readonly<{ key: string; note: string }>

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function index() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-cold-index-')))
  roots.push(root)
  // The directory does not exist yet, nor does its parent.
  const directory = join(root, 'state', 'markers')
  const cold = createColdIndex<Marker>({
    directory,
    parse(content, key) {
      const value: unknown = JSON.parse(content)
      return typeof value === 'object' && value !== null && Reflect.get(value, 'key') === key
        ? (value as Marker)
        : undefined
    },
  })
  return { directory, cold }
}

it('writes a marker into a directory it creates, reads it back and forgets it', async () => {
  const { directory, cold } = await index()
  const key = randomUUID()
  expect(await cold.all()).toEqual([])
  expect(await cold.read(key)).toBe('absent')
  expect(await cold.record(key, { key, note: 'up' })).toBe(true)
  expect(await readdir(directory)).toEqual([`${key}.json`])
  expect(await cold.read(key)).toEqual({ key, note: 'up' })
  expect(await cold.all()).toEqual([{ key, note: 'up' }])
  expect(await cold.forget(key)).toBe(true)
  expect(await cold.read(key)).toBe('absent')
  // A marker that is not there is forgotten already.
  expect(await cold.forget(key)).toBe(true)
  expect(await cold.all()).toEqual([])
})

it('refuses a key that is not a resource key, and reads nothing for it', async () => {
  const { cold } = await index()
  expect(await cold.record('../escape', { key: '../escape', note: '' })).toBe(false)
  expect(await cold.read('../escape')).toBe('absent')
  expect(await cold.all()).toEqual([])
})

it('makes no complete list when one marker cannot be read or names another key', async () => {
  const { directory, cold } = await index()
  const key = randomUUID()
  expect(await cold.record(key, { key, note: 'up' })).toBe(true)
  const other = randomUUID()
  await writeFile(join(directory, `${other}.json`), JSON.stringify({ key, note: 'moved' }))
  expect(await cold.read(other)).toBe('unreadable')
  expect(await cold.all()).toBe('unavailable')
  await rm(join(directory, `${other}.json`))
  // A file that is no marker at all also makes no complete list.
  await writeFile(join(directory, 'notes.txt'), '')
  expect(await cold.all()).toBe('unavailable')
  await rm(join(directory, 'notes.txt'))
  // A staging file is not a marker.
  await writeFile(join(directory, `.${randomUUID()}.1.tmp`), '')
  expect(await cold.all()).toEqual([{ key, note: 'up' }])
})

it('skips a marker removed while the list is read', async context => {
  const { directory, cold } = await index()
  const key = randomUUID()
  expect(await cold.record(key, { key, note: 'up' })).toBe(true)
  await mkdir(directory, { recursive: true })
  // A name whose file is gone by the time it is read: a link to nothing.
  try {
    await symlink(join(directory, 'nothing'), join(directory, `${randomUUID()}.json`))
  } catch {
    return context.skip()
  }
  expect(await cold.all()).toEqual([{ key, note: 'up' }])
})
