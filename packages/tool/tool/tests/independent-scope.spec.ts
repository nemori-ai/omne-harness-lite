import { describe, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type {
  IndependentToolScopeInput,
  ToolAuthorLimits,
  ToolExecutionScope,
  ToolProcessUpdate,
} from '@omne-harness/tool-contract/provider'
import { createIndependentToolScope } from '@omne-harness/tool'
import {
  answer,
  append,
  ask,
  askContract,
  failing,
  immediateReceiver,
  limits,
  manualReceiver,
  manualWaiter,
  replace,
  resourceContract,
  resourceWait,
  scope,
  settled,
  text,
  unwrap,
} from './scope-values.ts'

function input(overrides: Partial<IndependentToolScopeInput> = {}): IndependentToolScopeInput {
  return {
    limits: limits(),
    signal: new AbortController().signal,
    process: null,
    waits: null,
    ...overrides,
  }
}

describe('1 createIndependentToolScope', () => {
  it('1 scope: creates an independent context on the given signal', () => {
    const signal = new AbortController().signal
    const created = unwrap(createIndependentToolScope(input({ signal })))
    expect(created.context.mode).toBe('independent')
    expect(created.context.signal).toBe(signal)
    expect(created.limits).toEqual(limits())
  })

  it.each([
    ['zero', 0, 'range'],
    ['negative', -1, 'range'],
    ['fraction', 1.5, 'range'],
    ['beyond safe', 2 ** 53, 'range'],
    ['a string', '1', 'type'],
  ] as const)('1 scope: rejects a limit that is %s', (_, value, reason) => {
    for (const field of Object.keys(limits()) as (keyof ToolAuthorLimits)[]) {
      const broken = { ...limits(), [field]: value } as unknown as ToolAuthorLimits
      expect(createIndependentToolScope(input({ limits: broken }))).toEqual({
        failure: { field: `limits.${field}`, reason },
      })
    }
  })

  it('1 scope: rejects a missing limit, an extra limit field and a signal that is not an AbortSignal', () => {
    const { authorBufferBytes: _, ...missing } = limits()
    expect(createIndependentToolScope(input({ limits: missing as ToolAuthorLimits }))).toEqual({
      failure: { field: 'limits.authorBufferBytes', reason: 'missing' },
    })
    const extra = { ...limits(), other: 1 } as ToolAuthorLimits
    expect(createIndependentToolScope(input({ limits: extra }))).toEqual({
      failure: { field: 'limits.other', reason: 'unknown-field' },
    })
    expect(createIndependentToolScope(input({ signal: {} as AbortSignal }))).toEqual({
      failure: { field: 'signal', reason: 'type' },
    })
  })

  it('1 scope: the abort listener leaves the signal once the execution finished or was cancelled', async () => {
    const finished = new AbortController()
    const add = vi.spyOn(finished.signal, 'addEventListener')
    const remove = vi.spyOn(finished.signal, 'removeEventListener')
    const created = unwrap(createIndependentToolScope(input({ signal: finished.signal })))
    expect(add).toHaveBeenCalledTimes(1)
    const listener = add.mock.calls[0]?.[1]
    expect(remove).not.toHaveBeenCalled()
    expect(await created.finish('returned')).toEqual({ ok: undefined })
    expect(remove).toHaveBeenCalledWith('abort', listener)
    // Without the listener, an abort after the settlement no longer reaches the execution.
    finished.abort()
    const late = await created.context.emit(append('log', 'late'))
    expect('failure' in late && late.failure.kind).toBe('closed')

    const cancelled = new AbortController()
    const addedToCancelled = vi.spyOn(cancelled.signal, 'addEventListener')
    const removedFromCancelled = vi.spyOn(cancelled.signal, 'removeEventListener')
    unwrap(createIndependentToolScope(input({ signal: cancelled.signal })))
    cancelled.abort()
    expect(removedFromCancelled).toHaveBeenCalledWith('abort', addedToCancelled.mock.calls[0]?.[1])
  })
})

describe('3 emit', () => {
  it('3 emit: copies the update, numbers it and hands it to the receiver in order', async () => {
    const { receiver, calls } = immediateReceiver()
    const { scope: s } = scope({ process: receiver })
    const first: ToolProcessUpdate = {
      kind: 'append-text',
      index: 'log',
      text: 'one',
      close: false,
    }
    const mutable = { ...first }
    const receipt = await s.context.emit(mutable)
    mutable.text = 'changed'
    expect(receipt).toEqual({ ok: { kind: 'local', sequence: '1' } })
    expect(await s.context.emit(append('log', 'two'))).toEqual({
      ok: { kind: 'local', sequence: '2' },
    })
    expect(calls).toEqual([
      { sequence: '1', update: first },
      { sequence: '2', update: append('log', 'two') },
    ])
    expect(Object.isFrozen(calls[0]?.update)).toBe(true)
  })

  it('3 emit: an invalid update takes no slot and is never sent', async () => {
    const { receiver, calls } = immediateReceiver()
    const { scope: s } = scope({ process: receiver })
    const invalid = [
      { kind: 'append-text', index: 'log', text: 'x' },
      { kind: 'append-text', index: '', text: 'x', close: false },
      { kind: 'append-text', index: 'log', text: 'x', close: false, extra: true },
      { kind: 'replace', index: 'panel', content: { kind: 'text', text: 'x' }, close: false },
      { kind: 'replace', index: 'panel', content: text('panel', 'x'), close: 'no' },
      { kind: 'frame', index: 'panel', close: false },
      null,
    ]
    for (const update of invalid) {
      const outcome = await s.context.emit(update as never)
      expect('failure' in outcome && outcome.failure.kind).toBe('invalid')
    }
    const hidden = { ...text('panel', 'x'), visibility: { toHuman: false, toModel: true } }
    const outcome = await s.context.emit({
      kind: 'replace',
      index: 'panel',
      content: hidden,
      close: false,
    })
    expect('failure' in outcome && outcome.failure.kind).toBe('invalid')
    expect(await s.context.emit(append('log', 'first'))).toEqual({
      ok: { kind: 'local', sequence: '1' },
    })
    expect(calls.map(call => call.sequence)).toEqual(['1'])
  })

  it('3 emit: concurrent emits reach the receiver in acceptance order even if an earlier receive resolves later', async () => {
    const { receiver, calls, release } = manualReceiver()
    const { scope: s } = scope({ process: receiver })
    const first = s.context.emit(append('log', 'one'))
    const second = s.context.emit(append('log', 'two'))
    await settled()
    expect(calls.map(call => call.sequence)).toEqual(['1'])
    release('1')
    await settled()
    expect(calls.map(call => call.sequence)).toEqual(['1', '2'])
    release('2')
    expect(await first).toEqual({ ok: { kind: 'local', sequence: '1' } })
    expect(await second).toEqual({ ok: { kind: 'local', sequence: '2' } })
  })

  it('3 emit: a block keeps the mode of its first write and takes no write after close', async () => {
    const { receiver, calls } = immediateReceiver()
    const { scope: s } = scope({ process: receiver })
    unwrap(await s.context.emit(append('log', 'one')))
    const crossed = await s.context.emit(replace('log', 'panel'))
    expect('failure' in crossed && crossed.failure.kind).toBe('invalid')
    unwrap(await s.context.emit(replace('panel', 'v1')))
    unwrap(await s.context.emit(replace('panel', 'v2', true)))
    const late = await s.context.emit(replace('panel', 'v3'))
    expect('failure' in late && late.failure.kind).toBe('invalid')
    unwrap(await s.context.emit(append('log', '', true)))
    const lateAppend = await s.context.emit(append('log', 'more'))
    expect('failure' in lateAppend && lateAppend.failure.kind).toBe('invalid')
    expect(calls.map(call => call.sequence)).toEqual(['1', '2', '3', '4'])
  })

  it('3 emit: without a receiver emit is unsupported', async () => {
    const { scope: s } = scope({ process: null })
    const outcome = await s.context.emit(append('log', 'one'))
    expect('failure' in outcome && outcome.failure.kind).toBe('unsupported')
  })
})

describe('4 buffer limits', () => {
  it('4 buffer: a single update over authorBufferBytes is too-large and takes no slot', async () => {
    const { receiver, calls } = immediateReceiver()
    const { scope: s } = scope({ process: receiver, limits: limits({ authorBufferBytes: 120 }) })
    const big = await s.context.emit(append('log', 'x'.repeat(100)))
    expect('failure' in big && big.failure.kind).toBe('too-large')
    expect(await s.context.emit(append('log', 'small'))).toEqual({
      ok: { kind: 'local', sequence: '1' },
    })
    expect(calls.map(call => call.sequence)).toEqual(['1'])
  })

  it('4 buffer: a full buffer answers capacity until an earlier output is confirmed, with no queueing', async () => {
    const { receiver, calls, release } = manualReceiver()
    const { scope: s } = scope({ process: receiver, limits: limits({ authorBufferItems: 1 }) })
    const first = s.context.emit(append('log', 'one'))
    const refused = await s.context.emit(append('log', 'two'))
    expect('failure' in refused && refused.failure.kind).toBe('capacity')
    release('1')
    expect(await first).toEqual({ ok: { kind: 'local', sequence: '1' } })
    const third = s.context.emit(append('log', 'three'))
    await settled()
    release('2')
    expect(await third).toEqual({ ok: { kind: 'local', sequence: '2' } })
    expect(calls.map(call => call.update)).toEqual([append('log', 'one'), append('log', 'three')])
  })

  it('4 buffer: pending bytes over authorBufferBytes answer capacity until confirmed', async () => {
    const { receiver, release } = manualReceiver()
    // One small update encodes to about 84 bytes; two of them do not fit in 120.
    const { scope: s } = scope({ process: receiver, limits: limits({ authorBufferBytes: 120 }) })
    const first = s.context.emit(append('log', 'one'))
    const refused = await s.context.emit(append('log', 'two'))
    expect('failure' in refused && refused.failure.kind).toBe('capacity')
    release('1')
    expect(await first).toEqual({ ok: { kind: 'local', sequence: '1' } })
    const third = s.context.emit(append('log', 'three'))
    await settled()
    release('2')
    expect(await third).toEqual({ ok: { kind: 'local', sequence: '2' } })
  })

  it('4 buffer: the open blocks together may not hold more than authorBufferBytes', async () => {
    const { receiver } = immediateReceiver()
    const { scope: s } = scope({ process: receiver, limits: limits({ authorBufferBytes: 300 }) })
    unwrap(await s.context.emit(append('a', 'a'.repeat(150))))
    unwrap(await s.context.emit(append('b', 'b'.repeat(150))))
    const over = await s.context.emit(append('b', 'c'.repeat(10)))
    expect('failure' in over && over.failure.kind).toBe('capacity')
    unwrap(await s.context.emit(append('a', '', true)))
    unwrap(await s.context.emit(append('b', 'c'.repeat(10))))
  })

  it('4 buffer: the accumulated state of an open block over the limit is too-large', async () => {
    const { receiver } = immediateReceiver()
    const { scope: s } = scope({ process: receiver, limits: limits({ authorBufferBytes: 200 }) })
    unwrap(await s.context.emit(append('log', 'a'.repeat(100))))
    unwrap(await s.context.emit(append('log', 'b'.repeat(100))))
    const over = await s.context.emit(append('log', 'c'.repeat(100)))
    expect('failure' in over && over.failure.kind).toBe('too-large')
    // Sealing the block drops its accumulated state, so a new block has room again.
    unwrap(await s.context.emit(append('log', '', true)))
    unwrap(await s.context.emit(append('next', 'd'.repeat(100))))
  })
})

describe('5 wait', () => {
  it('5 wait: forwards the fixed request after earlier outputs are received and shares the answer by key', async () => {
    const { receiver, release } = manualReceiver()
    const waiter = manualWaiter()
    const { scope: s } = scope({ process: receiver, waits: waiter.waits })
    const output = s.context.emit(append('log', 'before'))
    const request = ask('confirm')
    const pending = s.context.wait(request)
    await settled()
    expect(waiter.requests).toEqual([])
    release('1')
    await settled()
    expect(waiter.requests).toEqual([request])
    expect(waiter.requests[0]).not.toBe(request)
    expect(Object.isFrozen(waiter.requests[0])).toBe(true)
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await pending).toEqual({ ok: answer })
    expect(await output).toEqual({ ok: { kind: 'local', sequence: '1' } })
    expect(await s.context.wait(ask('confirm'))).toEqual({ ok: answer })
    expect(waiter.requests).toHaveLength(1)
  })

  it('5 wait: same key with another input is a conflict, another key while one is open is busy', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const pending = s.context.wait(ask('confirm', 'proceed?'))
    await settled()
    const conflict = await s.context.wait(ask('confirm', 'really?'))
    expect('failure' in conflict && conflict.failure.kind).toBe('conflict')
    const busy = await s.context.wait(ask('other'))
    expect('failure' in busy && busy.failure.kind).toBe('busy')
    const shared = s.context.wait(ask('confirm', 'proceed?'))
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await pending).toEqual({ ok: answer })
    expect(await shared).toEqual({ ok: answer })
    expect(waiter.requests).toHaveLength(1)
  })

  it('5 wait: the history limits refuse a new key and keep old keys answerable', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({
      waits: waiter.waits,
      limits: limits({ authorWaitHistoryItems: 1 }),
    })
    const first = s.context.wait(ask('first'))
    await settled()
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await first).toEqual({ ok: answer })
    const second = await s.context.wait(ask('second'))
    expect('failure' in second && second.failure.kind).toBe('capacity')
    expect(await s.context.wait(ask('first'))).toEqual({ ok: answer })
    const tight = scope({ waits: waiter.waits, limits: limits({ authorWaitHistoryBytes: 100 }) })
    const large = await tight.scope.context.wait(ask('big', 'q', askContract(1_000)))
    expect('failure' in large && large.failure.kind).toBe('too-large')
    expect(waiter.requests).toHaveLength(1)
  })

  it('5 wait: the history byte limit refuses a new key once reservations fill it', async () => {
    const waiter = manualWaiter()
    // askContract(1_024) reserves 2_048 bytes plus the key; two records do not fit in 2_100.
    const { scope: s } = scope({
      waits: waiter.waits,
      limits: limits({ authorWaitHistoryBytes: 2_100 }),
    })
    const first = s.context.wait(ask('first'))
    await settled()
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await first).toEqual({ ok: answer })
    const second = await s.context.wait(ask('second'))
    expect('failure' in second && second.failure.kind).toBe('capacity')
    expect(await s.context.wait(ask('first'))).toEqual({ ok: answer })
    expect(waiter.requests).toHaveLength(1)
  })

  it('5 wait: a request that is not a legal JSON tree within the protocol limit is invalid', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const duplicate = {
      kind: 'object',
      entries: [
        { key: 'q', value: { kind: 'null' } },
        { key: 'q', value: { kind: 'null' } },
      ],
    }
    const unknownKind = { kind: 'date', value: '2026-10-16' }
    const cyclic: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
    cyclic.items.push(cyclic)
    const badNumber = { kind: 'number', lexeme: '0x10' }
    const requests = { duplicate, unknownKind, cyclic, badNumber, text: 'text' }
    for (const [name, request] of Object.entries(requests)) {
      const outcome = await s.context.wait({ ...ask('confirm'), request } as never)
      expect('failure' in outcome && outcome.failure.kind, name).toBe('invalid')
    }
    // A cycle is rejected as a cycle, not by growing the text up to a large byte budget.
    const wide = { ...ask('confirm', 'x', askContract(4_000_000)), request: cyclic }
    const cycle = await s.context.wait(wide as never)
    expect('failure' in cycle && cycle.failure).toEqual({
      kind: 'invalid',
      reason: expect.stringMatching(/cycle/) as string,
    })
    const large = await s.context.wait(ask('confirm', 'x'.repeat(100), askContract(64)))
    expect('failure' in large && large.failure.kind).toBe('invalid')
    expect(waiter.requests).toEqual([])
    const fits = s.context.wait(ask('confirm', 'x'.repeat(20), askContract(64)))
    await settled()
    expect(waiter.requests).toHaveLength(1)
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await fits).toEqual({ ok: answer })
  })

  // Slow: the walk must visit a million nodes before the budget fires (about one second of CPU).
  it(
    '5 wait: a request that reaches more than a million nodes is rejected by the node budget',
    { tags: ['slow'] },
    async () => {
      // The history could hold the record and the provider would answer at once: only the node
      // budget keeps the request from the provider.
      let forwarded = 0
      const { scope: s } = scope({
        waits: {
          wait: async () => {
            forwarded += 1
            return succeed({ kind: 'declined' })
          },
        } as never,
        limits: limits({ authorWaitHistoryBytes: 300_000_000 }),
      })
      // One array of 1001 nulls shared by 1001 parents: 1,003,003 visits, about 5 MB of text.
      const row = { kind: 'array', items: Array.from({ length: 1_001 }, () => ({ kind: 'null' })) }
      const shared = { kind: 'array', items: Array.from({ length: 1_001 }, () => row) }
      const request = { ...ask('confirm', 'x', askContract(100_000_000)), request: shared }
      const outcome = await s.context.wait(request as never)
      expect('failure' in outcome && outcome.failure).toEqual({
        kind: 'invalid',
        reason: expect.stringMatching(/nodes/) as string,
      })
      expect(forwarded).toBe(0)
    },
  )

  it('5 wait: a wait position kept after an output fault stays the active wait', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({
      process: { receive: async () => failing('capacity', 'receiver full') },
      waits: waiter.waits,
    })
    expect(await s.context.emit(append('log', 'one'))).toEqual({
      failure: { kind: 'capacity', reason: 'receiver full' },
    })
    const fault = { kind: 'unavailable', operation: 'emit:1', reason: 'capacity: receiver full' }
    expect(await s.context.wait(ask('confirm'))).toEqual({ failure: fault })
    // One unfinished logical wait per execution (P11): another key is busy, the same key retries.
    const other = await s.context.wait(ask('other'))
    expect('failure' in other && other.failure.kind).toBe('busy')
    expect(await s.context.wait(ask('confirm'))).toEqual({ failure: fault })
    expect(waiter.requests).toEqual([])
    // The position is still open, so a normal return is the author's protocol error.
    const closed = await s.finish('returned')
    expect('failure' in closed && closed.failure.kind).toBe('invalid')
  })

  it('5 wait: the history reservation counts the key bytes', async () => {
    const waiter = manualWaiter()
    // askContract(100) reserves 200 bytes; the one-byte key decides whether the record fits.
    const tight = scope({ waits: waiter.waits, limits: limits({ authorWaitHistoryBytes: 200 }) })
    const refused = await tight.scope.context.wait(ask('k', 'proceed?', askContract(100)))
    expect('failure' in refused && refused.failure.kind).toBe('too-large')
    const exact = scope({ waits: waiter.waits, limits: limits({ authorWaitHistoryBytes: 201 }) })
    const pending = exact.scope.context.wait(ask('k', 'proceed?', askContract(100)))
    await settled()
    expect(waiter.requests).toHaveLength(1)
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await pending).toEqual({ ok: answer })
  })

  it('5 wait: a reply whose value exceeds the response limit is unavailable and never reaches the author', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    // askContract(32) bounds the response value at 32 bytes of JSON text.
    const request = ask('confirm', 'proceed?', askContract(32))
    const pending = s.context.wait(request)
    await settled()
    waiter.answers[0]?.resolve(succeed({ kind: 'answer', value: 'y'.repeat(40) }))
    const oversized = {
      kind: 'unavailable',
      operation: 'wait:confirm',
      reason: 'the response needs 42 of 32 bytes',
    }
    expect(await pending).toEqual({ failure: oversized })
    expect(await s.context.wait(request)).toEqual({ failure: oversized })
    expect(waiter.requests).toHaveLength(1)
    // A reply without a value, and a value within the limit, are handed over.
    const declined = s.context.wait(ask('second', 'proceed?', askContract(32)))
    await settled()
    waiter.answers[1]?.resolve(succeed({ kind: 'declined' }))
    expect(await declined).toEqual({ ok: { kind: 'declined' } })
    const fits = s.context.wait(ask('third', 'proceed?', askContract(32)))
    await settled()
    waiter.answers[2]?.resolve(succeed({ kind: 'answer', value: 'y'.repeat(30) }))
    expect(await fits).toEqual({ ok: { kind: 'answer', value: 'y'.repeat(30) } })
  })

  it('5 wait: without a provider wait is unsupported', async () => {
    const { scope: s } = scope({ waits: null })
    const outcome = await s.context.wait(ask('confirm'))
    expect('failure' in outcome && outcome.failure.kind).toBe('unsupported')
  })

  it('5 wait: an Ask with a deadline and a resource deadline without expiry support are invalid', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const withDeadline = { ...ask('confirm'), deadline: null }
    const invalidAsk = await s.context.wait(withDeadline as never)
    expect('failure' in invalidAsk && invalidAsk.failure.kind).toBe('invalid')
    const forbidden = await s.context.wait(
      resourceWait('file', '2026-10-16T00:00:00Z', resourceContract('forbidden')),
    )
    expect('failure' in forbidden && forbidden.failure.kind).toBe('invalid')
    const badTime = await s.context.wait(resourceWait('file', 'tomorrow'))
    expect('failure' in badTime && badTime.failure.kind).toBe('invalid')
    const mismatched = { ...ask('confirm'), contract: resourceContract('forbidden') }
    const crossed = await s.context.wait(mismatched as never)
    expect('failure' in crossed && crossed.failure.kind).toBe('invalid')
    expect(waiter.requests).toEqual([])
    const pending = s.context.wait(resourceWait('file', '2026-10-16T00:00:00Z'))
    await settled()
    expect(waiter.requests).toHaveLength(1)
    waiter.answers[0]?.resolve(succeed({ kind: 'expired' }))
    expect(await pending).toEqual({ ok: { kind: 'expired' } })
  })
})

