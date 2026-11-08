// @module-tag slow: runs the production SQLite worker and reopens its persisted database.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolHistoryCallSource } from '../src/index.ts'
import { TENANT_A } from './fixtures/app.ts'
import { openStorage } from './windows-composition/storage.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

it('enumerates idle calls at the maximum page size and continues after worker restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-history-inventory-')))
  let next: string | null = null
  try {
    const first = await openStorage(root, [TENANT_A])
    try {
      for (let index = 0; index < 129; index += 1) {
        expect(
          await first.store.commit({
            domain: {
              kind: 'call',
              tenant: TENANT_A,
              call: ok(decodeToolCallId(`call-${String(index).padStart(3, '0')}`)),
            },
            expected: ok(decodeToolRevision('0')),
            revision: ok(decodeToolRevision('1')),
            writes: [
              {
                kind: 'put',
                record: { kind: 'material-maintenance-hint', hint: { kind: 'none' } },
              },
            ],
          }),
        ).toEqual({ kind: 'committed' })
      }
      const page = ok(
        await createSqlToolHistoryCallSource(first).scan({
          tenant: TENANT_A,
          after: null,
          limit: 128,
        }),
      )
      expect(page.calls).toHaveLength(128)
      expect(page.calls[0]).toBe('call-000')
      expect(page.calls.at(-1)).toBe('call-127')
      expect(page.next).not.toBeNull()
      next = page.next
    } finally {
      await first.close()
    }
    const reopened = await openStorage(root, [TENANT_A])
    try {
      expect(
        ok(
          await createSqlToolHistoryCallSource(reopened).scan({
            tenant: TENANT_A,
            after: next,
            limit: 128,
          }),
        ),
      ).toEqual({ calls: ['call-128'], next: null })
    } finally {
      await reopened.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
