import { expect, test } from 'vitest'
import { narrow, StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import type { ProjectionTables } from '../src/projection-codec.ts'
import { createProjectionStore } from '../src/projection-store.ts'
import { projectContext } from '../src/projection.ts'
import { host, init, scope } from './fixture.ts'

for (const part of ['meta', 'entry'] as const)
  test(`an unknown SQL receipt cannot recognize a changed ${part} under the original UUID`, async () => {
    const h = await host()
    try {
      await init(h)
      let lose = true
      const store = createProjectionStore({
        read: fn => h.storage.read(fn),
        async write(fn) {
          const value = await h.storage.write(fn)
          if (lose) {
            lose = false
            throw new StorageUnavailable('lost original SQL receipt')
          }
          return value
        },
      })
      const prefix = await h.log.readSince(scope.session, 0)
      if ('failure' in prefix) throw new Error('fixture log unavailable')
      const basis = await store.load(scope)
      await expect(
        store.save(scope, basis, projectContext(scope, prefix.entries, prefix.tail)),
      ).rejects.toBeInstanceOf(StorageUnavailable)
      const original = await h.storage.read(async tx => ({
        meta: await narrow<ProjectionTables>(tx)
          .selectFrom('rc_projection_meta')
          .selectAll()
          .executeTakeFirstOrThrow(),
        entry: await narrow<ProjectionTables>(tx)
          .selectFrom('rc_projection_entries')
          .selectAll()
          .executeTakeFirstOrThrow(),
      }))
      await h.storage.write(async tx => {
        const db = narrow<ProjectionTables>(tx)
        if (part === 'meta')
          await db.updateTable('rc_projection_meta').set({ applied_tail: '99' }).execute()
        else await db.updateTable('rc_projection_entries').set({ content: null }).execute()
      })
      await expect(store.load(scope)).rejects.toBeInstanceOf(StorageDefect)
      expect(store.unresolved).toBe(1)
      await expect(store.drain()).rejects.toBeInstanceOf(StorageDefect)
      expect(store.unresolved).toBe(1)
      await h.storage.write(async tx => {
        const db = narrow<ProjectionTables>(tx)
        await db.updateTable('rc_projection_meta').set(original.meta).execute()
        await db.updateTable('rc_projection_entries').set(original.entry).execute()
      })
      await store.drain()
      expect(store.unresolved).toBe(0)
      expect((await store.load(scope)).token).toBe(original.meta.projection_revision)
    } finally {
      await h.close()
    }
  })
