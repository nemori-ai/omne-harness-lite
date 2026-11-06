import { afterAll, beforeAll, expect, it } from 'vitest'
import { RequestRecordSchema, type RequestRecord } from '../src/request-schema.ts'
import { PoolScanResultSchema, type PoolScan, type PoolPosition } from '../src/pool-schema.ts'
import { json } from '../src/encoding.ts'
import { parseJson } from '../src/relational-values.ts'
import { database, legacyCopy } from './legacy-fixture.ts'
import { openWorld } from './world.ts'

let world: Awaited<ReturnType<typeof openWorld>>, original: RequestRecord[]
beforeAll(async () => {
  const { root } = legacyCopy(),
    db = database(root)
  original = db
    .prepare('SELECT record FROM hi_requests ORDER BY sequence')
    .all()
    .map(row => RequestRecordSchema.parse(parseJson(row.record)))
  db.close()
  world = await openWorld({ root })
})
afterAll(async () => {
  await world?.close()
})
async function list(
  filter: PoolScan['filter'],
  actorRef = 'owner',
  first: PoolPosition = { after: '0', offset: 0 },
) {
  const items = []
  let position: PoolPosition | null = first
  while (position) {
    const result = await world.storage.read({
      domain: world.combination,
      handler: 'hitl.pool-read',
      protocol: 'hitl-sql/2',
      requestKey: 'filter',
      input: json({ tenantRef: 'tenant-a', actorRef, position, filter, limit: 3 }),
    })
    if (result.kind !== 'read') throw new Error(JSON.stringify(result))
    const page = PoolScanResultSchema.parse(result.output)
    if (page.kind !== 'page') throw new Error(JSON.stringify(page))
    items.push(...page.items.map(item => item.card))
    position = page.next
    if (items.length > 100) throw new Error('Cursor did not progress')
  }
  return items
}
it('matches an independent reference evaluator across every state subset and delivery filter', async () => {
  const states = ['pending', 'decided', 'invalidated'] as const
  for (let mask = 1; mask < 8; mask++)
    for (const delivery of [undefined, 'pending', 'accepted', 'superseded'] as const) {
      const selected = states.filter((_, i) => mask & (1 << i))
      const filter = {
        states: (selected.length < 3
          ? [...selected, ...selected.slice(0, 1)]
          : [...selected]
        ).reverse(),
        ...(delivery ? { delivery } : {}),
      }
      const expected = original
        .flatMap(request => request.cards)
        .filter(
          card =>
            selected.some(state => state === card.kind) &&
            (!delivery || (card.kind === 'decided' && card.delivery.kind === delivery)),
        )
      expect(await list(filter)).toEqual(expected)
      expect(await list(filter, 'reader')).toEqual(expected)
      expect(await list(filter, 'outsider')).toEqual([])
    }
})
it('returns empty independent-scope projections for foreign origin and session filters', async () => {
  for (const originKind of ['agent-extension', 'tool', 'admission'] as const)
    expect(await list({ states: ['pending', 'decided', 'invalidated'], originKind })).toEqual([])
  expect(
    await list({ states: ['pending', 'decided', 'invalidated'], sessionRef: 'session-unrelated' }),
  ).toEqual([])
})
it('exhausts an int64-max cursor without overflowing the SQLite binding', async () => {
  expect(
    await list({ states: ['pending'] }, 'owner', { after: '9223372036854775807', offset: 0 }),
  ).toEqual([])
})
