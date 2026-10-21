import { expect, it } from 'vitest'
import { runtimeFixture, eventually } from './runtime-fixture.ts'
import { op, unbox } from './memory-fixture.ts'
import type { ModelCommands, ModelOperationId, TransportFact } from '@omne-harness/model-contract'

const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const delta = (text: string): TransportFact => ({ kind: 'block-delta', index: '0', delta: text })
const end: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }
async function observer(f: ReturnType<typeof runtimeFixture>) {
  const route = unbox(
    await f.provider.runtime.instances.connect({
      principal: f.principal,
      tenant: f.tenant,
      reference: f.reference,
    }),
  )
  if (route.kind !== 'live') throw new Error('missing live route')
  return route.handle
    .observe({ ...f.admit, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
}
async function snapshot(f: ReturnType<typeof runtimeFixture>) {
  const watch = await observer(f)
  try {
    const value = await watch.next()
    if (value.done || value.value.kind !== 'snapshot') throw new Error('missing snapshot')
    return value.value.value
  } finally {
    await watch.return?.()
  }
}
for (const effect of ['applied', 'not-applied'] as const) {
  it(`keeps the original ${effect} unknown preserve invisible and replays the complete original batch`, async () => {
    let original: Parameters<ModelCommands<unknown>['preserve']>[0] | undefined
    const f = runtimeFixture({}, commands => ({
      ...commands,
      async preserve(input) {
        if (!original) {
          original = input
          f.controls.commands.injectUnknown({ ...input, method: 'preserve', effect })
        }
        return commands.preserve(input)
      },
    }))
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([open, delta('later')])
      await eventually(() => f.results.has(f.admit.call))
      expect(f.results.get(f.admit.call)).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(f.channel(f.admit.call).reads).toBe(1)
      expect((await snapshot(f)).cursor).toBe('0')
      unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel-unknown') }))
      expect((await snapshot(f)).state.control.kind).toBe('none')
      expect(await f.drive()).toMatchObject({ failure: { kind: 'commit-unknown' } })
      expect(f.preserveInputs).toHaveLength(1)
      if (!original) throw new Error('no original preserve')
      f.controls.commands.reveal({
        ...f.admit,
        operation: original.operation,
        result: effect === 'applied' ? 'committed' : 'not-committed',
      })
      const replay = f.drive()
      if (effect === 'not-applied') {
        // The intervening cancel changed expected. It must fail explicitly, never mutate the original write.
        expect(await replay).toMatchObject({ failure: { kind: 'conflict' } })
        expect((await snapshot(f)).cursor).toBe('0')
        expect((await snapshot(f)).state.control.kind).toBe('requested')
      } else {
        await eventually(() => f.preserveInputs.length >= 3)
        expect((await snapshot(f)).state.control.kind).toBe('requested')
        f.channel(f.admit.call).push([end])
        unbox(await replay)
      }
      expect(f.preserveInputs[1]).toEqual(original)
      expect(f.channel(f.admit.call).starts).toBe(1)
    } finally {
      await f.dispose()
    }
  })
}
it('returns sender-private unknown operations to the original sender, retaining its window and unique stream', async () => {
  let pending: ModelOperationId | undefined
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async recordSend(input) {
      if (!pending) {
        pending = input.operation
        f.controls.commands.injectUnknown({ ...input, method: 'recordSend', effect: 'applied' })
      }
      return commands.recordSend(input)
    },
  }))
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    await eventually(() => f.results.has(f.admit.call))
    expect(f.channel(f.admit.call).reads).toBe(0)
    if (!pending) throw new Error('no original sender operation')
    f.controls.commands.reveal({ ...f.admit, operation: pending, result: 'committed' })
    f.channel(f.admit.call).push([open, delta('once'), end])
    unbox(await f.drive())
    expect(f.channel(f.admit.call).starts).toBe(1)
    expect(f.preserveInputs[0]?.window).toBe(f.openInputs[0]?.window)
    expect((await snapshot(f)).blocks).toMatchObject([{ value: 'once' }])
  } finally {
    await f.dispose()
  }
})
it('aggregates with a positive delay and keeps a silent in-flight read in the original window after the timer', async () => {
  const f = runtimeFixture({ outputBatchDelayMs: 10, outputBatchBytes: 10000 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([open, delta('a')])
    await eventually(() => f.channel(f.admit.call).reads === 3)
    f.controls.clock.advanceTo('2026-10-19T00:00:00.010Z')
    for (let i = 0; i < 100; i++) await Promise.resolve()
    expect(f.preserveInputs).toHaveLength(0)
    expect((await snapshot(f)).cursor).toBe('0')
    f.channel(f.admit.call).push([delta('b')])
    await eventually(() => f.preserveInputs.length === 1)
    expect(f.preserveInputs[0]?.facts).toEqual([open, delta('a'), delta('b')])
    expect(f.preserveInputs[0]?.window).toBe(f.openInputs[0]?.window)
    await eventually(() => f.channel(f.admit.call).reads === 4)
    expect((await snapshot(f)).blocks).toMatchObject([{ value: 'ab' }])
    f.channel(f.admit.call).push([end])
  } finally {
    await f.dispose()
  }
  expect(f.controls.clock.pending()).toBe(0)
})
it('makes the byte threshold change positive-delay batch boundaries and saves terminal batches immediately', async () => {
  const f = runtimeFixture({ outputBatchDelayMs: 100, outputBatchBytes: 1 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    await f.show(f.admit.call, [open, delta('a'), end])
    expect(f.preserveInputs.map(input => input.facts.length)).toEqual([1, 1, 1])
    expect(new Set(f.preserveInputs.map(input => input.window)).size).toBe(3)
    expect(f.channel(f.admit.call).starts).toBe(1)
    expect(f.channel(f.admit.call).closes).toBe(1)
  } finally {
    await f.dispose()
  }
})
for (const outputBatchBytes of [66, 67]) {
  it(`flushes the 66-byte opening fact at the exact ${outputBatchBytes}-byte batch boundary`, async () => {
    expect(Buffer.byteLength(JSON.stringify(open), 'utf8')).toBe(66)
    const f = runtimeFixture({ outputBatchDelayMs: 100, outputBatchBytes })
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      await f.start(f.admit.call)
      await f.show(f.admit.call, [open, delta('a'), end])
      expect(f.preserveInputs.map(input => input.facts)).toEqual(
        outputBatchBytes === 66 ? [[open], [delta('a'), end]] : [[open, delta('a')], [end]],
      )
      expect(new Set(f.preserveInputs.map(input => input.window)).size).toBe(2)
      expect((await snapshot(f)).blocks).toMatchObject([{ value: 'a' }])
      expect(f.channel(f.admit.call).starts).toBe(1)
      expect(f.channel(f.admit.call).closes).toBe(1)
      expect(f.channel(f.admit.call).returns).toBe(1)
    } finally {
      await f.dispose()
    }
    expect(f.controls.clock.pending()).toBe(0)
  })
}
it('keeps first content when replacement empties the final view in the same positive-delay batch', async () => {
  const f = runtimeFixture({ outputBatchDelayMs: 100, outputBatchBytes: 10000 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      { kind: 'block-open', index: '0', mode: 'replace', content: 'text' },
      { kind: 'block-replace', index: '0', value: 'seen' },
      { kind: 'block-replace', index: '0', value: '' },
      end,
    ])
    await eventually(() => f.results.has(f.admit.call))
    expect(f.preserveInputs).toHaveLength(1)
    const view = await snapshot(f)
    expect(view.blocks).toMatchObject([{ value: '' }])
    expect(view.state).toMatchObject({ firstContent: 'observed' })
  } finally {
    await f.dispose()
  }
})
it('has no snapshot-to-change gap when a save completes before the first next or while the next is waiting', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    const before = await observer(f)
    await f.start(f.admit.call)
    await f.show(f.admit.call, [open, delta('a')])
    expect(await before.next()).toMatchObject({
      value: { kind: 'snapshot', value: { blocks: [{ value: 'a' }] } },
    })
    const after = before.next()
    await f.show(f.admit.call, [delta('b')])
    expect(await after).toMatchObject({
      value: { kind: 'changed', value: { blocks: [{ value: 'ab' }] } },
    })
    await before.return?.()
  } finally {
    await f.dispose()
  }
})
it('bounds registrations and unseen notifications while a healthy observer and the original call continue', async () => {
  const f = runtimeFixture({ observerBufferBytes: 64 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    const slow = await observer(f)
    await slow.next()
    const extra = await observer(f)
    expect(await extra.next()).toMatchObject({ value: { kind: 'ended', reason: 'unavailable' } })
    await f.show(f.admit.call, [open, delta('a'), delta('b')])
    expect(await slow.next()).toMatchObject({ value: { kind: 'ended', reason: 'unavailable' } })
    const healthy = await observer(f)
    const initial = await healthy.next()
    expect(initial).toMatchObject({
      value: { kind: 'snapshot', value: { blocks: [{ value: 'ab' }] } },
    })
    expect(Buffer.byteLength(JSON.stringify(initial))).toBeGreaterThan(64)
    const changed = healthy.next()
    await f.show(f.admit.call, [delta('c')])
    expect(await changed).toMatchObject({
      value: { kind: 'changed', value: { blocks: [{ value: 'abc' }] } },
    })
    await healthy.return?.()
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
  }
})
it('refuses concurrent pending next without allocating a queue and wakes the original pending next', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    const watch = await observer(f)
    await watch.next()
    const first = watch.next()
    await eventually(() => f.controls.clock.pending() > 0)
    const concurrent = await watch.next()
    expect(concurrent).toMatchObject({ value: { kind: 'ended', reason: 'unavailable' } })
    expect(await first).toMatchObject({ done: true })
    expect(f.controls.clock.pending()).toBe(0)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
  }
})
it('distinguishes an insufficient registration budget from the shared initial snapshot size', async () => {
  const f = runtimeFixture({ observerBufferBytes: 1 })
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    expect(await (await observer(f)).next()).toMatchObject({
      value: { kind: 'ended', reason: 'unavailable' },
    })
  } finally {
    await f.dispose()
  }
})
for (const method of ['preserve', 'openReceiveWindow'] as const) {
  for (const effect of ['applied', 'not-applied'] as const) {
    it(`replays ${effect} unknown ${method} without reading beyond its original batch`, async () => {
      let original: Parameters<ModelCommands<unknown>[typeof method]>[0] | undefined
      let queryFail = false
      const f = runtimeFixture({}, commands => {
        const overrides = {
          ...commands,
          async query(input: Parameters<typeof commands.query>[0]) {
            if (queryFail) return { failure: { kind: 'denied' as const, action: 'facts' } }
            return commands.query(input)
          },
        }
        if (method === 'preserve')
          overrides.preserve = async input => {
            if (!original) {
              original = input
              f.controls.commands.injectUnknown({ ...input, method, effect })
            }
            return commands.preserve(input)
          }
        else
          overrides.openReceiveWindow = async input => {
            // The first open belongs to sender; the second is receiver's successor window.
            if (!original && f.openInputs.length === 2) {
              original = input
              f.controls.commands.injectUnknown({ ...input, method, effect })
            }
            return commands.openReceiveWindow(input)
          }
        return overrides
      })
      try {
        unbox(await f.provider.runtime.calls.admit(f.admit))
        await f.start(f.admit.call)
        f.channel(f.admit.call).push([open, delta('after'), end])
        await eventually(() => f.results.has(f.admit.call))
        const reads = f.channel(f.admit.call).reads
        expect(reads).toBe(1)
        expect(original).toBeDefined()
        queryFail = true
        expect(await f.drive()).toMatchObject({ failure: { kind: 'denied' } })
        expect(f.channel(f.admit.call).closes).toBe(0)
        expect(f.channel(f.admit.call).reads).toBe(reads)
        queryFail = false
        if (!original) throw new Error('no original write')
        f.controls.commands.reveal({
          ...f.admit,
          operation: original.operation,
          result: effect === 'applied' ? 'committed' : 'not-committed',
        })
        unbox(await f.drive())
        const writes = method === 'preserve' ? f.preserveInputs : f.openInputs
        const originalOperation = original.operation
        const replay = writes.filter(input => input.operation === originalOperation)
        expect(replay).toHaveLength(2)
        expect(replay[1]).toEqual(replay[0])
        expect(replay[1]).toBe(replay[0])
        expect((await snapshot(f)).blocks).toMatchObject([{ value: 'after' }])
        expect(f.channel(f.admit.call).starts).toBe(1)
        expect(f.channel(f.admit.call).closes).toBe(1)
      } finally {
        await f.dispose()
      }
    })
  }
}
for (const mode of ['eof', 'exception'] as const) {
  it(`preserves the complete received prefix before reporting ${mode} and closes the original resources`, async () => {
    const f = runtimeFixture({ outputBatchDelayMs: 10, outputBatchBytes: 10000 })
    try {
      unbox(await f.provider.runtime.calls.admit(f.admit))
      await f.start(f.admit.call)
      f.channel(f.admit.call).push([open, delta('prefix')])
      await eventually(() => f.channel(f.admit.call).reads === 3)
      if (mode === 'eof') f.channel(f.admit.call).finish()
      else f.channel(f.admit.call).fail()
      await eventually(() => f.results.has(f.admit.call))
      expect(f.results.get(f.admit.call)).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: 'fact-stream-failed' },
      })
      expect(f.preserveInputs[0]?.facts).toMatchObject([
        open,
        delta('prefix'),
        { kind: 'ended', termination: { kind: 'failed', fault: { cause: 'stream-lost' } } },
      ])
      expect((await snapshot(f)).blocks).toMatchObject([{ value: 'prefix' }])
      expect(f.channel(f.admit.call).closes).toBe(1)
      expect(f.controls.clock.pending()).toBe(0)
    } finally {
      await f.dispose()
    }
  })
}

