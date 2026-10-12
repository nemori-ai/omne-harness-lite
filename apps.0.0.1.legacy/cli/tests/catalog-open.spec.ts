import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { openCliCatalog, type OwnedCliCatalog } from '../src/catalog-open.ts'
import * as catalogFiles from '../src/catalog-files.ts'

const policy = { maxCenters: 8, maxCreations: 8, maxRecordBytes: 64 * 1024 }
const roots: string[] = []
const owners: OwnedCliCatalog[] = []
async function fixture(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'omne-private-catalog-'))
  roots.push(parent)
  return join(parent, '.omne')
}
async function subject(home: string) {
  const result = await openCliCatalog(home, policy)
  owners.push(result)
  return result
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const owner of owners.splice(0)) await owner.close()
  for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true })
})
it('creates the private root catalog without creating tenants or credentials', async () => {
  const home = await fixture()
  const owner = await subject(home)
  expect((await lstat(home)).mode & 0o777).toBe(0o700)
  expect((await lstat(join(home, 'config.sqlite'))).mode & 0o777).toBe(0o600)
  expect(
    (await readdir(home)).every(name =>
      ['config.sqlite', 'config.sqlite-wal', 'config.sqlite-shm'].includes(name),
    ),
  ).toBe(true)
  expect(await owner.catalog.listCenters()).toEqual([])
  expect((await owner.catalog.readSelection()).selected).toBeNull()
})
it('keeps the same store identity when reopened', async () => {
  const home = await fixture()
  const first = await subject(home)
  const reading = await first.catalog.readSelection()
  await first.close()
  const second = await subject(home)
  expect(await second.catalog.readSelection()).toEqual(reading)
})
it('allows two competing initializers to recognize one completed catalog', async () => {
  const home = await fixture()
  const [a, b] = await Promise.all([subject(home), subject(home)])
  expect(await a.catalog.readSelection()).toEqual(await b.catalog.readSelection())
})
it('fails on a corrupt existing database without replacing it', async () => {
  const home = await fixture()
  await mkdir(home, { mode: 0o700 })
  const file = join(home, 'config.sqlite')
  await writeFile(file, 'corrupt database', { mode: 0o600 })
  await expect(subject(home)).rejects.toMatchObject({ reason: 'invalid-record' })
  expect(await readFile(file, 'utf8')).toBe('corrupt database')
})
it('rejects a root symlink without changing its target', async () => {
  const home = await fixture()
  const target = join(dirname(home), 'target')
  await mkdir(target, { mode: 0o700 })
  await symlink(target, home)
  await expect(subject(home)).rejects.toMatchObject({ reason: 'unsafe-path' })
  expect(await readdir(target)).toEqual([])
})
it('rejects a nonprivate root instead of chmodding it', async () => {
  const home = await fixture()
  await mkdir(home, { mode: 0o755 })
  await expect(subject(home)).rejects.toMatchObject({ reason: 'unsafe-path' })
  expect((await lstat(home)).mode & 0o777).toBe(0o755)
})
it('rejects a database symlink without reading or replacing its target', async () => {
  const home = await fixture()
  await mkdir(home, { mode: 0o700 })
  const target = join(dirname(home), 'secret-target')
  await writeFile(target, 'secret', { mode: 0o600 })
  await symlink(target, join(home, 'config.sqlite'))
  await expect(subject(home)).rejects.toMatchObject({ reason: 'unsafe-path' })
  expect(await readFile(target, 'utf8')).toBe('secret')
})
it('rejects a nonprivate database without echoing its contents', async () => {
  const home = await fixture()
  const first = await subject(home)
  await first.close()
  const file = join(home, 'config.sqlite')
  await chmod(file, 0o644)
  await expect(subject(home)).rejects.toThrow(/^omne-state: unsafe-path$/)
  expect((await lstat(file)).mode & 0o777).toBe(0o644)
})
it('rejects a database with a second hard link', async () => {
  const home = await fixture()
  const first = await subject(home)
  await first.close()
  await link(join(home, 'config.sqlite'), join(dirname(home), 'catalog-copy'))
  await expect(subject(home)).rejects.toMatchObject({ reason: 'unsafe-path' })
})
it.each(['-wal', '-shm'])(
  'rejects an unsafe SQLite side file %s before opening the database',
  async suffix => {
    const home = await fixture()
    const first = await subject(home)
    await first.close()
    const target = join(dirname(home), 'target')
    await writeFile(target, 'secret', { mode: 0o600 })
    await symlink(target, join(home, 'config.sqlite' + suffix))
    await expect(subject(home)).rejects.toMatchObject({ reason: 'unsafe-path' })
    expect(await readFile(target, 'utf8')).toBe('secret')
  },
)
it('validates capacity before making directories', async () => {
  const home = await fixture()
  await expect(openCliCatalog(home, { ...policy, maxCenters: 0 })).rejects.toMatchObject({
    reason: 'invalid-input',
  })
  await expect(lstat(home)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('does not publish a ready catalog when its own namespace sync fails', async () => {
  const home = await fixture()
  const original = catalogFiles.prepareCatalogFiles
  const sync = vi.fn(async () => {
    throw Object.assign(new Error('controlled sync failure'), { code: 'EIO' })
  })
  let close: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined
  vi.spyOn(catalogFiles, 'prepareCatalogFiles').mockImplementation(async path => {
    const files = await original(path)
    close = vi.fn(() => files.close())
    return { ...files, sync, close }
  })
  await expect(subject(home)).rejects.toMatchObject({ reason: 'unavailable' })
  expect(sync).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  vi.restoreAllMocks()
  // A completed SQLite initialization is recognized only after this opener syncs successfully.
  const reopened = await subject(home)
  expect(await reopened.catalog.listCenters()).toEqual([])
})
it('reports an abandoned empty file without silently acquiring creator status', async () => {
  const home = await fixture()
  await mkdir(home, { mode: 0o700 })
  const file = join(home, 'config.sqlite')
  await writeFile(file, '', { mode: 0o600 })
  await expect(
    openCliCatalog(home, policy, { initializationTimeoutMs: 50, pollIntervalMs: 5 }),
  ).rejects.toMatchObject({ reason: 'invalid-record' })
})
