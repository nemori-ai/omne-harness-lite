import { afterEach, expect, it } from 'vitest'
import { custodyOf, custodyWorld, pushRecord, until } from './custody-world.ts'

const SHARE_FULL = { failure: { kind: 'unavailable', dependency: 'model-capacity' } }

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
  const w = await custodyWorld(['first', 'second'], false)
  worlds.push(w)
  expect(await w.admit('first')).toHaveProperty('ok')
  await until(
    () => pushRecord(w.records, w.access, 'first')?.result?.standing.status === 'saved',
    'the saved result',
  )
  await until(() => w.records.handoffs.length > 0, 'the ACK attempt')
  expect(await custodyOf(w.records, w.access, 'first')).toEqual({ kind: 'producer' })
  expect(await w.admit('second')).toMatchObject(SHARE_FULL)

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
  expect(await w.admit('second')).toMatchObject(SHARE_FULL)

  expect(await w.acknowledge('first', 'ack-genuine', saved)).toMatchObject({
    ok: { custody: { kind: 'acknowledged' } },
  })
}, 30_000)

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
  expect(await w.admit('second')).toMatchObject(SHARE_FULL)

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
