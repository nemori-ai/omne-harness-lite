import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { sourceRequestSchema } from '../src/source-retention-schema.ts'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { CommitResultV2, ReadResult } from '@omne-harness/sql-contract'
import {
  openSourceWorld,
  source,
  sourceRequest,
  sourceSnapshot,
  sourceUpdate,
} from './source-retention-world.ts'
import { sourceKey } from '../src/source-retention-records.ts'
const worlds: Awaited<ReturnType<typeof openSourceWorld>>[] = []
async function open(root?: string) {
  const world = await openSourceWorld(root)
  worlds.push(world)
  return world
}
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
function responses(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses[0].reply.response
}
function output(result: ReadResult) {
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  return result.output
}
const reserve = (id = 'destination-attempt') => ({
  kind: 'reserve' as const,
  request: sourceRequest(id),
  snapshot: sourceSnapshot(),
})

it('preserves the original immutable held snapshot across reopen and draining retries', async () => {
  const first = await open()
  const original = responses(await first.write([reserve()]))
  expect(original).toMatchObject([{ kind: 'held', snapshot: { presence: 'absent' } }])
  expect(responses(await first.write([{ kind: 'begin', update: sourceUpdate() }]))).toMatchObject([
    { kind: 'pending' },
  ])
  await first.close()
  const reopened = await open(first.root)
  const changed = reserve()
  changed.snapshot.projection.ownerRevision = 9
  expect(responses(await reopened.write([changed]))).toEqual(original)
  expect(responses(await reopened.write([reserve('new-attempt')]))).toEqual([{ kind: 'blocked' }])
  expect(output(await reopened.read({ kind: 'readiness', update: sourceUpdate() }))).toMatchObject({
    kind: 'draining',
    held: 1,
  })
})

it('rejects changed binding under the same reservation identity and never revives settled records', async () => {
  const world = await open()
  await world.write([reserve()])
  for (const field of ['route', 'commandDigest'] as const) {
    const changed = reserve()
    changed.request.destination[field] = field === 'route' ? 'other-destination' : 'c'.repeat(64)
    expect(responses(await world.write([changed]))).toEqual([{ kind: 'conflict' }])
  }
  const settled = responses(
    await world.write([
      { kind: 'settle', input: { request: sourceRequest(), outcome: 'committed' } },
    ]),
  )
  expect(settled).toMatchObject([{ kind: 'settled', outcome: 'committed' }])
  expect(responses(await world.write([reserve()]))).toEqual(settled)
  expect(
    responses(
      await world.write([
        { kind: 'settle', input: { request: sourceRequest(), outcome: 'aborted' } },
      ]),
    ),
  ).toEqual([{ kind: 'conflict' }])
})

it('requires zero held for a committed update but preserves holds when an update aborts', async () => {
  const world = await open()
  const update = sourceUpdate()
  await world.write([reserve(), { kind: 'begin', update }])
  expect(responses(await world.write([{ kind: 'finish', update, outcome: 'committed' }]))).toEqual([
    { kind: 'blocked' },
  ])
  expect(
    responses(await world.write([{ kind: 'finish', update, outcome: 'aborted' }])),
  ).toMatchObject([{ kind: 'finished', outcome: 'aborted' }])
  expect(output(await world.read({ kind: 'gate', source }))).toMatchObject({
    pending: null,
    held: 1,
  })
  const next = sourceUpdate('next-root')
  await world.write([{ kind: 'begin', update: next }])
  expect(responses(await world.write([{ kind: 'finish', update, outcome: 'aborted' }]))).toEqual([
    { kind: 'conflict' },
  ])
  expect(output(await world.read({ kind: 'gate', source }))).toMatchObject({
    pending: next,
    held: 1,
  })
  await world.write([{ kind: 'settle', input: { request: sourceRequest(), outcome: 'aborted' } }])
  expect(output(await world.read({ kind: 'readiness', update: next }))).toMatchObject({
    kind: 'ready',
    held: 0,
  })
  expect(
    responses(await world.write([{ kind: 'finish', update: next, outcome: 'committed' }])),
  ).toMatchObject([{ kind: 'finished', outcome: 'committed' }])
})

