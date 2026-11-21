import { expect, it } from 'vitest'
import type { DispatchRecord } from '@omne-harness/model-contract'
import type { ModelCommands, TransportFact } from '@omne-harness/model-contract/provider'
import { eventually, runtimeFixture } from './runtime-fixture.ts'
import { op, unbox } from './memory-fixture.ts'

const response = (request: string | null): TransportFact => ({ kind: 'response', request })
const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const delta = (text: string): TransportFact => ({ kind: 'block-delta', index: '0', delta: text })
const end: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }
const retried: TransportFact = { kind: 'connect-retry', reason: 'connect-failed' }

type Fixture = ReturnType<typeof runtimeFixture>

async function dispatchesOf(f: Fixture): Promise<readonly DispatchRecord[]> {
  return unbox(
    await f.provider.runtime.calls.dispatches({
      principal: f.principal,
      tenant: f.tenant,
      call: f.admit.call,
    }),
  )
}

async function settled(f: Fixture): Promise<void> {
  await eventually(() => f.results.has(f.admit.call))
  expect(f.results.get(f.admit.call), JSON.stringify(f.results.get(f.admit.call))).toHaveProperty(
    'ok',
  )
}

it('keeps the five moments of a dispatch where each happened, in order', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.controls.clock.advanceTo('2026-10-19T00:00:00.300Z')
    await f.show(f.admit.call, [retried, response('gen-1')])
    f.controls.clock.advanceTo('2026-10-19T00:00:01.250Z')
    await f.show(f.admit.call, [open, delta('hello')])
    f.controls.clock.advanceTo('2026-10-19T00:00:04.000Z')
    f.channel(f.admit.call).push([end])
    await settled(f)
    const [record] = await dispatchesOf(f)
    expect(record?.instants).toEqual({
      prepared: '2026-10-19T00:00:00Z',
      sent: '2026-10-19T00:00:00Z',
      responseStarted: '2026-10-19T00:00:00.300Z',
      firstContent: '2026-10-19T00:00:01.250Z',
      ended: '2026-10-19T00:00:04.000Z',
    })
    expect(record?.request).toBe('gen-1')
    expect(record?.connectRetries).toEqual(['connect-failed'])
  } finally {
    await f.dispose()
  }
})

it('does not rewrite a kept moment or the first request identity', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    await f.show(f.admit.call, [response('gen-first')])
    f.controls.clock.advanceTo('2026-10-19T00:00:02.000Z')
    await f.show(f.admit.call, [response('gen-second'), open, delta('a')])
    f.controls.clock.advanceTo('2026-10-19T00:00:03.000Z')
    await f.show(f.admit.call, [delta('b')])
    f.channel(f.admit.call).push([end])
    await settled(f)
    const [record] = await dispatchesOf(f)
    expect(record?.request).toBe('gen-first')
    expect(record?.instants?.responseStarted).toBe('2026-10-19T00:00:00Z')
    expect(record?.instants?.firstContent).toBe('2026-10-19T00:00:02.000Z')
  } finally {
    await f.dispose()
  }
})

it('keeps no request identity that is empty or longer than 256 bytes', async () => {
  for (const request of ['', 'g'.repeat(257), null]) {
    const f = runtimeFixture()
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([response(request), end])
      await settled(f)
      const [record] = await dispatchesOf(f)
      expect(record).not.toHaveProperty('request')
      expect(record?.instants?.responseStarted).toBe('2026-10-19T00:00:00Z')
    } finally {
      await f.dispose()
    }
  }
})

it('refuses arrivals that do not name one instant or null per fact, and keeps nothing of that batch', async () => {
  const answers: Awaited<ReturnType<ModelCommands<unknown>['preserve']>>[] = []
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async preserve(input) {
      if (answers.length === 0)
        for (const arrivals of [[], input.facts.map(() => 'yesterday')])
          answers.push(
            await commands.preserve({ ...input, operation: op(`bad-${answers.length}`), arrivals }),
          )
      return commands.preserve(input)
    },
  }))
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([open, delta('kept once'), end])
    await settled(f)
    expect(answers).toEqual([
      { failure: { kind: 'invalid', field: 'arrivals', reason: 'shape' } },
      { failure: { kind: 'invalid', field: 'arrivals', reason: 'shape' } },
    ])
    const [record] = await dispatchesOf(f)
    expect(record?.instants?.firstContent).toBe('2026-10-19T00:00:00Z')
  } finally {
    await f.dispose()
  }
})

it('completes the call when the clock cannot be read, with no moment kept (C2)', async () => {
  const f = runtimeFixture({ outputBatchDelayMs: 100 })
  try {
    f.dependencies.clock.now = () => {
      throw new Error('the clock cannot be read')
    }
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    const before = f.preserveInputs.length
    await f.show(f.admit.call, [response('gen-1')])
    expect(f.preserveInputs.length, 'a lone fact is kept without waiting for the batch delay').toBe(
      before + 1,
    )
    f.channel(f.admit.call).push([open, delta('still answered'), end])
    await settled(f)
    const [record] = await dispatchesOf(f)
    expect(record?.instants).toEqual({
      prepared: null,
      sent: null,
      responseStarted: null,
      firstContent: null,
      ended: null,
    })
    expect(record?.terminal).toEqual({ kind: 'completed', reason: 'limit' })
    expect(record?.request).toBe('gen-1')
  } finally {
    await f.dispose()
  }
})

it('holds a batch from the arrival of its first fact until its delay, keeps each arrival, and puts the fact after the delay in the next batch', async () => {
  const f = runtimeFixture({ outputBatchDelayMs: 100 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    const before = f.preserveInputs.length
    f.channel(f.admit.call).push([response('gen-1'), open, delta('held')])
    for (let i = 0; i < 200; i++) await Promise.resolve()
    expect(f.preserveInputs.length, 'nothing is kept before the delay').toBe(before)
    f.controls.clock.advanceTo('2026-10-19T00:00:00.100Z')
    await eventually(() => f.preserveInputs.length > before)
    expect(f.preserveInputs[before]?.facts.map(fact => fact.kind)).toEqual([
      'response',
      'block-open',
      'block-delta',
    ])
    expect(f.preserveInputs[before]?.arrivals).toEqual([
      '2026-10-19T00:00:00Z',
      '2026-10-19T00:00:00Z',
      '2026-10-19T00:00:00Z',
    ])
    f.channel(f.admit.call).push([delta('after the delay'), end])
    await eventually(() => f.preserveInputs.length > before + 1)
    expect(f.preserveInputs[before + 1]?.facts.map(fact => fact.kind)).toEqual([
      'block-delta',
      'ended',
    ])
    expect(f.preserveInputs[before + 1]?.arrivals).toEqual([
      '2026-10-19T00:00:00.100Z',
      '2026-10-19T00:00:00.100Z',
    ])
    await settled(f)
  } finally {
    await f.dispose()
  }
})
