// @module-tag slow
// A 5 MiB final through the real SQLite command limit: the ledger plans it when the execution
// records it, so the body goes to the body store as a system body and the fact, the result record
// and the whole call domain stay bounded. The settled result reads back page by page and expires.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { domainNameOf, openApp, TENANT_A } from './fixtures/app.ts'
import { ok, settledOffloaded } from './fixtures/settled-offloaded.ts'

it.each([32, 5 * 1024 * 1024])(
  'plans a %i byte final into a bounded fact and record, with the body in the body store',
  async bytes => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-final-capacity-')))
    const app = await openApp({ directory: root, maxCommandBytes: 1_048_576, keep: true })
    try {
      const live = await settledOffloaded(app, TENANT_A, 'x'.repeat(bytes))
      const offloaded = bytes > 65_536
      expect(live.value.original.kind).toBe(offloaded ? 'offloaded' : 'none')
      const retained = await app.store.read({
        kind: 'call',
        tenant: TENANT_A,
        call: live.access.call,
      })
      if (retained.kind !== 'complete') throw new Error('ledger read incomplete')
      expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThan(200_000)
      const entries = retained.records.filter(record => record.kind === 'body-entry')
      expect(entries).toHaveLength(offloaded ? 1 : 0)
      const chunks = app.sqlite.inspect(
        domainNameOf(TENANT_A),
        'SELECT COUNT(*) AS n FROM tl_body_chunk',
      )
      expect(Number(chunks[0]?.['n'])).toBe(offloaded ? Math.ceil(bytes / 65_536) : 0)
      if (live.value.original.kind !== 'offloaded') return
      expect(live.value.original).toMatchObject({
        bodyBytes: String(bytes),
        previewKind: 'mechanical',
        retention: { activatedAt: '2026-11-10T00:00:00.000Z' },
      })
      const visible = live.value.content
        .flatMap(block => (block.kind === 'text' ? [block.text] : []))
        .join('')
      expect(Buffer.byteLength(visible)).toBeLessThanOrEqual(65_536)
      expect(visible).toContain('read_result')
      const request = {
        ...live.access,
        result: live.result,
        bodyId: live.value.original.bodyId,
        after: null,
        maxBytes: 17,
      }
      const first = ok(await live.ledger.reads.body.read(request))
      expect(first).toMatchObject({ kind: 'text', text: 'x'.repeat(17), position: '0' })
      const second = ok(await live.ledger.reads.body.read({ ...request, after: first.next }))
      expect(second).toMatchObject({ kind: 'text', text: 'x'.repeat(17), position: '17' })
      live.setNow(live.value.original.retention.expiresAt)
      expect(await live.ledger.reads.body.read({ ...request, after: second.next })).toEqual({
        failure: { kind: 'not-found', target: 'body', reason: 'expired' },
      })
    } finally {
      app.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  60_000,
)
