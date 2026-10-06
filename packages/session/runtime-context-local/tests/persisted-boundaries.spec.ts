import { expect, test } from 'vitest'
import { narrow } from '@omne-harness-lite/storage'
import type { ProjectionTables } from '../src/projection-codec.ts'
import { host, init, reader, scope } from './fixture.ts'

test.each(['tail', 'seed', 'registration', 'content', 'json'] as const)(
  'a malformed persisted %s is unavailable and cannot replace the original log fact',
  async fault => {
    const h = await host()
    try {
      await init(h)
      const bound = await reader(h)
      const before = await h.log.readSince(scope.session, 0)
      await h.storage.write(async tx => {
        const db = narrow<ProjectionTables>(tx)
        if (fault === 'tail' || fault === 'seed') {
          await db
            .updateTable('rc_projection_meta')
            .set(fault === 'tail' ? { applied_tail: '-1' } : { seed: '{}' })
            .execute()
        } else {
          await db
            .updateTable('rc_projection_entries')
            .set(
              fault === 'registration'
                ? { registration: '{}' }
                : { content: fault === 'json' ? '{' : '{}' },
            )
            .execute()
        }
      })
      expect(await bound.read(['identity'])).toMatchObject({ reason: 'unavailable' })
      expect(await h.log.readSince(scope.session, 0)).toEqual(before)
    } finally {
      await h.close()
    }
  },
)
