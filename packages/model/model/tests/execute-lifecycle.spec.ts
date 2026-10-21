import { executeModel } from '@omne-harness/model'
import type { TransportFact } from '@omne-harness/model-contract'
import { expect, it } from 'vitest'
import {
  collect,
  controlled,
  delta,
  ended,
  gate,
  request,
  scripted,
  SECRET,
  signal,
} from './execute-fixture.ts'

it('does not prepare or send when already aborted', async () => {
  const abort = new AbortController()
  abort.abort(SECRET)
  const given = controlled()
  expect(await collect(executeModel(request, given.transport, abort.signal))).toEqual([
    { kind: 'not-started', reason: 'cancelled' },
  ])
  expect(given.calls).toEqual([])
})

for (const phase of ['prepare', 'materialize'] as const) {
  for (const rejected of [false, true]) {
    it(`closes late resources after cancellation during ${phase}, rejection=${rejected}`, async () => {
      const abort = new AbortController()
      const entered = gate()
      const delayed = gate()
      const given = controlled({
        [phase]: async () => {
          entered.open()
          await delayed.wait
        },
        ...(rejected
          ? ({ rejection: { at: phase, failure: { kind: 'denied', action: 'send' } } } as const)
          : {}),
      })
      const result = collect(executeModel(request, given.transport, abort.signal))
      await entered.wait
      expect(given.calls).not.toContain('start')
      abort.abort(SECRET)
      delayed.open()
      expect(await result).toEqual([{ kind: 'not-started', reason: 'cancelled' }])
      expect(given.calls).not.toContain('start')
      const closes = given.calls.filter(call => call.endsWith('.close'))
      expect(closes).toEqual(
        phase === 'prepare'
          ? rejected
            ? []
            : ['prepared.close']
          : rejected
            ? ['prepared.close']
            : ['materialized.close', 'prepared.close'],
      )
    })
  }
}

it('passes the original signal and forwards only provider-confirmed interruption', async () => {
  const abort = new AbortController()
  const given = scripted()
  const iterator = executeModel(request, given.transport, abort.signal)[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual(delta)
  abort.abort(SECRET)
  expect((await iterator.next()).value).toEqual({
    kind: 'ended',
    termination: { kind: 'interrupted', stop: 'confirmed' },
  })
  expect(given.counts().start).toBe(1)
  const captured = controlled()
  await collect(executeModel(request, captured.transport, abort.signal))
  expect(captured.signals).toEqual([])
  const active = new AbortController()
  const success = controlled()
  await collect(executeModel(request, success.transport, active.signal))
  expect(success.signals).toEqual([active.signal, active.signal])
})

it.each(['completed', 'eof', 'throws'] as const)(
  'preserves actual %s after abort instead of inventing stop confirmation',
  async mode => {
    const abort = new AbortController()
    const given = controlled({
      start: () => ({
        async *[Symbol.asyncIterator]() {
          yield delta
          if (mode === 'throws') throw new Error(SECRET)
          if (mode === 'completed') yield ended
        },
      }),
    })
    const iterator = executeModel(request, given.transport, abort.signal)[Symbol.asyncIterator]()
    await iterator.next()
    abort.abort(SECRET)
    const terminal = (await iterator.next()).value
    if (mode === 'completed') expect(terminal).toEqual(ended)
    else
      expect(terminal).toMatchObject({
        kind: 'ended',
        termination: { kind: 'failed', fault: { cause: 'stream-lost', upstreamStatus: null } },
      })
    expect(JSON.stringify(terminal)).not.toContain(SECRET)
    expect(given.calls.filter(call => call === 'start')).toHaveLength(1)
  },
)

it.each(['start', 'iterator', 'read', 'eof'] as const)(
  'classifies %s failure as possibly sent stream loss',
  async mode => {
    const given = controlled({
      start: () => {
        if (mode === 'start') throw new Error(SECRET)
        return {
          [Symbol.asyncIterator]() {
            if (mode === 'iterator') throw new Error(SECRET)
            return {
              async next(): Promise<IteratorResult<TransportFact>> {
                if (mode === 'read') throw new Error(SECRET)
                return { done: true, value: undefined }
              },
            }
          },
        }
      },
    })
    const facts = await collect(executeModel(request, given.transport, signal()))
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: {
          cause: 'stream-lost',
          upstreamStatus: null,
          diagnostic: {
            start: 'independent-start-failed',
            iterator: 'independent-start-failed',
            read: 'independent-read-failed',
            eof: 'independent-eof-failed',
          }[mode],
        },
      },
    })
    expect(JSON.stringify(facts)).not.toContain(SECRET)
    expect(given.calls.slice(-2)).toEqual(['materialized.close', 'prepared.close'])
  },
)

