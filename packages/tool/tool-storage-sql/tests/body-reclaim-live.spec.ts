// @module-tag slow: exercises real SQLite workers and durable page leases.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { TENANT_A } from './fixtures/app.ts'
import { liveBody, ok } from './fixtures/live-body.ts'
import { openStorage } from './windows-composition/storage.ts'

async function reclaim(f: Awaited<ReturnType<typeof liveBody>>, until: 'idle' | 'blocked') {
  for (let step = 0; step < 32; step += 1)
    if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === until) return
  throw new Error(`reclamation did not become ${until}`)
}

it.each(['valid', 'expired-before-io', 'expired-after-io'] as const)(
  'enforces a %s page lease while real SQLite maintenance deletes expired bodies',
  async mode => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'body-reclaim-live-')))
    const storage = await openStorage(root, [TENANT_A])
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    let heldBody: string | null = null
    try {
      const f = await liveBody(storage, store => ({
        ...store,
        read: async input => {
          if (input.material.id !== heldBody) return store.read(input)
          if (mode === 'expired-after-io') {
            const read = await store.read(input)
            expect(ok(read).bytes.byteLength).toBeGreaterThan(0)
            entered.resolve()
            await resume.promise
            return read
          }
          entered.resolve()
          await resume.promise
          return store.read(input)
        },
      }))
      heldBody = f.body.id
      f.setNow(f.expiresAt - 1)
      const reading = f.ledger.reads.body.read(f.request)
      try {
        await Promise.race([
          entered.promise,
          reading.then(result => {
            throw new Error(`body read ended before the IO gate: ${JSON.stringify(result)}`)
          }),
        ])
        expect(
          (await f.records()).filter(
            row => row.kind === 'material-use' && row.use.kind === 'page-lease',
          ),
        ).toHaveLength(1)
        f.setNow(mode === 'valid' ? f.expiresAt : f.expiresAt + 30_000)
        ok(await f.ledger.maintenance.expire(f.access))
        await reclaim(f, mode === 'valid' ? 'blocked' : 'idle')
        const body = (await f.records()).find(
          row => row.kind === 'material' && row.material.material.id === f.body.id,
        )
        expect(body).toMatchObject({
          material: { state: { kind: mode === 'valid' ? 'sealed' : 'deleted' } },
        })
        expect(await f.ledger.reads.body.read(f.request)).toHaveProperty(
          'failure.reason',
          'expired',
        )
      } finally {
        heldBody = null
        resume.resolve()
        await reading
      }
      const result = await reading
      if (mode === 'valid') expect(ok(result)).toMatchObject({ kind: 'text', text: '中🙂' })
      else expect(result).toHaveProperty('failure.kind', 'unavailable')
      await reclaim(f, 'idle')
      expect(
        (await f.records()).filter(
          row => row.kind === 'material-use' && row.use.kind === 'page-lease',
        ),
      ).toHaveLength(0)
      expect(
        await storage.materialStore.read({
          ...f.access,
          material: f.body,
          offset: '0',
          maxBytes: 8,
        }),
      ).toHaveProperty('failure.kind', 'unavailable')
    } finally {
      resume.resolve()
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

it('keeps native, process-history and delivery materials after reclaiming only the expired model body', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'body-uses-live-')))
  const storage = await openStorage(root, [TENANT_A])
  try {
    const f = await liveBody(storage, store => store)
    const protectedUses = (await f.records()).filter(
      row =>
        row.kind === 'material-use' &&
        ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
    )
    expect(
      new Set(protectedUses.flatMap(row => (row.kind === 'material-use' ? [row.use.kind] : []))),
    ).toEqual(new Set(['native-reference', 'process-history', 'delivery']))
    f.setNow(f.expiresAt)
    ok(await f.ledger.maintenance.expire(f.access))
    await reclaim(f, 'idle')
    const after = await f.records()
    expect(
      after.filter(
        row =>
          row.kind === 'material-use' &&
          ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
      ),
    ).toEqual(protectedUses)
    expect(
      after.find(row => row.kind === 'material' && row.material.material.id === f.body.id),
    ).toMatchObject({ material: { state: { kind: 'deleted' } } })
    expect(
      ok(
        await f.ledger.reads.content.read({
          ...f.access,
          result: f.request.result,
          attachment: f.raw.content,
          after: null,
          maxBytes: 128,
        }),
      ).bytes,
    ).toEqual(f.rawBytes)
    expect(ok(await f.ledger.delivery.read({ ...f.access, result: f.request.result }))).toEqual(
      f.value,
    )
    expect(await f.ledger.reads.body.read(f.request)).toHaveProperty('failure.reason', 'expired')
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
