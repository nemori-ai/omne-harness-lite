// A4 on the body tables and the due index (L3 hot spot): a body one tenant settled is not due,
// not swept and not readable for another tenant, whether the other tenant asks through its own
// domain or its rows were planted in the first tenant's database. Real SQLite, real ledger.
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { decodeToolBodyId, decodeToolInstant } from '@omne-harness/tool-contract/provider'
import { createSqlToolBodyStore } from '../src/index.ts'
import { domainNameOf, openApp, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'
import { ok, settledOffloaded } from './fixtures/settled-offloaded.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(): Promise<App> {
  const created = await openApp()
  opened.push(created)
  return created
}

function count(a: App, tenant: TenantId, table: string, ownerText?: string): number {
  const rows =
    ownerText === undefined
      ? a.sqlite.inspect(domainNameOf(tenant), `SELECT COUNT(*) AS n FROM ${table}`)
      : a.sqlite.inspect(
          domainNameOf(tenant),
          `SELECT COUNT(*) AS n FROM ${table} WHERE tenant = ?`,
          [ownerText],
        )
  return Number(rows[0]?.['n'])
}

describe('a body tenant A settled, asked for by tenant B through its own domain', () => {
  it('is not due, not swept and not readable for B; A still sweeps it', async () => {
    const a = await app()
    const live = await settledOffloaded(a, TENANT_A)
    if (live.value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
    const body = live.value.original
    const at = ok(decodeToolInstant(body.retention.expiresAt))
    live.setNow(body.retention.expiresAt)

    expect(await a.store.due(TENANT_B, at, 10)).toEqual({ kind: 'complete', entries: [] })
    const dueA = await a.store.due(TENANT_A, at, 10)
    expect(dueA.kind === 'complete' && dueA.entries.length).toBe(1)

    // B's sweep over the same ledger and body store reclaims nothing of A.
    expect(ok(await live.ledger.sweep(TENANT_B, at, 10))).toEqual({ reclaimed: 0 })
    expect(count(a, TENANT_A, 'tl_body_chunk')).toBeGreaterThan(0)
    expect(count(a, TENANT_A, 'tl_due')).toBe(1)

    // A ledger of B that shares the body store, permit key and clock reads no page of A's body.
    const worldB = await ledgerWorld(TENANT_B)
    const ledgerB = worldB.ledgerOver(a.store, { bodies: live.bodies })
    const read = await ledgerB.reads.body.read({
      ...worldB.access,
      call: live.access.call,
      result: live.result,
      bodyId: body.bodyId,
      after: null,
      maxBytes: 64,
    })
    expect('failure' in read && read.failure.kind).toBe('not-found')

    // The body store itself: B's reference to A's call and body is absent, and B's delete is a no-op.
    const mirrored = { tenant: TENANT_B, call: live.access.call, body: body.bodyId }
    expect(await live.bodies.store.read(mirrored, { first: 0, count: 1 })).toEqual({
      kind: 'absent',
    })
    expect(await live.bodies.store.delete(mirrored)).toEqual({ kind: 'deleted' })
    expect(count(a, TENANT_A, 'tl_body_chunk')).toBeGreaterThan(0)
    expect(count(a, TENANT_A, 'tl_body_manifest')).toBe(1)

    expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 1 })
    expect(count(a, TENANT_A, 'tl_body_chunk')).toBe(0)
    expect(count(a, TENANT_A, 'tl_due')).toBe(0)
  })
})

describe('rows of tenant B planted in the body tables and the due index of tenant A', () => {
  const PLANTED_CALL = 'call-planted'
  const PLANTED_BODY = 'body:planted'

  async function planted(): Promise<App> {
    const a = await app()
    const b = textOf(TENANT_B)
    const domain = domainNameOf(TENANT_A)
    a.sqlite.inspect(
      domain,
      'INSERT INTO tl_body_manifest (tenant, call, body, chunks, bytes, digest) VALUES (?, ?, ?, 1, 1, ?)',
      [b, PLANTED_CALL, PLANTED_BODY, 'sha256:planted'],
    )
    a.sqlite.inspect(
      domain,
      "INSERT INTO tl_body_chunk (tenant, call, body, seq, data) VALUES (?, ?, ?, 0, x'42')",
      [b, PLANTED_CALL, PLANTED_BODY],
    )
    a.sqlite.inspect(
      domain,
      "INSERT INTO tl_due (tenant, kind, name, key, due_at) VALUES (?, 'call', ?, 'body-entry:planted', '2026-01-01T00:00:00.000Z')",
      [b, PLANTED_CALL],
    )
    return a
  }

  it('the due read and the sweep of A see nothing of them', async () => {
    const a = await planted()
    const live = await settledOffloaded(a, TENANT_A)
    if (live.value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
    const at = ok(decodeToolInstant(live.value.original.retention.expiresAt))
    live.setNow(live.value.original.retention.expiresAt)
    const due = await a.store.due(TENANT_A, at, 10)
    if (due.kind !== 'complete') throw new Error(JSON.stringify(due))
    expect(due.entries).toHaveLength(1)
    expect(due.entries.every(entry => entry.domain.tenant === TENANT_A)).toBe(true)
    expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 1 })
    expect(count(a, TENANT_A, 'tl_due', textOf(TENANT_B))).toBe(1)
    expect(count(a, TENANT_A, 'tl_body_chunk', textOf(TENANT_B))).toBe(1)
    expect(count(a, TENANT_A, 'tl_body_manifest', textOf(TENANT_B))).toBe(1)
  })

  it('a body read and a body delete of A at the planted key touch nothing of them', async () => {
    const a = await planted()
    const store = createSqlToolBodyStore({
      ...a.options,
      permitKey: { secret: randomBytes(32) },
      clock: { now: () => ok(decodeToolInstant('2026-11-10T00:00:00.000Z')) },
    })
    const callA = ok(decodeToolCallId(PLANTED_CALL))
    const bodyA = ok(decodeToolBodyId(PLANTED_BODY))
    const ref = { tenant: TENANT_A, call: callA, body: bodyA }
    expect(await store.read(ref, { first: 0, count: 1 })).toEqual({ kind: 'absent' })
    expect(await store.delete(ref)).toEqual({ kind: 'deleted' })
    expect(count(a, TENANT_A, 'tl_body_chunk', textOf(TENANT_B))).toBe(1)
    expect(count(a, TENANT_A, 'tl_body_manifest', textOf(TENANT_B))).toBe(1)
  })
})
