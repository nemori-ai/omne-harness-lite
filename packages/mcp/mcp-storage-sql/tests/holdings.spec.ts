// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, expect, it } from 'vitest'
import type {
  CatalogKey,
  CorrelationKey,
  EndpointHolding,
  Generation,
  TaskId,
} from '@omne-harness/mcp-contract'
import type { TaskRow, TaskRowKey } from '@omne-harness/mcp-contract/provider'
import {
  occurrenceOf,
  sampleCatalogRecord,
  sampleGrant,
  samplePending,
  sampleSubscription,
  subscriptionKeyOf,
} from '@omne-harness/mcp-contract/testing'
import { openSqlWorld, tenantOf, type SqlWorld } from './world.ts'

const worlds: SqlWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

const home = tenantOf('s')
const other = tenantOf('t')
const holding = (text: string) => text as EndpointHolding
const catalogKey = (tenant = home, held = 'h-desk'): CatalogKey => ({
  tenant,
  account: { kind: 'anonymous' },
  holding: holding(held),
})
const taskKey = (held: string): TaskRowKey => ({
  tenant: home,
  principalKey: 'alice',
  holding: holding(held),
  taskId: `task-${held}` as TaskId,
})
const taskRow: TaskRow = {
  account: { kind: 'anonymous' },
  issuedAt: 1 as Generation,
  call: 'call-1' as CorrelationKey,
  state: 'following',
  round: 1,
  pollIntervalMs: 2000,
  expiresAt: 1_900_000_000_000,
}
const grantKey = (held: string, endpoint: string, tenant = home) => ({
  tenant,
  holding: holding(held),
  endpoint,
})

it('lists each holding with rows and the endpoints of its grants; forgetting one deletes its catalog, task, grant and pending authorization and nothing else', async () => {
  const world = await openSqlWorld()
  worlds.push(world)
  const record = sampleCatalogRecord(1, ['read'])
  expect(await world.store.write(catalogKey(), record, 'absent')).toEqual({ ok: true })
  expect(await world.store.write(catalogKey(home, 'h-files'), record, 'absent')).toEqual({
    ok: true,
  })
  expect(await world.store.write(catalogKey(other), record, 'absent')).toEqual({ ok: true })
  expect(await world.tasks.record(taskKey('h-desk'), taskRow)).toEqual({ ok: 'recorded' })
  expect(await world.tasks.record(taskKey('h-files'), taskRow)).toEqual({ ok: 'recorded' })
  expect(await world.grants.write(grantKey('h-desk', 'desk'), sampleGrant(1), 'absent')).toEqual({
    ok: 'written',
  })
  expect(await world.grants.begin(samplePending(grantKey('h-desk', 'desk'), 'state-1'))).toEqual({
    ok: true,
  })
  expect(await world.grants.begin(samplePending(grantKey('h-wait', 'wait'), 'state-2'))).toEqual({
    ok: true,
  })
  expect(
    await world.grants.write(grantKey('h-desk', 'desk', other), sampleGrant(1), 'absent'),
  ).toEqual({ ok: 'written' })

  expect(await world.holdings.kept(home)).toEqual({
    ok: [
      { holding: 'h-desk', grants: ['desk'] },
      { holding: 'h-files', grants: [] },
      { holding: 'h-wait', grants: [] },
    ],
  })
  expect(await world.holdings.forget(home, holding('h-desk'))).toEqual({ ok: true })
  expect(await world.holdings.forget(home, holding('h-wait'))).toEqual({ ok: true })
  expect(await world.holdings.forget(home, holding('h-wait'))).toEqual({ ok: true })

  expect(await world.holdings.kept(home)).toEqual({ ok: [{ holding: 'h-files', grants: [] }] })
  expect(await world.store.read(catalogKey())).toEqual({ ok: 'absent' })
  expect(await world.tasks.read(taskKey('h-desk'))).toEqual({ ok: 'absent' })
  expect(await world.grants.read(grantKey('h-desk', 'desk'))).toEqual({ ok: 'absent' })
  expect(await world.grants.take(home, 'state-1')).toEqual({ ok: 'absent' })
  expect(await world.grants.take(home, 'state-2')).toEqual({ ok: 'absent' })
  expect(await world.store.read(catalogKey(home, 'h-files'))).toEqual({ ok: record })
  expect(await world.tasks.read(taskKey('h-files'))).toEqual({ ok: taskRow })
  expect(await world.store.read(catalogKey(other))).toEqual({ ok: record })
  expect(await world.grants.read(grantKey('h-desk', 'desk', other))).toEqual({
    ok: sampleGrant(1),
  })
})

it('a tenant without storage lists nothing it could vouch for, and a forget whose commit is not known is unavailable', async () => {
  const world = await openSqlWorld()
  worlds.push(world)
  expect(await world.store.write(catalogKey(), sampleCatalogRecord(1, ['read']), 'absent')).toEqual(
    { ok: true },
  )
  world.blur(true)
  expect(await world.holdings.forget(home, holding('h-desk'))).toEqual({ failure: 'unavailable' })
  expect(await world.holdings.kept(home)).toEqual({ ok: [] })
  world.unbind()
  expect(await world.holdings.kept(home)).toEqual({ failure: 'unavailable' })
  expect(await world.holdings.forget(home, holding('h-desk'))).toEqual({ failure: 'unavailable' })
})

it('a holding with only a subscription is listed; forgetting it deletes the subscription and the events it took in, and nothing of another holding', async () => {
  const world = await openSqlWorld()
  worlds.push(world)
  const desk = { ...subscriptionKeyOf(home), holding: holding('h-desk') }
  const files = { ...subscriptionKeyOf(home), holding: holding('h-files') }
  for (const key of [desk, files]) {
    expect(await world.subscriptions.write(key, sampleSubscription(), 'absent')).toEqual({
      ok: 'written',
    })
    const batch = {
      events: [occurrenceOf('a')],
      cursor: 'c1',
      gap: null,
      at: '2026-11-27T22:00:00.000Z',
    }
    expect(
      await world.subscriptions.receive(key, batch, { maxEvents: 10, maxAgeMs: 86_400_000 }),
    ).toEqual({
      ok: { stored: 1 },
    })
  }
  expect(await world.holdings.kept(home)).toEqual({
    ok: [
      { holding: 'h-desk', grants: [] },
      { holding: 'h-files', grants: [] },
    ],
  })
  expect(await world.holdings.forget(home, holding('h-desk'))).toEqual({ ok: true })
  expect(await world.holdings.kept(home)).toEqual({ ok: [{ holding: 'h-files', grants: [] }] })
  expect(await world.subscriptions.read(desk)).toEqual({ ok: 'absent' })
  expect(await world.subscriptions.occurrences(desk, 0, 10)).toEqual({ ok: [] })
  expect(await world.subscriptions.read(files)).toMatchObject({ ok: { cursor: 'c1' } })
  const kept = await world.subscriptions.occurrences(files, 0, 10)
  expect('ok' in kept && kept.ok.length).toBe(1)
})