describe('6 cancellation', () => {
  it('6 cancel: an abort before the answer returns cancelled and closes new primitives', async () => {
    const waiter = manualWaiter()
    const { scope: s, controller } = scope({ waits: waiter.waits })
    const pending = s.context.wait(ask('confirm'))
    await settled()
    controller.abort()
    const outcome = await pending
    expect('failure' in outcome && outcome.failure.kind).toBe('cancelled')
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await s.context.wait(ask('confirm'))).toEqual(outcome)
    const emitted = await s.context.emit(append('log', 'late'))
    expect('failure' in emitted && emitted.failure.kind).toBe('cancelled')
    const opened = await s.context.wait(ask('other'))
    expect('failure' in opened && opened.failure.kind).toBe('cancelled')
  })

  it('6 cancel: an answer handed over before the abort is not revoked', async () => {
    const waiter = manualWaiter()
    const { scope: s, controller } = scope({ waits: waiter.waits })
    const pending = s.context.wait(ask('confirm'))
    await settled()
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await pending).toEqual({ ok: answer })
    controller.abort()
    expect(await pending).toEqual({ ok: answer })
    const closed = await s.finish('returned')
    expect('failure' in closed && closed.failure.kind).toBe('cancelled')
  })

  it('6 cancel: an abort confirmed before the hand-over makes the wait cancelled, after it the answer stays', async () => {
    const seen = { cancelled: 0, answered: 0 }
    for (let k = 0; k <= 8; k += 1) {
      const controller = new AbortController()
      const waiter = manualWaiter()
      const holder: { scope: ToolExecutionScope | null; probe: Promise<unknown> | null } = {
        scope: null,
        probe: null,
      }
      // Registered before the scope's own listener, so it runs before the scope learns of the
      // abort. An in-flight same-key re-entry returns the very promise the author holds; a
      // handed-over one returns a new promise. That tells hand-over from not-yet without any lag.
      controller.signal.addEventListener('abort', () => {
        holder.probe = holder.scope?.context.wait(ask('confirm')) ?? null
      })
      const s = unwrap(
        createIndependentToolScope(input({ signal: controller.signal, waits: waiter.waits })),
      )
      holder.scope = s
      const pending = s.context.wait(ask('confirm'))
      await settled()
      waiter.answers[0]?.resolve(succeed(answer))
      for (let tick = 0; tick < k; tick += 1) await Promise.resolve()
      controller.abort()
      const outcome = await pending
      if (holder.probe === pending) {
        seen.cancelled += 1
        expect('failure' in outcome && outcome.failure.kind, `k=${k}`).toBe('cancelled')
      } else {
        seen.answered += 1
        expect(outcome, `k=${k}`).toEqual({ ok: answer })
        expect(await holder.probe, `k=${k}`).toEqual({ ok: answer })
      }
      expect(await pending, `k=${k}`).toEqual(outcome)
    }
    expect(seen.cancelled).toBeGreaterThan(0)
    expect(seen.answered).toBeGreaterThan(0)
  })
})

