import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { composeMigrations } from '@omne-harness-lite/storage'
import { createUpgradeGuard, openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { readSnapshotCenterId } from '@omne-harness-lite/governance-center-entry'
import { hostMigrationFragments } from '../src/migrations.ts'
import { hostSnapshotChecks } from '../src/snapshot-checks.ts'

const centerId = '0123456789abcdef0123456789abcdef'
const roots: string[] = []
const owners: SqlStorage[] = []
async function fixture(upgrade = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-owner-structure-')))
  roots.push(root)
  const file = join(root, 'center.sqlite')
  if (upgrade) {
    const guard = createUpgradeGuard()
    const old = await openStorage({
      dialect: 'sqlite',
      file,
      migrations: composeMigrations(hostMigrationFragments.slice(0, 9)),
      upgrade: { guard, checks: [] },
    })
    try {
      await guard.confirm()
    } finally {
      await old.close()
    }
  }
  const guard = createUpgradeGuard()
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composeMigrations(hostMigrationFragments),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory: join(root, '.quarantine'), onClosed() {} },
  })
  owners.push(storage)
  await storage.write(async tx => {
    await tx.db
      .insertInto('clock_lease')
      .values({ id: 1, lease_until: 15000, written_at: 10000 })
      .execute()
    await tx.db
      .updateTable('governance_center')
      .set({ center_id: centerId })
      .where('slot', '=', 'center')
      .execute()
  })
  await guard.confirm()
  const maintenance = storage.maintenance
  if (maintenance === undefined) throw new Error('missing owned maintenance')
  return { storage, maintenance }
}
afterEach(async () => {
  for (const storage of owners.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 each schema owner checks the same snapshot', () => {
  it.each([false, true])(
    'accepts the actual %s upgrade path without changing identity or clock',
    async upgrade => {
      const { storage, maintenance } = await fixture(upgrade)
      await maintenance.run(session =>
        session.snapshot(async view => {
          for (const check of hostSnapshotChecks) expect(await check(view)).toEqual({ ok: true })
          expect(await readSnapshotCenterId(view)).toBe(centerId)
        }),
      )
      expect(
        await storage.read(tx => tx.db.selectFrom('clock_lease').selectAll().execute()),
      ).toEqual([{ id: 1, lease_until: 15000, written_at: 10000 }])
      expect(
        await storage.read(tx => tx.db.selectFrom('governance_center').selectAll().execute()),
      ).toEqual([{ slot: 'center', center_id: centerId }])
    },
  )

  it.each([
    ['missing login table', 'DROP TABLE login_state', 'account-snapshot-structure'],
    [
      'missing activity column',
      'ALTER TABLE login_state DROP COLUMN last_activity_at',
      'account-snapshot-structure',
    ],
    [
      'missing login unique index',
      'DROP INDEX account_login_identifier_unique',
      'account-snapshot-structure',
    ],
    [
      'missing organization unique index',
      'DROP INDEX organization_owner_account_unique',
      'organization-snapshot-structure',
    ],
    [
      'extra trigger',
      'CREATE TRIGGER unwanted AFTER INSERT ON account BEGIN SELECT 1; END',
      'host-snapshot-objects',
    ],
    ['missing clock floor', 'DELETE FROM clock_lease', 'clock-snapshot-floor'],
    [
      'inverted clock floor',
      'UPDATE clock_lease SET written_at=lease_until+1',
      'clock-snapshot-floor',
    ],
    [
      'non-numeric clock floor',
      "UPDATE clock_lease SET written_at='not a clock'",
      'clock-snapshot-floor',
    ],
    [
      'out-of-range clock floor',
      'UPDATE clock_lease SET lease_until=9223372036854775807',
      'clock-snapshot-floor',
    ],
    ['unminted center', 'UPDATE governance_center SET center_id=NULL', 'center-snapshot-identity'],
    [
      'extra center row',
      "INSERT INTO governance_center VALUES ('other','0123456789abcdef0123456789abcdef')",
      'center-snapshot-identity',
    ],
  ])(
    'rejects %s even though SQLite itself remains readable and physically valid',
    async (_name, statement, expected) => {
      const { storage, maintenance } = await fixture()
      await storage.write(async tx => {
        await sql.raw(statement).execute(tx.db)
      })
      const failures = await maintenance.run(session =>
        session.snapshot(async view => {
          const failures: string[] = []
          for (const check of hostSnapshotChecks) {
            const result = await check(view)
            if (!result.ok) failures.push(result.check)
          }
          return failures
        }),
      )
      expect(failures).toContain(expected)
    },
  )

  it.each([
    [
      'organization',
      ', constraint "organization_owner_account_fk" foreign key ("owner_account") references "account" ("account_id") on delete restrict',
      'organization-snapshot-structure',
    ],
    ['clock_lease', ' check (id = 1)', 'clock-snapshot-structure'],
  ])(
    'rejects a missing constraint on %s while its current rows remain valid',
    async (name, fragment, expected) => {
      const { storage, maintenance } = await fixture()
      const original = await maintenance.run(session =>
        session.snapshot(async view => view.structure.tables.find(table => table.name === name)),
      )
      if (original === undefined || !original.definition.includes(fragment))
        throw new Error('constraint fixture no longer matches the real migration')
      await storage.write(async tx => {
        const rows = await tx.db.selectFrom(name).selectAll().execute()
        await tx.db.schema.dropTable(name).execute()
        await sql.raw(original.definition.replace(fragment, '')).execute(tx.db)
        for (const index of original.indexes) {
          if (index.definition !== null) await sql.raw(index.definition).execute(tx.db)
        }
        for (const row of rows) await tx.db.insertInto(name).values(row).execute()
      })
      const failures = await maintenance.run(session =>
        session.snapshot(async view => {
          const checks = await Promise.all(hostSnapshotChecks.map(check => check(view)))
          return checks.filter(check => !check.ok).map(check => check.check)
        }),
      )
      expect(failures).toContain(expected)
    },
  )
})
