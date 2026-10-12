import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StorageDefect } from '@omne-harness-lite/storage'
import { openStorage, NodeSqliteDriver } from '../src/index.ts'
import { openSqlite } from '../src/sqlite/index.ts'
import { SqliteOwnerSite } from '../src/sqlite/owner.ts'
import { assertProductionStoragePath, ISOLATION_MARKER } from '../src/sqlite/protection.ts'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-isolated-check-'))
  roots.push(root)
  const isolated = join(root, 'isolated')
  const child = join(isolated, 'task')
  await mkdir(child, { recursive: true })
  const file = join(child, 'copy.sqlite')
  const db = new DatabaseSync(file)
  db.exec("CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('unchanged')")
  db.close()
  await writeFile(join(isolated, ISOLATION_MARKER), 'omne-isolated/1\n')
  return { root, isolated, child, file }
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 production opens refuse isolated plaintext before any write', () => {
  it('public storage, direct dialect and lazy driver all check real ancestors', async () => {
    const { file, child } = await fixture()
    const before = await readFile(file)
    const names = await readdir(child)
    await expect(openStorage({ dialect: 'sqlite', file })).rejects.toThrow(StorageDefect)
    expect(() => openSqlite({ file })).toThrow(StorageDefect)
    const driver = new NodeSqliteDriver({ file, role: 'write' })
    await expect(driver.init()).rejects.toThrow(StorageDefect)
    expect(await readFile(file)).toEqual(before)
    expect(await readdir(child)).toEqual(names)
  })

  it('owner acquisition and upgrade recovery cannot remove or restore isolated leftovers', async () => {
    const { file, child } = await fixture()
    const source = await readFile(file)
    await writeFile(`${file}.upgrade-snapshot`, source)
    await writeFile(`${file}.upgrade-snapshot.tmp`, 'partial')
    const names = await readdir(child)
    const site = new SqliteOwnerSite(file, undefined, {})
    for (const operation of [
      () => site.acquire(),
      () => site.recoverLeftovers(),
      () => site.markIfAbsent(),
      () => site.takeSnapshot(),
      () => site.restore(),
      () => site.removeSnapshot(),
    ])
      await expect(operation()).rejects.toThrow(StorageDefect)
    expect(await readdir(child)).toEqual(names)
    expect(await readFile(file)).toEqual(source)
    expect(await readFile(`${file}.upgrade-snapshot`)).toEqual(source)
    expect(await readFile(`${file}.upgrade-snapshot.tmp`, 'utf8')).toBe('partial')
  })

  it('an alias parent cannot bypass the guard, nor can a new filename beneath it', async () => {
    const { root, isolated } = await fixture()
    await symlink(isolated, join(root, 'alias'))
    for (const file of [
      join(root, 'alias', 'task', 'copy.sqlite'),
      join(root, 'alias', 'task', 'new.sqlite'),
    ])
      expect(() => assertProductionStoragePath(file)).toThrow(StorageDefect)
  })

  it('a malformed marker remains a refusal, while ordinary new storage still works', async () => {
    const { root, isolated, file } = await fixture()
    await writeFile(join(isolated, ISOLATION_MARKER), 'broken')
    expect(() => assertProductionStoragePath(file)).toThrow(StorageDefect)
    const storage = await openStorage({ dialect: 'sqlite', file: join(root, 'normal.sqlite') })
    await storage.read(async tx => {
      expect(await tx.db.introspection.getTables()).toEqual([])
    })
    await storage.close()
  })

  it('a final symlink is refused even when the target is otherwise ordinary storage', async () => {
    const { root } = await fixture()
    const target = join(root, 'ordinary.sqlite')
    const db = new DatabaseSync(target)
    db.close()
    const link = join(root, 'link.sqlite')
    await symlink(target, link)
    expect(() => assertProductionStoragePath(link)).toThrow(StorageDefect)
  })
})