describe('7 finish', () => {
  it('7 finish: a returned finish that finds the wait active ends it closed, even with the answer in flight', async () => {
    const seen = { closed: 0, answered: 0 }
    for (let k = 0; k <= 8; k += 1) {
      const waiter = manualWaiter()
      const { scope: s } = scope({ waits: waiter.waits })
      const pending = s.context.wait(ask('confirm'))
      await settled()
      waiter.answers[0]?.resolve(succeed(answer))
      for (let tick = 0; tick < k; tick += 1) await Promise.resolve()
      const closing = await s.finish('returned')
      const outcome = await pending
      if ('failure' in closing) {
        seen.closed += 1
        expect(closing.failure.kind, `k=${k}`).toBe('invalid')
        expect('failure' in outcome && outcome.failure.kind, `k=${k}`).toBe('closed')
      } else {
        seen.answered += 1
        expect(outcome, `k=${k}`).toEqual({ ok: answer })
      }
    }
    expect(seen.closed).toBeGreaterThan(0)
    expect(seen.answered).toBeGreaterThan(0)
  })

  it('7 finish: returned followed by a synchronous abort is cancelled, not a success', async () => {
    const { scope: s, controller } = scope()
    const closing = s.finish('returned')
    controller.abort()
    const outcome = await closing
    expect('failure' in outcome && outcome.failure.kind).toBe('cancelled')
  })

  it('7 finish: returned right after an abort with an open wait is cancelled, not invalid', async () => {
    const waiter = manualWaiter()
    const { scope: s, controller } = scope({ waits: waiter.waits })
    const pending = s.context.wait(ask('confirm'))
    await settled()
    controller.abort()
    const closed = await s.finish('returned')
    expect('failure' in closed && closed.failure.kind).toBe('cancelled')
    const outcome = await pending
    expect('failure' in outcome && outcome.failure.kind).toBe('cancelled')
  })

  it('7 finish: closes new acceptance at once and joins existing output', async () => {
    const { receiver, release } = manualReceiver()
    const { scope: s } = scope({ process: receiver })
    const output = s.context.emit(append('log', 'one'))
    let settledAt: string | null = null
    const closing = s.finish('returned').then(outcome => {
      settledAt = 'after'
      return outcome
    })
    const late = await s.context.emit(append('log', 'two'))
    expect('failure' in late && late.failure.kind).toBe('closed')
    await settled()
    expect(settledAt).toBeNull()
    release('1')
    expect(await closing).toEqual({ ok: undefined })
    expect(await output).toEqual({ ok: { kind: 'local', sequence: '1' } })
  })

  it('7 finish: the same exit is answered once, another exit is refused', async () => {
    const { scope: s } = scope()
    const first = s.finish('returned')
    expect(s.finish('returned')).toBe(first)
    expect(await first).toEqual({ ok: undefined })
    const other = await s.finish('failed')
    expect('failure' in other && other.failure.kind).toBe('conflict')
  })

  it('7 finish: returned with an open wait fails and closes the wait', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const pending = s.context.wait(ask('confirm'))
    await settled()
    const closed = await s.finish('returned')
    expect('failure' in closed && closed.failure.kind).toBe('invalid')
    const outcome = await pending
    expect('failure' in outcome && outcome.failure.kind).toBe('closed')
  })

  it('7 finish: failed does not wait on stuck output', async () => {
    const { receiver } = manualReceiver()
    const { scope: s } = scope({ process: receiver })
    void s.context.emit(append('log', 'stuck'))
    expect(await s.finish('failed')).toEqual({ ok: undefined })
  })

  it('7 finish: cancellation outranks returned, even while output is stuck', async () => {
    const { receiver } = manualReceiver()
    const { scope: s, controller } = scope({ process: receiver })
    void s.context.emit(append('log', 'stuck'))
    const closing = s.finish('returned')
    await settled()
    controller.abort()
    const outcome = await closing
    expect('failure' in outcome && outcome.failure.kind).toBe('cancelled')
    const early = scope()
    early.controller.abort()
    const refused = await early.scope.finish('returned')
    expect('failure' in refused && refused.failure.kind).toBe('cancelled')
  })
})

