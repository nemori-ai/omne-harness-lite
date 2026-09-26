import { afterEach, expect, it, vi } from 'vitest'
import { SqliteOwnerSite } from '../src/sqlite/owner.ts'
import { openStorageWithHooks } from '../src/open.ts'
import { createUpgradeGuard } from '../src/index.ts'
import { migrationsOf } from './fixtures/migrations.ts'
import { tempSqliteFile } from './support.ts'

afterEach(() => vi.restoreAllMocks())

it.each(['startup', 'dispose'] as const)(
  'preserves both recovery and owner release failures during %s',
  async phase => {
    const restoration = new Error('injected recovery failure')
    const release = new Error('injected release failure after actual close')
    const acquire = SqliteOwnerSite.prototype.acquire
    vi.spyOn(SqliteOwnerSite.prototype, 'acquire').mockImplementation(async function (
      this: SqliteOwnerSite,
    ) {
      const lock = await acquire.call(this)
      return {
        async release() {
          await lock.release()
          throw release
        },
      }
    })
    vi.spyOn(SqliteOwnerSite.prototype, 'restore').mockRejectedValue(restoration)
    const file = tempSqliteFile('combined-owner-failures')
    const work = async () => {
      const storage = await openStorageWithHooks(
        {
          dialect: 'sqlite',
          file,
          migrations: migrationsOf('t1'),
          upgrade: { guard: createUpgradeGuard(), checks: [] },
        },
        {},
        phase === 'startup'
          ? {
              beforeMigrate() {
                throw new Error('migration gate')
              },
            }
          : {},
      )
      await storage.close()
    }
    const error: unknown = await work().then(
      () => undefined,
      (failure: unknown) => failure,
    )
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('missing aggregate')
    expect(error.errors[1]).toBe(release)
    expect(error.errors[0]).toMatchObject({ cause: restoration })
    expect(error.errors[0].message).toContain('snapshot')
  },
)
