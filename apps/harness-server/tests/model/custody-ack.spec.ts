// R2-D256 and R2-D257: the Model's ACK of an Agent result is confirmed from the durable received
// record of the session-log Journal, so the call's share comes back and the same tenant admits its
// next call. The release share is 1000000 bytes and a call holds 524288 of it, so the second call
// fits only after the first is acknowledged and cleaned. What is real and what stands in is named
// in `custody-world.ts`.
// Red when: the release `handoff` evidence answers `unavailable` again (the second call is refused
// for capacity); the evidence adapter and the receiver disagree on the record; the Journal's
// record is not found again after the tree is reloaded on the same storage.
import { afterEach, expect, it } from 'vitest'
import { custodyOf, custodyWorld, pushRecord, until } from './custody-world.ts'

const worlds: Awaited<ReturnType<typeof custodyWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.dispose()
})

it('acknowledges the saved result through the durable record, gives the share back, and admits the next call', async () => {
  const w = await custodyWorld(['first', 'second'])
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the push, ACK and cleanup of the first call',
  )
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    kind: 'acknowledged',
    cleanup: 'released',
    receipt: { owner: '@omne-harness/agent' },
  })
  expect(await w.admit('second')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'second')?.cleanup === 'released',
    'the second call to its cleanup',
  )
  expect(w.records.handoffs).toHaveLength(2)
}, 30_000)

it('acknowledges after the tree is reloaded on the same storage, from the record the Journal reads back', async () => {
  // Before the reload the custody evidence is not reachable: the result is saved, the ACK is
  // unavailable, and the share is held.
  const w = await custodyWorld(['first', 'second'], false)
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  await until(() => w.records.handoffs.length > 0, 'the ACK attempt')
  expect(await custodyOf(w.records, w.access, 'first')).toEqual({ kind: 'producer' })
  expect(await w.admit('second')).toMatchObject({ failure: { kind: 'capacity' } })

  await w.reload(true)
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the ACK and cleanup after the reload',
  )
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    kind: 'acknowledged',
    cleanup: 'released',
  })
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)

// R2-D260: evidence that differs from the committed record is refused as forged; the Model keeps
// the result and its share, and the evidence the receiver really saved still acknowledges. Red when
// a forged ACK is taken, answered `unavailable`, or drops the result or the share.
it('refuses a forged ACK as handoff-invalid and keeps the result and its share', async () => {
  const w = await custodyWorld(['first', 'second'], false)
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  const standing = pushRecord(w.records, w.access, 'first')?.result?.standing
  if (standing?.status !== 'saved') throw new Error('saved expected')
  const saved = standing.receipt.evidence
  w.custody.open = true

  const forged = { ...saved, digest: 'f'.repeat(64) }
  expect(await w.acknowledge('first', 'ack-forged', forged)).toMatchObject({
    failure: { kind: 'handoff-invalid' },
  })
  expect(await custodyOf(w.records, w.access, 'first')).toEqual({ kind: 'producer' })
  expect(pushRecord(w.records, w.access, 'first')?.result?.delivery.parts.length).toBeGreaterThan(0)
  expect(await w.admit('second')).toMatchObject({ failure: { kind: 'capacity' } })

  expect(await w.acknowledge('first', 'ack-genuine', saved)).toMatchObject({
    ok: { custody: { kind: 'acknowledged' } },
  })
}, 30_000)

// R2-D260: the push ledger is in memory, so a restart loses it. The durable custody of the Model
// records is the fact of what is owed: the push scans it when it starts, pushes the saved result
// again, the Agent receiver recognises the same key and content and answers with its first receipt,
// and the Model acknowledges with it and gives the share back. Red when the push does not scan at
// its start (the call stays with the producer and the second call is refused for capacity), or
// when a pushed-again result is not recognised as the one already saved.
it('pushes again after a restart that lost the push ledger, acknowledges, and gives the share back', async () => {
  const w = await custodyWorld(['first', 'second'], false)
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  await until(() => w.records.handoffs.length > 0, 'the ACK attempt')
  const before = pushRecord(w.records, w.access, 'first')?.result?.standing
  expect(await custodyOf(w.records, w.access, 'first')).toEqual({ kind: 'producer' })
  expect(await w.admit('second')).toMatchObject({ failure: { kind: 'capacity' } })

  await w.restart(true)
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the push, ACK and cleanup after the restart',
  )
  const after = pushRecord(w.records, w.access, 'first')?.result?.standing
  expect(after).toEqual(before)
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    kind: 'acknowledged',
    cleanup: 'released',
  })
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)

// Pushing again is idempotent: two restarts push the same result twice more, the receiver answers
// with the same receipt each time, and one ACK with it settles the call. Red when a second push
// again is refused (conflict) or answered with another receipt.
it('pushes the same result again on every restart and settles it once', async () => {
  const w = await custodyWorld(['first', 'second'], false)
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  const first = pushRecord(w.records, w.access, 'first')?.result?.standing

  await w.restart(false)
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the result saved again after the first restart',
  )
  expect(pushRecord(w.records, w.access, 'first')?.result?.standing).toEqual(first)
  expect(await custodyOf(w.records, w.access, 'first')).toEqual({ kind: 'producer' })

  await w.restart(true)
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the ACK and cleanup after the second restart',
  )
  expect(pushRecord(w.records, w.access, 'first')?.result?.standing).toEqual(first)
  const custody = await custodyOf(w.records, w.access, 'first')
  expect(custody).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  if (custody.kind !== 'acknowledged' || first?.status !== 'saved') throw new Error('unreachable')
  expect(custody.receipt).toEqual(first.receipt.evidence)
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)