describe('9 named failures are values', () => {
  it('9 failures: a receiver that throws becomes an unknown failure that breaks the barrier', async () => {
    const { scope: s } = scope({
      process: {
        receive: () => Promise.reject(new Error('disk gone')),
      },
    })
    expect(await s.context.emit(append('log', 'one'))).toEqual({
      failure: { kind: 'unknown', operation: 'emit:1', reason: 'Error: disk gone' },
    })
    const closed = await s.finish('returned')
    expect(closed).toEqual({
      failure: { kind: 'unknown', operation: 'emit:1', reason: 'Error: disk gone' },
    })
  })

  it('9 failures: a receiver failure is returned as a value and a provider throw becomes unknown', async () => {
    const { receiver, release } = manualReceiver()
    const { scope: s } = scope({
      process: receiver,
      waits: { wait: () => Promise.reject(new Error('bridge down')) } as never,
    })
    const output = s.context.emit(append('log', 'one'))
    await settled()
    release('1', failing('capacity', 'receiver full'))
    expect(await output).toEqual({ failure: { kind: 'capacity', reason: 'receiver full' } })
    expect(await s.context.wait(ask('confirm'))).toEqual({
      failure: { kind: 'unavailable', operation: 'emit:1', reason: 'capacity: receiver full' },
    })
  })

  it('9 failures: a receiver or provider that returns a value that is not an Outcome is unknown, not success', async () => {
    const notOutcome = 'the provider returned a value that is not an Outcome'
    const bare = scope({ process: { receive: async () => undefined } as never })
    expect(await bare.scope.context.emit(append('log', 'one'))).toEqual({
      failure: { kind: 'unknown', operation: 'emit:1', reason: notOutcome },
    })
    const unwrapped = scope({
      waits: { wait: async () => ({ kind: 'answer', value: 'yes' }) } as never,
    })
    expect(await unwrapped.scope.context.wait(ask('confirm'))).toEqual({
      failure: { kind: 'unknown', operation: 'wait:confirm', reason: notOutcome },
    })
  })

  it('9 failures: the barrier reports the first fault when later outputs also fail', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({
      process: { receive: async ({ sequence }) => failing('capacity', `full at ${sequence}`) },
      waits: waiter.waits,
    })
    expect(await s.context.emit(append('log', 'one'))).toEqual({
      failure: { kind: 'capacity', reason: 'full at 1' },
    })
    expect(await s.context.emit(append('log', 'two'))).toEqual({
      failure: { kind: 'capacity', reason: 'full at 2' },
    })
    expect(await s.context.wait(ask('confirm'))).toEqual({
      failure: { kind: 'unavailable', operation: 'emit:1', reason: 'capacity: full at 1' },
    })
  })

  it('9 failures: a provider that throws becomes an unknown failure value', async () => {
    const { scope: s } = scope({
      waits: { wait: () => Promise.reject(new Error('bridge down')) } as never,
    })
    expect(await s.context.wait(ask('confirm'))).toEqual({
      failure: { kind: 'unknown', operation: 'wait:confirm', reason: 'Error: bridge down' },
    })
  })
})