it('serializes competing updates, preserves their immutable commands, and rolls back unfinished SQL', async () => {
  const world = await open()
  const update = sourceUpdate()
  const results = await Promise.all([
    world.write([{ kind: 'begin', update }]),
    world.write([{ kind: 'begin', update: sourceUpdate('other-root') }]),
  ])
  expect(results.map(responses).flat()).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'pending' }), { kind: 'blocked' }]),
  )
  const current = output(await world.read({ kind: 'gate', source }))
  const fresh = await open()
  expect((await fresh.write([reserve(), { kind: 'begin', update }], true)).kind).toBe('rolled_back')
  expect(output(await fresh.read({ kind: 'gate', source }))).toMatchObject({
    pending: null,
    held: 0,
  })
  await fresh.write([{ kind: 'begin', update }])
  expect(
    responses(
      await fresh.write([{ kind: 'begin', update: { ...update, commandDigest: 'd'.repeat(64) } }]),
    ),
  ).toEqual([{ kind: 'conflict' }])
  expect(current).toMatchObject({ held: 0 })
})

it('bounds held reservations at128, releases capacity only after settlement, and recovers zero-held pending gates', async () => {
  const world = await open()
  const result = responses(
    await world.write(Array.from({ length: 129 }, (_, index) => reserve(`attempt-${index}`))),
  )
  expect(result).toEqual([
    ...Array.from({ length: 128 }, () => expect.objectContaining({ kind: 'held' })),
    { kind: 'limited' },
  ])
  expect(output(await world.read({ kind: 'gate', source }))).toMatchObject({ held: 128 })
  const pageSchema = z.strictObject({
    items: z.array(z.strictObject({ reservationId: z.string(), request: sourceRequestSchema })),
    after: z.string().nullable(),
  })
  const first = pageSchema.parse(
    output(await world.read({ kind: 'holds', page: { after: null, limit: 100 } })),
  )
  const next = pageSchema.parse(
    output(await world.read({ kind: 'holds', page: { after: first.after, limit: 100 } })),
  )
  expect(first.items).toHaveLength(100)
  expect(next.items).toHaveLength(28)
  expect(new Set([...first.items, ...next.items].map(item => item.reservationId)).size).toBe(128)

  await world.write([
    { kind: 'settle', input: { request: sourceRequest('attempt-0'), outcome: 'aborted' } },
  ])
  expect(responses(await world.write([reserve('attempt-128')]))).toMatchObject([{ kind: 'held' }])
  const empty = await open()
  await empty.write([{ kind: 'begin', update: sourceUpdate() }])
  expect(output(await empty.read({ kind: 'holds', page: { after: null, limit: 100 } }))).toEqual({
    items: [],
    after: null,
  })
  expect(
    output(await empty.read({ kind: 'updates', page: { after: null, limit: 100 } })),
  ).toMatchObject({ items: [{ source, pending: sourceUpdate() }], after: sourceKey(source) })
  expect(
    output(await empty.read({ kind: 'updates', page: { after: sourceKey(source), limit: 100 } })),
  ).toEqual({ items: [], after: null })
})

it('uses bounded indexed recovery and constraints in the real installed relations', async () => {
  const world = await open()
  await world.write([reserve(), { kind: 'begin', update: sourceUpdate() }])
  await world.close()
  const db = new DatabaseSync(
    join(world.root, 'domains', `${Buffer.from('system.settings').toString('hex')}.sqlite`),
  )
  try {
    for (const [query, index] of [
      [
        'SELECT source_key FROM st_source_gate WHERE pending_key IS NOT NULL AND source_key > ? ORDER BY source_key LIMIT 100',
        'st_source_pending',
      ],
      [
        "SELECT reservation_key FROM st_source_reservation WHERE state = 'held' AND reservation_key > ? ORDER BY reservation_key LIMIT 100",
        'st_source_recovery',
      ],
      [
        "SELECT count(*) FROM st_source_reservation WHERE source_key = ? AND state = 'held' LIMIT 1",
        'st_source_held',
      ],
    ])
      expect(JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(''))).toContain(index)
    expect(() => db.prepare('UPDATE st_source_gate SET pending_json = NULL').run()).toThrow()
    expect(() => db.prepare("UPDATE st_source_reservation SET state = 'settled'").run()).toThrow()
  } finally {
    db.close()
  }
})

it('a draining target does not block another source target in the same storage domain', async () => {
  const world = await open()
  await world.write([{ kind: 'begin', update: sourceUpdate() }])
  const other = reserve('other-source-attempt')
  const reference = { ...source, target: { ...source.target, targetRef: 'other-preferences' } }
  other.request.source = reference
  other.snapshot.source = reference
  other.snapshot.projection.target = reference.target
  expect(responses(await world.write([other]))).toMatchObject([{ kind: 'held' }])
  expect(output(await world.read({ kind: 'gate', source }))).toMatchObject({
    pending: sourceUpdate(),
    held: 0,
  })
  expect(output(await world.read({ kind: 'gate', source: reference }))).toMatchObject({
    pending: null,
    held: 1,
  })
})