it.each(['done', 'value', 'kind'] as const)(
  'sanitizes a throwing provider %s getter as read failure',
  async field => {
    const given = controlled({
      async next(): Promise<IteratorResult<TransportFact>> {
        if (field === 'done')
          return {
            get done(): false {
              throw new Error(SECRET)
            },
            value: delta,
          }
        if (field === 'value')
          return {
            done: false,
            get value(): TransportFact {
              throw new Error(SECRET)
            },
          }
        return {
          done: false,
          value: {
            ...delta,
            get kind(): 'block-delta' {
              throw new Error(SECRET)
            },
          },
        }
      },
    })
    const facts = await collect(executeModel(request, given.transport, signal()))
    expect(facts).toEqual([
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: {
            cause: 'stream-lost',
            upstreamStatus: null,
            diagnostic: 'independent-read-failed',
          },
        },
      },
    ])
    expect(JSON.stringify(facts)).not.toContain(SECRET)
    expect(given.calls).toEqual([
      'prepare',
      'materialize',
      'start',
      'iterator',
      'next',
      'return',
      'materialized.close',
      'prepared.close',
    ])
  },
)

it.each(['return', 'throw'] as const)(
  'consumer %s releases resources without fabricating a terminal',
  async action => {
    const given = controlled()
    const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual(delta)
    if (action === 'return')
      expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
    else {
      const consumer = new Error('consumer-failure')
      await expect(iterator.throw?.(consumer)).rejects.toBe(consumer)
    }
    expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  },
)

it('queues return behind a pending materialize and next, without claiming preemption', async () => {
  const delayed = gate()
  const entered = gate()
  const given = controlled({
    materialize: async () => {
      entered.open()
      await delayed.wait
    },
  })
  const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
  const next = iterator.next()
  await entered.wait
  let returned = false
  const returning = iterator.return?.().then(result => {
    returned = true
    return result
  })
  await Promise.resolve()
  expect(returned).toBe(false)
  expect(given.calls).toEqual(['prepare', 'materialize'])
  delayed.open()
  expect(await next).toEqual({ done: false, value: delta })
  expect(await returning).toEqual({ done: true, value: undefined })
  expect(given.calls).toEqual([
    'prepare',
    'materialize',
    'start',
    'iterator',
    'next',
    'return',
    'materialized.close',
    'prepared.close',
  ])
})

it('finishes all cleanup attempts before a manually retrieved terminal is delivered', async () => {
  const given = controlled({ facts: [ended] })
  const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
  expect(await iterator.next()).toEqual({ done: false, value: ended })
  expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
})

it('waits for asynchronous cleanup before delivering the business terminal', async () => {
  const delayed = gate()
  const entered = gate()
  const given = controlled({
    facts: [ended],
    closing: async step => {
      if (step !== 'materialized.close') return
      entered.open()
      await delayed.wait
    },
  })
  const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
  let delivered = false
  const next = iterator.next().then(result => {
    delivered = true
    return result
  })
  await entered.wait
  expect(delivered).toBe(false)
  expect(given.calls).not.toContain('prepared.close')
  delayed.open()
  expect(await next).toEqual({ done: false, value: ended })
  expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
})

for (const cleanupFailures of [
  ['return'],
  ['materialized.close'],
  ['prepared.close'],
  ['return', 'materialized.close', 'prepared.close'],
]) {
  for (const action of ['next', 'return', 'throw'] as const) {
    it(`preserves completed then reports cleanup failure on ${action}: ${cleanupFailures.join(', ')}`, async () => {
      const given = controlled({ facts: [ended], cleanupFailures })
      const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
      expect(await iterator.next()).toEqual({ done: false, value: ended })
      expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
      const result =
        action === 'next'
          ? iterator.next()
          : action === 'return'
            ? iterator.return?.()
            : iterator.throw?.(new Error(SECRET))
      await expect(result).rejects.toThrow('independent-cleanup-failed')
      await expect(result).rejects.not.toThrow(SECRET)
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
      expect(given.calls.filter(call => call.endsWith('.close'))).toHaveLength(2)
    })
  }
}

it.each(['return', 'throw'] as const)(
  'reports cleanup failure on consumer early %s',
  async action => {
    const given = controlled({
      cleanupFailures: ['return', 'materialized.close', 'prepared.close'],
    })
    const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
    await iterator.next()
    await expect(
      action === 'return' ? iterator.return?.() : iterator.throw?.(new Error(SECRET)),
    ).rejects.toThrow('independent-cleanup-failed')
    expect(given.calls.slice(-3)).toEqual(['return', 'materialized.close', 'prepared.close'])
  },
)

it('delivers a preparation rejection after attempting cleanup, then reports its failure', async () => {
  const given = controlled({
    rejection: { at: 'materialize', failure: { kind: 'denied', action: 'send' } },
    cleanupFailures: ['prepared.close'],
  })
  const iterator = executeModel(request, given.transport, signal())[Symbol.asyncIterator]()
  expect(await iterator.next()).toMatchObject({
    done: false,
    value: { kind: 'not-started', reason: 'rejected' },
  })
  expect(given.calls).toEqual(['prepare', 'materialize', 'prepared.close'])
  await expect(iterator.next()).rejects.toThrow('independent-cleanup-failed')
})
