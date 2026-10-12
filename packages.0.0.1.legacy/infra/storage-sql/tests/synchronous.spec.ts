import { CompiledQuery, sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { NodeSqliteDriver, StorageSqlConfig, openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

describe('sqlite synchronous policy (D-039)', () => {
  it.each([
    [undefined, 1],
    ['normal', 1],
    ['full', 2],
  ] as const)('actual read/write handles and reopen: %s', async (synchronous, expected) => {
    const file = tempSqliteFile('synchronous')
    const config = {
      dialect: 'sqlite' as const,
      file,
      ...(synchronous === undefined ? {} : { synchronous }),
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const storage = await openStorage(config)
      try {
        for (const mode of ['read', 'write'] as const) {
          await storage[mode](async tx => {
            expect((await sql`PRAGMA synchronous`.execute(tx.db)).rows).toEqual([
              { synchronous: expected },
            ])
            expect((await sql`PRAGMA journal_mode`.execute(tx.db)).rows).toEqual([
              { journal_mode: 'wal' },
            ])
          })
        }
      } finally {
        await storage.close()
      }
    }
  })

  it('FULL also reaches each additional reader', async () => {
    const driver = new NodeSqliteDriver({
      file: tempSqliteFile('synchronous-readers'),
      role: 'read',
      synchronous: 'full',
    })
    await driver.init()
    const connections = []
    try {
      for (let i = 0; i < 4; i++) {
        const connection = await driver.acquireConnection()
        connections.push(connection)
        expect(
          (await connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous'))).rows,
        ).toEqual([{ synchronous: 2 }])
      }
    } finally {
      for (const connection of connections) await driver.releaseConnection(connection)
      await driver.destroy()
    }
  })

  it('migration executes on the FULL write handle', async () => {
    let observed: unknown
    const storage = await openStorage({
      dialect: 'sqlite',
      file: tempSqliteFile('synchronous-migration'),
      synchronous: 'full',
      upgrade: false,
      migrations: {
        async getMigrations() {
          return {
            '001_probe': {
              async up(db) {
                observed = (await sql`PRAGMA synchronous`.execute(db)).rows
              },
            },
          }
        },
      },
    })
    try {
      expect(observed).toEqual([{ synchronous: 2 }])
    } finally {
      await storage.close()
    }
  })

  it.each(['off', 'FULL', '', 2, null])('rejects invalid config %s', synchronous => {
    expect(
      StorageSqlConfig.safeParse({
        dialect: 'sqlite',
        file: '/unused/invalid.sqlite',
        synchronous,
      }).success,
    ).toBe(false)
  })
})
