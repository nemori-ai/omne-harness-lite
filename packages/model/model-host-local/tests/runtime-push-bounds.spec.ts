import { expect, it } from 'vitest'
import { LIMITS, quiet, scriptedReceiver, until, world } from './support/push-world.ts'

it.each(['unavailable', 'backpressured'] as const)(
  'a receiver that answers %s is pushed once per wakeup, not in a loop',
  async refusal => {
    const w = world()
    await w.services()
    await w.load()
    const scripted = scriptedReceiver()
    scripted.state.next = Array.from({ length: 20 }, () => refusal)
    await w.register(scripted.receiver)
    await w.admit('one')

    await until(() => w.record('one')?.result?.standing.status === 'waiting', 'the waiting result')
    await quiet()
    await quiet()
    expect(scripted.pushes).toHaveLength(1)
    expect(w.record('one')?.result?.standing).toEqual({ status: 'waiting', reason: refusal })
  },
)

it('a receiver that keeps answering outcome-unknown is pushed 1 + maxRedeliveries times per wakeup', async () => {
  const w = world()
  await w.services()
  await w.load()
  const scripted = scriptedReceiver()
  scripted.state.next = Array.from({ length: 20 }, () => 'unknown' as const)
  await w.register(scripted.receiver)
  await w.admit('one')

  await until(() => w.record('one')?.result?.standing.status === 'unknown', 'the unknown result')
  await quiet()
  await quiet()
  expect(scripted.pushes).toHaveLength(1 + LIMITS.maxRedeliveries)
  expect(w.record('one')?.result?.standing).toEqual({ status: 'unknown' })
  expect(w.handoffs).toEqual([])
})
