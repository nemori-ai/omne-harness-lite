import { describe, expect, it } from 'vitest'
import type {
  ModelCommands,
  ModelDriveInput,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { LiveInput } from '../src/live/body.ts'
import { endLive } from '../src/live/ending.ts'
import type { LiveEnd, LiveRunner } from '../src/live/runner.ts'
import { op } from './memory-fixture.ts'

type Recovery = ModelCommands<unknown>['loadRecovery']

function ending(recovery: Recovery, signal = new AbortController().signal) {
  const fed: LiveInput[] = []
  const runner = { feed: (input: LiveInput) => void fed.push(input) } as unknown as LiveRunner
  const commands = { loadRecovery: recovery } as unknown as ModelCommands<unknown>
  const ended = Promise.withResolvers<LiveEnd>()
  const claim = {} as ModelDriveInput<unknown>
  const result = endLive(commands, claim, runner, ended.promise, signal)
  return { fed, ended, result }
}
const control = (intent: 'cancel' | 'end'): Recovery =>
  (async () => ({
    ok: { state: { control: { kind: 'requested', operation: op('early'), intent } } },
  })) as unknown as Recovery
const completed: LiveEnd = {
  termination: { kind: 'completed', reason: 'stop' },
  last: 3,
  account: null,
}
const drain = async (facts: AsyncIterable<TransportFact>) => {
  const all: TransportFact[] = []
  for await (const fact of facts) all.push(fact)
  return all
}
const settle = async (world: ReturnType<typeof ending>, end: LiveEnd = completed) => {
  await Promise.resolve()
  world.ended.resolve(end)
  return world.result
}

describe('the end of a live body', () => {
  const reads: [string, Recovery, LiveInput[]][] = [
    ['a recorded cancel', control('cancel'), [{ kind: 'cancel', control: op('early') }]],
    ['a recorded end', control('end'), []],
    [
      'a refused read',
      async () => ({ failure: { kind: 'invalid', field: 'call', reason: 'x' } }),
      [],
    ],
    ['a read that throws', () => Promise.reject(new Error('store gone')), []],
  ]
  for (const [name, recovery, fed] of reads)
    it(`passes on only a cancel recorded before the body was held: ${name}`, async () => {
      const world = ending(recovery)
      await settle(world)
      expect(world.fed).toEqual(fed)
    })

  it('asks the body to stop when the drive stops, before or while it waits, and not after', async () => {
    const before = new AbortController()
    before.abort()
    const early = ending(control('end'), before.signal)
    await settle(early)
    expect(early.fed).toEqual([{ kind: 'stop' }])

    const during = new AbortController()
    const waiting = ending(control('end'), during.signal)
    await new Promise(resolve => setTimeout(resolve, 0))
    during.abort()
    await settle(waiting)
    expect(waiting.fed).toEqual([{ kind: 'stop' }])

    const after = new AbortController()
    const done = ending(control('end'), after.signal)
    await settle(done)
    after.abort()
    expect(done.fed).toEqual([])
  })

  it('gives the usage of a close it saw before the ending, and a confirmed stop for an interruption', async () => {
    const account = { event: 2, value: { usage: 'seen' } } as unknown as LiveEnd['account']
    const interrupted: LiveEnd = {
      termination: { kind: 'interrupted', control: op('early') },
      last: 5,
      account,
    }
    const kept = await settle(ending(control('end')), interrupted)
    expect(kept.last).toBe(5)
    expect(await drain(kept.facts)).toEqual([
      { kind: 'account', ...account },
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
    const plain = await settle(ending(control('end')))
    expect(await drain(plain.facts)).toEqual([
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
  })
})
