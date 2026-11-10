import { afterEach, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'
import { held as fixtureHeld } from './permission-capture-world.ts'
import { GovernanceSourceCoordinator } from '../src/source-coordinator.ts'
import { openSourceCoordinatorWorld } from './source-coordinator-world.ts'

const worlds: Awaited<ReturnType<typeof openSourceCoordinatorWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function setup() {
  const world = await openSourceCoordinatorWorld()
  worlds.push(world)
  await world.accept()
  return world
}
it('retains a real Settings snapshot under actual Identity and releases it after the original terminal', async () => {
  const w = await setup(),
    coordinator = w.coordinator()
  const held = await coordinator.reserve(w.operation, w.governance.principal)
  expect(held).toMatchObject({
    kind: 'held',
    snapshot: { presence: 'absent', state: { revision: 0 } },
  })
  // The update of the source waits for the hold; the same update commits after the settlement.
  expect(await w.source.set()).toEqual({ kind: 'rejected', reason: 'unavailable' })
  expect(await coordinator.settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.source.set()).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await coordinator.reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})
it('recovers a lost reserve reply after both domains reopen without replacing the original snapshot', async () => {
  const w = await setup()
  const service = w.service
  const interrupted = w.coordinator({
    async reserve(context, request) {
      await service.reserve(context, request)
      throw new Error('lost reply')
    },
    settle: request => service.settle(request),
  })
  expect(await interrupted.reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'unavailable',
  })
  expect(await w.source.set()).toMatchObject({ kind: 'rejected' })
  await w.reopen()
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
    snapshot: { state: { revision: 0 } },
  })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})
it('records cancellation before reserve arrives and never treats an absent source provider as completion', async () => {
  const w = await setup(),
    sql = w.governance.services().sql
  const missing = new GovernanceSourceCoordinator(sql)
  expect(await missing.settle(w.operation)).toMatchObject({ kind: 'unavailable' })
  expect(await sql.observe(w.operation)).toMatchObject({ source: { kind: 'requested' } })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.source.set()).toMatchObject({ kind: 'committed' })
})

it('rejects a valid receipt for another original request and preserves source refusal', async () => {
  const w = await setup()
  const service = w.service
  const mismatched = w.coordinator({
    async reserve(_context, request) {
      return fixtureHeld({
        ...request,
        destination: { ...request.destination, attemptId: 'other' },
      })
    },
    settle: request => service.settle(request),
  })
  expect(await mismatched.reserve(w.operation, w.governance.principal)).toEqual({
    kind: 'unavailable',
    owner: 'settings-source',
  })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    source: { kind: 'requested' },
  })
  const rejected = w.coordinator({
    reserve: async () => ({ kind: 'rejected', reason: 'forbidden' }),
    settle: request => service.settle(request),
  })
  expect(await rejected.reserve(w.operation, w.governance.principal)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({ kind: 'settled' })
})
it('reconciles source initiated settlement without dropping the local cleanup responsibility', async () => {
  const w = await setup()
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
  })
  expect(await w.source.sources.control.recover({ after: null, limit: 10 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    record: { state: 'aborted' },
    source: { kind: 'held' },
  })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.source.set()).toMatchObject({ kind: 'committed' })
})
it('recognizes durable custody after its SQL acknowledgement is lost', async () => {
  const w = await setup()
  const original = w.governance.activation.storage
  const storage: SqlStorage = {
    ...original,
    async commit(request, options) {
      const result = await original.commit(request, options)
      return request.identity.operation === 'governance.meta.source-held'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        : result
    },
    query: identity =>
      identity.operation === 'governance.meta.source-held'
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'lost' })
        : original.query(identity),
  }
  const { combinationVersion, manifestDigest } = w.governance.activation.combination('metadata')
  const sql = new SqlOperationCoordinator({
    storage,
    domain: w.governance.activation.domain,
    metadata: { combinationVersion, manifestDigest },
  })
  const interrupted = new GovernanceSourceCoordinator(sql, w.service)
  expect(await interrupted.reserve(w.operation, w.governance.principal)).toEqual({
    kind: 'unavailable',
    owner: 'sql-coordination',
  })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    source: { kind: 'held' },
  })
  await w.reopen()
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
    snapshot: { state: { revision: 0 } },
  })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({ kind: 'settled' })
})

it('converges competing reserve and settle calls on the same original terminal', async () => {
  const w = await setup(),
    coordinator = w.coordinator()
  await Promise.all([
    coordinator.reserve(w.operation, w.governance.principal),
    coordinator.settle(w.operation),
  ])
  expect(await coordinator.settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await coordinator.reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    record: { state: 'aborted' },
    source: { kind: 'settled' },
  })
  expect(await w.source.set()).toMatchObject({ kind: 'committed' })
})

it('retains a present source snapshot and permits cleanup after real membership revocation', async () => {
  const w = await setup()
  expect(await w.source.set()).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
    snapshot: { presence: 'present', state: { revision: 1 } },
  })
  expect(await w.governance.remove()).toMatchObject({ kind: 'succeeded' })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(await w.source.set(false, 1, 'after-revocation')).toMatchObject({
    kind: 'committed',
    revision: 2,
  })
})
it('requires the same capture Identity hold before contacting the source and rejects another principal', async () => {
  const w = await openSourceCoordinatorWorld()
  worlds.push(w)
  expect(await w.governance.services().sql.accept(w.input)).toMatchObject({ kind: 'found' })
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  await w.accept()
  const other = await openSourceCoordinatorWorld()
  worlds.push(other)
  expect(await w.coordinator().reserve(w.operation, other.governance.principal)).toMatchObject({
    kind: 'rejected',
  })
  expect(await w.governance.services().sql.observe(w.operation)).toMatchObject({
    source: { kind: 'requested' },
  })
  expect(await w.coordinator().reserve(w.operation, w.governance.principal)).toMatchObject({
    kind: 'held',
  })
  expect(await w.coordinator().settle(w.operation)).toMatchObject({ kind: 'settled' })
})