it('keeps resource release failure visible after the terminal batch was confirmed', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).releaseFails = true
    f.channel(f.admit.call).push([open, delta('saved'), end])
    await eventually(() => f.results.has(f.admit.call))
    expect(f.results.get(f.admit.call)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'resource-release-failed' },
    })
    expect((await snapshot(f)).blocks).toMatchObject([{ value: 'saved' }])
    expect(await f.drive()).toMatchObject({ failure: { diagnostic: 'resource-release-failed' } })
    expect(f.channel(f.admit.call).starts).toBe(1)
    expect(f.channel(f.admit.call).closes).toBe(1)
  } finally {
    await f.dispose()
  }
})

it('returns committed cancellation while the authoritative projection read is pending or fails', async () => {
  let block = false
  let entered = false
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const f = runtimeFixture({}, commands => ({
    ...commands,
    async loadRecovery(input) {
      if (block) {
        entered = true
        await gate
        throw new Error('synthetic-projection-read-failed')
      }
      return commands.loadRecovery(input)
    },
  }))
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    block = true
    let completed = false
    const cancelling = f.provider.runtime.calls
      .cancel({ ...f.admit, operation: op('cancel-read-blocked') })
      .then(result => {
        completed = true
        return result
      })
    await eventually(() => entered && completed)
    expect(unbox(await cancelling)).toMatchObject({ kind: 'requested' })
    release()
    for (let i = 0; i < 100; i++) await Promise.resolve()
    block = false
    expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).state.control.kind).toBe(
      'requested',
    )
  } finally {
    block = false
    release()
    await f.dispose()
  }
})
