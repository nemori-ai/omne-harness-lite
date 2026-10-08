import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import { afterEach, expect, it } from 'vitest'
import { composeMigrations } from '@omne-harness-lite/storage'
import { createUpgradeGuard, openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { clockMigrations, clockSnapshotCheck } from '../src/index.ts'

const roots: string[] = []
const owners: SqlStorage[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-clock-snapshot-'))
  roots.push(root)
  const guard = createUpgradeGuard()
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'business.sqlite'),
    migrations: composeMigrations(clockMigrations),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory: join(root, '.quarantine'), onClosed() {} },
  })
  owners.push(storage)
  await guard.confirm()
  const maintenance = storage.maintenance
  if (maintenance === undefined) throw new Error('fixture requires owned maintenance')
  return {
    storage,
    check: () => maintenance.run(session => session.snapshot(clockSnapshotCheck)),
  }
}
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('accepts an empty legacy business clock table after independent Clock initialization', async () => {
  const h = await fixture()
  expect(await h.check()).toEqual({ ok: true })
  expect(await h.storage.read(tx => tx.db.selectFrom('clock_lease').selectAll().execute())).toEqual(
    [],
  )
})

it('preserves an existing legacy floor while accepting its immutable snapshot', async () => {
  const h = await fixture()
  await h.storage.write(tx => sql`INSERT INTO clock_lease VALUES(1, 15000, 10000)`.execute(tx.db))
  expect(await h.check()).toEqual({ ok: true })
  expect(await h.storage.read(tx => tx.db.selectFrom('clock_lease').selectAll().execute())).toEqual(
    [{ id: 1, lease_until: 15000, written_at: 10000 }],
  )
})

it.each([
  ['inverted floor', sql`INSERT INTO clock_lease VALUES(1, 10000, 15000)`],
  ['unsafe integer', sql`INSERT INTO clock_lease VALUES(1, 9223372036854775807, 10000)`],
  ['non-numeric floor', sql`INSERT INTO clock_lease VALUES(1, 15000, 'not a clock')`],
] as const)('refuses a %s in the physical legacy snapshot', async (_name, statement) => {
  const h = await fixture()
  await h.storage.write(tx => statement.execute(tx.db))
  expect(await h.check()).toMatchObject({ ok: false, check: 'clock-snapshot-floor' })
})

it('refuses a missing legacy table instead of treating it as an empty table', async () => {
  const h = await fixture()
  await h.storage.write(tx => sql`DROP TABLE clock_lease`.execute(tx.db))
  expect(await h.check()).toMatchObject({ ok: false, check: 'clock-snapshot-structure' })
})
