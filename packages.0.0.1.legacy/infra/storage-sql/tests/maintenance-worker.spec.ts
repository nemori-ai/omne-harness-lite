import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPhysicalSnapshot } from '../src/maintenance/physical-check.ts'

const roots: string[] = []
async function file() {
  const root = await mkdtemp(join(tmpdir(), 'omne-worker-check-'))
  roots.push(root)
  return join(root, 'copy.sqlite')
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 fixed physical checker worker', () => {
  it('reads a complete database without changing any bytes', async () => {
    const path = await file()
    const db = new DatabaseSync(path)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1)')
    db.close()
    const before = await readFile(path)
    await checkPhysicalSnapshot(path)
    expect(await readFile(path)).toEqual(before)
  })

  it('rejects a physically valid database whose foreign key is violated', async () => {
    const path = await file()
    const db = new DatabaseSync(path)
    db.exec(
      'PRAGMA foreign_keys=OFF; CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (p INTEGER REFERENCES p(id)); INSERT INTO c VALUES(5)',
    )
    db.close()
    await expect(checkPhysicalSnapshot(path)).rejects.toMatchObject({ kind: 'invalid-data' })
  })

  it('separates corrupted bytes from an inaccessible source', async () => {
    const path = await file()
    await writeFile(path, 'not a sqlite database')
    await expect(checkPhysicalSnapshot(path)).rejects.toMatchObject({ kind: 'invalid-data' })
    await expect(checkPhysicalSnapshot(`${path}.missing`)).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })
})

it.each([
  'CREATE TABLE p (id INTEGER); CREATE TABLE c (p INTEGER REFERENCES p(id))',
  'CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (p INTEGER REFERENCES p(missing))',
])('classifies foreign-key schema mismatch as invalid data: %s', async ddl => {
  const path = await file()
  const db = new DatabaseSync(path)
  db.exec(ddl)
  db.close()
  await expect(checkPhysicalSnapshot(path)).rejects.toMatchObject({ kind: 'invalid-data' })
})
