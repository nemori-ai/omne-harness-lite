// SPEC §2.6: the identity of a database is the field `SqlStorage.database`.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageKey } from '@omne-harness/sql-contract/cordis'
import { createMemorySqlStorage } from '@omne-harness/sql-contract/testing'
import { createFixtureMaterials } from '../src/testing/fixtures.ts'

describe('the identity of a database', () => {
  it('is the same for every object over one database and differs between two databases', async () => {
    const fixture = await createFixtureMaterials()
    try {
      const one = await createMemorySqlStorage({ materials: fixture.materials })
      const other = await createMemorySqlStorage({ materials: fixture.materials })
      const copy: SqlStorage = {
        database: one.storage.database,
        registerCombination: input => one.storage.registerCombination(input),
        commit: (input, options) => one.storage.commit(input, options),
        query: identity => one.storage.query(identity),
        read: (input, options) => one.storage.read(input, options),
      }
      expect(typeof one.storage.database).toBe('object')
      expect(copy.database).toBe(one.storage.database)
      expect(other.storage.database).not.toBe(one.storage.database)
    } finally {
      await fixture.remove()
    }
  })

  it('is what a plugin reads through the proxy of the storage service', async () => {
    const fixture = await createFixtureMaterials()
    try {
      const inner = await createMemorySqlStorage({ materials: fixture.materials })
      class Forwarding extends StorageService {
        readonly database = inner.storage.database
        readonly registerCombination = inner.storage.registerCombination.bind(inner.storage)
        readonly commit = inner.storage.commit.bind(inner.storage)
        readonly query = inner.storage.query.bind(inner.storage)
        readonly read = inner.storage.read.bind(inner.storage)
      }
      const ctx = new Context()
      const fiber = await ctx.plugin(Forwarding)
      try {
        expect(ctx.get(storageKey)?.database).toBe(inner.storage.database)
      } finally {
        await fiber.dispose()
      }
    } finally {
      await fixture.remove()
    }
  })
})
