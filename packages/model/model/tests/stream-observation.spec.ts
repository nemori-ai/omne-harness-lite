import { expect, it } from 'vitest'
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
