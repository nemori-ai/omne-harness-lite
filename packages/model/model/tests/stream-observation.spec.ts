import { expect, it, vi } from 'vitest'
import { unbox } from './memory-fixture.ts'
import { streamFixture } from './stream-source.spec.ts'
import { measureStreamValue } from '../src/stream-bounds.ts'

async function observing(overrides = {}) {
  const f = streamFixture(overrides)
  f.confirm(f.facts())
  f.host.attach(f.publication)
  const target = unbox(await f.current()).current
  if (!target) throw new Error('missing stream')
  const abort = new AbortController()
  const iterator = f.host.observation
    .observe({ ref: target.ref, access: f.access, signal: abort.signal })
    [Symbol.asyncIterator]()
  return { f, iterator, abort }
}

it('delivers atomic snapshot followed by exact state-only FIFO deltas with shared frozen blocks', async () => {
  const { f, iterator } = await observing()
  const first = (await iterator.next()).value
  f.confirm(f.facts('2'))
  f.confirm(f.facts('3'))
  const second = (await iterator.next()).value
  const third = (await iterator.next()).value
  expect(first.kind).toBe('snapshot')
  expect(second.kind).toBe('delta')
  expect(second.from).toBe(first.cursor)
  expect(third.from).toBe(second.cursor)
  expect(second.value.blocks).toEqual([])
  expect(third.value.state.revision).toBe('3')
  await iterator.return?.()
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('rechecks held gaps before disclosure and prefers revoked access to overflow', async () => {
  const { f, iterator } = await observing({ maxQueuedFrames: 1 })
  await iterator.next()
  f.confirm(f.facts('2'))
  f.confirm(f.facts('3'))
  f.denied.add('observe')
  expect(await iterator.next()).toEqual({ done: false, value: { kind: 'ended', reason: 'denied' } })
  expect((await iterator.next()).done).toBe(true)
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('does not disclose a queued delta after observe authority is revoked', async () => {
  const { f, iterator } = await observing()
  await iterator.next()
  f.confirm(f.facts('2'))
  f.denied.add('observe')
  expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'denied' })
  expect((await iterator.next()).done).toBe(true)
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('expires at the exact residence deadline and keeps the last delivered cursor', async () => {
  const { f, iterator } = await observing()
  const first = (await iterator.next()).value
  f.confirm(f.facts('2'))
  f.advance(100)
  expect(await iterator.next()).toEqual({
    done: false,
    value: { kind: 'gap', after: first.cursor, reason: 'buffer' },
  })
  f.source.close()
})

it('concurrent next terminates the first pending request and return detaches immediately', async () => {
  const { f, iterator } = await observing()
  await iterator.next()
  const first = iterator.next()
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
  expect(await first).toEqual({ done: false, value: { kind: 'ended', reason: 'capacity' } })
  await iterator.return?.()
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('an idle subscriber is rechecked by the monotonic timer and abort never affects other observers', async () => {
  const { f, iterator, abort } = await observing()
  await iterator.next()
  const pending = iterator.next()
  abort.abort()
  expect(await pending).toEqual({
    done: false,
    value: { kind: 'ended', reason: 'observer-closed' },
  })
  expect(f.waits.size).toBe(0)
  const target = unbox(await f.current()).current
  if (!target) throw new Error('target')
  const next = f.host.observation
    .observe({ ref: target.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  await next.next()
  const waiting = next.next()
  f.denied.add('observe')
  f.advance(10)
  expect(await waiting).toEqual({ done: false, value: { kind: 'ended', reason: 'denied' } })
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('host withdrawal overrides a held gap and closing the source emits a terminal frame', async () => {
  const { f, iterator } = await observing({ maxQueuedFrames: 1 })
  await iterator.next()
  f.confirm(f.facts('2'))
  f.confirm(f.facts('3'))
  f.host.retire(f.publication)
  expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'stale-stream' })
  f.host.attach(f.publication)
  const target = unbox(await f.current()).current
  if (!target) throw new Error('target')
  const next = f.host.observation
    .observe({ ref: target.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  await next.next()
  const pending = next.next()
  f.source.close()
  expect((await pending).value).toEqual({ kind: 'ended', reason: 'source-closed' })
  expect(f.waits.size).toBe(0)
})

it('enforces per-tenant observer admission without evicting the existing iterator', async () => {
  const { f, iterator } = await observing({ maxObserversPerTenant: 1 })
  await iterator.next()
  const target = unbox(await f.current()).current
  if (!target) throw new Error('target')
  const next = f.host.observation
    .observe({ ref: target.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  expect((await next.next()).value).toEqual({ kind: 'ended', reason: 'capacity' })
  f.confirm(f.facts('2'))
  expect((await iterator.next()).value.kind).toBe('delta')
  await iterator.return?.()
  f.source.close()
})

it('accepts exact snapshot and queue byte bounds and turns a delta byte overflow into a gap', async () => {
  const sample = await observing()
  const frame = (await sample.iterator.next()).value
  const measure = measureStreamValue(frame, 1000000)
  if (!measure) throw new Error('frame size')
  await sample.iterator.return?.()
  sample.f.source.close()
  const { f, iterator } = await observing({
    maxSnapshotBytes: measure.bytes,
    maxQueuedBytes: measure.bytes,
    maxDeltaBytes: 1,
  })
  const first = (await iterator.next()).value
  expect(first.kind).toBe('snapshot')
  f.confirm(f.facts('2'))
  expect((await iterator.next()).value).toEqual({
    kind: 'gap',
    after: first.cursor,
    reason: 'buffer',
  })
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it.each(['host', 'source'] as const)(
  'closing %s detaches an opening observer before its cold read completes',
  async owner => {
    const f = streamFixture()
    f.confirm(f.facts())
    f.host.attach(f.publication)
    const target = unbox(await f.current()).current
    if (!target) throw new Error('target')
    f.unavailable(f.publication.execution)
    const barrier = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    f.setRefresh(async () => {
      entered.resolve()
      await barrier.promise
      f.confirm(f.facts('2'))
      return { ok: undefined }
    })
    const signal = new AbortController().signal
    const remove = vi.spyOn(signal, 'removeEventListener')
    const iterator = f.host.observation
      .observe({ ref: target.ref, access: f.access, signal })
      [Symbol.asyncIterator]()
    const resolved = vi.fn()
    const pending = iterator.next().then(value => {
      resolved(value)
      return value
    })
    await entered.promise
    if (owner === 'host') f.host.close()
    else f.source.close()
    await Promise.resolve()
    expect(resolved).toHaveBeenCalledWith({
      done: false,
      value: { kind: 'ended', reason: owner === 'host' ? 'stale-stream' : 'source-closed' },
    })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    barrier.resolve()
    await pending
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    expect(f.waits.size).toBe(0)
    remove.mockRestore()
    f.source.close()
  },
)

it('reserves global observer capacity only on first next and returns it after return', async () => {
  const { f, iterator } = await observing({ maxObservers: 1 })
  const target = unbox(await f.current()).current
  if (!target) throw new Error('target')
  const create = () =>
    f.host.observation
      .observe({ ref: target.ref, access: f.access, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
  const unused = create()
  expect((await iterator.next()).value.kind).toBe('snapshot')
  const rejected = create()
  expect((await rejected.next()).value).toEqual({ kind: 'ended', reason: 'capacity' })
  await iterator.return?.()
  expect((await unused.next()).value.kind).toBe('snapshot')
  const pending = unused.next()
  await unused.return?.()
  expect(await pending).toEqual({ done: true, value: undefined })
  expect(await unused.next()).toEqual({ done: true, value: undefined })
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('rejects an oversized first snapshot and returns its metadata and admission reservations', async () => {
  const { f, iterator } = await observing({ maxSnapshotBytes: 1, maxObservers: 1 })
  expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'capacity' })
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
  expect(f.waits.size).toBe(0)
  expect(await f.current()).toHaveProperty('ok.state')
  f.source.close()
})

it('accepts exact delta byte capacity before rejecting one byte less', async () => {
  const sample = await observing()
  await sample.iterator.next()
  sample.f.confirm(sample.f.facts('2'))
  const frame = (await sample.iterator.next()).value
  const measured = measureStreamValue(frame, 1000000)
  if (!measured) throw new Error('measurement')
  await sample.iterator.return?.()
  sample.f.source.close()
  for (const offset of [0, -1]) {
    const { f, iterator } = await observing({ maxDeltaBytes: measured.bytes + offset })
    await iterator.next()
    f.confirm(f.facts('2'))
    expect((await iterator.next()).value.kind).toBe(offset === 0 ? 'delta' : 'gap')
    await iterator.return?.()
    f.source.close()
  }
})

it.each(['denied', 'unavailable', 'stale-stream'] as const)(
  'prefers %s to a held observer-closed terminal',
  async reason => {
    const { f, iterator, abort } = await observing()
    await iterator.next()
    abort.abort()
    if (reason === 'denied') f.denied.add('observe')
    else if (reason === 'unavailable') f.unavailable(f.publication.execution)
    else f.host.retire(f.publication)
    expect((await iterator.next()).value).toEqual({ kind: 'ended', reason })
    expect((await iterator.next()).done).toBe(true)
    expect(f.waits.size).toBe(0)
    f.source.close()
  },
)

it('runs authorization checks at the configured timer boundary and cancels the timer on return', async () => {
  const { f, iterator } = await observing({ checkIntervalMs: 7 })
  await iterator.next()
  const resolved = vi.fn()
  const pending = iterator.next().then(result => {
    resolved(result)
    return result
  })
  f.denied.add('observe')
  f.advance(6)
  await Promise.resolve()
  expect(resolved).not.toHaveBeenCalled()
  f.advance(7)
  expect((await pending).value).toEqual({ kind: 'ended', reason: 'denied' })
  expect(f.waits.size).toBe(0)
  f.source.close()
})

it('reports capacity when a cold observer cannot acquire a source read slot', async () => {
  const warm = await observing()
  const target = unbox(await warm.f.current()).current
  if (!target) throw new Error('target')
  const f = streamFixture({ maxPendingSourceOperations: 1 })
  const barrier = Promise.withResolvers<void>()
  f.setRefresh(async () => {
    await barrier.promise
    return { ok: undefined }
  })
  const busy = f.current()
  const iterator = f.host.observation
    .observe({ ref: target.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'capacity' })
  expect((await iterator.next()).done).toBe(true)
  barrier.resolve()
  await busy
  f.source.close()
  warm.f.source.close()
})
