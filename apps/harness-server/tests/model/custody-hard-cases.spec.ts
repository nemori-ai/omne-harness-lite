import { afterEach, expect, it } from 'vitest'
import { custodyOf, custodyWorld, pushRecord, until } from './custody-world.ts'

// The hard cases of the result handoff on the release assembly (C12): the real Agent receiver, the
// session transactions and the release evidence. Saved-then-acknowledged is in custody-ack.spec.ts.

const SHARE_FULL = { failure: { kind: 'unavailable', dependency: 'model-capacity' } }

const worlds: Awaited<ReturnType<typeof custodyWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.dispose()
})

async function world(open = true) {
  const w = await custodyWorld(['first', 'second'], open)
  worlds.push(w)
  return w
}

it('pushes again by the original key after unknown answers past the round bound, which the receiver recognises as saved, and acknowledges once (C12)', async () => {
  const w = await world()
  w.records.faults.unknownAfterSave = 3
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the second push, the ACK and the cleanup',
  )
  expect(w.records.faults.unknownAfterSave).toBe(0)
  expect(pushRecord(w.records, w.access, 'first')?.result?.attempts).toBe(4)
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    kind: 'acknowledged',
    cleanup: 'released',
    receipt: { owner: '@omne-harness/agent' },
  })
  expect(w.records.handoffs).toHaveLength(1)
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)

it('keeps a read that began before the ACK, holds the cleanup while it reads, and releases once it ended (C12)', async () => {
  const w = await world(false)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  const started = await w.beginRead('first', 'read-before-ack')
  if (!('ok' in started) || started.ok.kind !== 'started') throw new Error('read expected')
  w.custody.open = true
  await until(
    async () => (await custodyOf(w.records, w.access, 'first')).kind === 'acknowledged',
    'the ACK while the read is open',
  )
  await until(async () => {
    const custody = await custodyOf(w.records, w.access, 'first')
    return custody.kind === 'acknowledged' && custody.cleanup === 'blocked'
  }, 'the cleanup held by the open read')
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    diagnostic: 'active-read',
  })
  expect(await w.admit('second')).toMatchObject(SHARE_FULL)
  expect(await w.endRead('first', started.ok.read)).toMatchObject({ ok: { kind: 'ended' } })
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the cleanup after the read ended',
  )
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)

it('waits without a receiver, and delivers to the receiver that registers for the owner next (C12)', async () => {
  const w = await world()
  await w.dropReceiver()
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(() => {
    const standing = pushRecord(w.records, w.access, 'first')?.result?.standing
    return standing?.status === 'waiting' && standing.reason === 'no-receiver'
  }, 'the result waiting for a receiver')
  expect(w.records.handoffs).toEqual([])
  await w.addReceiver()
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the push to the new receiver, the ACK and the cleanup',
  )
  expect(await custodyOf(w.records, w.access, 'first')).toMatchObject({
    kind: 'acknowledged',
    receipt: { owner: '@omne-harness/agent' },
  })
  expect(w.records.handoffs).toHaveLength(1)
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)

it('keeps the ACK and the share when the cleanup fails, and finishes the cleanup once it can (C12)', async () => {
  const w = await world()
  w.records.faults.cleanupFails = true
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    async () => (await custodyOf(w.records, w.access, 'first')).kind === 'acknowledged',
    'the ACK',
  )
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(pushRecord(w.records, w.access, 'first')?.cleanup).toBe('pending')
  expect(await w.admit('second')).toMatchObject(SHARE_FULL)
  w.records.faults.cleanupFails = false
  await until(
    () => pushRecord(w.records, w.access, 'first')?.cleanup === 'released',
    'the cleanup once it can',
  )
  expect(w.records.handoffs).toHaveLength(1)
  expect(await w.admit('second')).toHaveProperty('ok')
}, 30_000)
