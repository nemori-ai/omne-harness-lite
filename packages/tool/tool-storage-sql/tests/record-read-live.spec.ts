// @module-tag slow: exercises the production SQLite worker and its read byte bound.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { TENANT_A } from './fixtures/app.ts'
import { openStorage } from './windows-composition/storage.ts'

function revision(value: number) {
  const result = decodeToolRevision(String(value))
  if ('failure' in result) throw new Error('invalid test revision')
  return result.ok
}

it('reads one record beyond the full-domain byte bound and preserves the domain CAS', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-record-read-')))
  try {
    const app = await openStorage(root, [TENANT_A])
    try {
      const domain = { kind: 'host' as const, tenant: TENANT_A, key: 'large-history' }
      for (let index = 0; index < 9; index++) {
        expect(
          await app.store.commit({
            domain,
            expected: revision(index),
            revision: revision(index + 1),
            writes: [
              {
                kind: 'put',
                record: {
                  kind: 'host',
                  host: { key: `unrelated-${index}`, value: 'x'.repeat(524288) },
                },
              },
            ],
          }),
        ).toEqual({ kind: 'committed' })
      }
      const target = { kind: 'host' as const, host: { key: 'wanted', value: 'exact-value' } }
      expect(
        await app.store.commit({
          domain,
          expected: revision(9),
          revision: revision(10),
          writes: [{ kind: 'put', record: target }],
        }),
      ).toEqual({ kind: 'committed' })
      expect(await app.store.read(domain)).toMatchObject({ kind: 'unavailable' })
      const snapshot = await app.store.readRecord(domain, 'host:wanted')
      expect(snapshot).toEqual({ kind: 'complete', revision: revision(10), record: target })
      if (snapshot.kind !== 'complete') throw new Error('record snapshot required')
      const pendingWrite = app.store.commit({
        domain,
        expected: snapshot.revision,
        revision: revision(11),
        writes: [{ kind: 'delete' as const, key: 'host:unrelated-0' }],
      })
      expect(await pendingWrite).toEqual({ kind: 'committed' })
      expect(await app.store.readRecord(domain, 'host:wanted')).toEqual({
        kind: 'complete',
        revision: revision(11),
        record: target,
      })
      expect(
        await app.store.commit({
          domain,
          expected: snapshot.revision,
          revision: revision(12),
          writes: [{ kind: 'delete', key: 'host:wanted' }],
        }),
      ).toEqual({ kind: 'conflict', current: revision(11) })
    } finally {
      await app.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
