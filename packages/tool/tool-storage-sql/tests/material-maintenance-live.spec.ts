// @module-tag slow: starts real SQLite workers and reopens their persisted database.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolMaterialInstant, decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createSqlToolLedgerStore, createSqlToolMaterialMaintenanceSource } from '../src/index.ts'
import { TENANT_A } from './fixtures/app.ts'
import { openStorage } from './windows-composition/storage.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

it('scans with the production SQLite authorizer and resumes the same bounded round after restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-maintenance-live-')))
  const at = ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z'))
  const request = { tenant: TENANT_A, at, after: null, limit: 1 }
  let cursor: string | null = null
  try {
    const initial = await openStorage(root, [TENANT_A])
    try {
      const ledger = createSqlToolLedgerStore(initial)
      for (const name of ['future', 'second', 'third']) {
        expect(
          await ledger.commit({
            domain: { kind: 'call', tenant: TENANT_A, call: ok(decodeToolCallId(name)) },
            expected: ok(decodeToolRevision('0')),
            revision: ok(decodeToolRevision('1')),
            writes: [
              {
                kind: 'put',
                record: {
                  kind: 'material-maintenance-hint',
                  hint:
                    name === 'future'
                      ? {
                          kind: 'due',
                          at: ok(decodeToolMaterialInstant('2026-11-09T00:00:00.000Z')),
                        }
                      : { kind: 'ready' },
                },
              },
            ],
          }),
        ).toEqual({ kind: 'committed' })
      }
      const source = createSqlToolMaterialMaintenanceSource(initial)
      const page = ok(await source.scan(request))
      expect(page.calls).toEqual([])
      expect(page.next).not.toBeNull()
      cursor = page.next
    } finally {
      await initial.close()
    }
    const restarted = await openStorage(root, [TENANT_A])
    try {
      const source = createSqlToolMaterialMaintenanceSource(restarted)
      const second = ok(await source.scan({ ...request, after: cursor }))
      expect(second.calls).toEqual(['second'])
      expect(second.next).not.toBeNull()
      expect(ok(await source.scan({ ...request, after: second.next }))).toEqual({
        calls: ['third'],
        next: null,
      })
    } finally {
      await restarted.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps a maximum-size page within the production read-row budget', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-maintenance-budget-')))
  try {
    const live = await openStorage(root, [TENANT_A])
    try {
      for (let index = 0; index < 129; index += 1)
        expect(
          await live.store.commit({
            domain: { kind: 'call', tenant: TENANT_A, call: ok(decodeToolCallId(`call-${index}`)) },
            expected: ok(decodeToolRevision('0')),
            revision: ok(decodeToolRevision('1')),
            writes: [
              {
                kind: 'put',
                record: { kind: 'material-maintenance-hint', hint: { kind: 'ready' } },
              },
            ],
          }),
        ).toEqual({ kind: 'committed' })
      const source = createSqlToolMaterialMaintenanceSource(live)
      const request = {
        tenant: TENANT_A,
        at: ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z')),
        after: null,
        limit: 128,
      }
      const page = ok(await source.scan(request))
      expect(page.calls).toHaveLength(128)
      expect(page.next).not.toBeNull()
      expect(ok(await source.scan({ ...request, after: page.next }))).toEqual({
        calls: ['call-128'],
        next: null,
      })
    } finally {
      await live.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
