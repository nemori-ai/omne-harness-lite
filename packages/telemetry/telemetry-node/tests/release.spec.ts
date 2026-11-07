import { describe, expect, it, vi } from 'vitest'
import { isSegment } from '@omne-harness/telemetry-contract'
import { handling, harness, manualClock, systemBinding } from './support.ts'

describe('segment release notifications', () => {
  it('notifies once on a valid end, including a throwing observer, and frees capacity', async () => {
    const { runtime } = harness({ budgets: { maxOpenSegments: 1 } })
    const emitter = runtime.port.bind(systemBinding())
    const onRelease = vi.fn(() => {
      throw new Error('observer failed')
    })
    const segment = emitter.startSegment(handling, { onRelease })
    if (!isSegment(segment)) throw new Error('expected a segment')
    expect(segment.end('invalid' as never)).toEqual({ kind: 'dropped', reason: 'invalid' })
    expect(onRelease).not.toHaveBeenCalled()
    expect(segment.end('ok')).toEqual({ kind: 'admitted' })
    expect(segment.end('failure')).toEqual({ kind: 'admitted' })
    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    expect(await runtime.close(1000)).toMatchObject({ droppedBy: { invalid: 1 } })
  })

  it('keeps a failed end idempotent after releasing its place', async () => {
    const clock = manualClock()
    let badDate = false
    const { runtime } = harness({
      clock: { ...clock, now: () => (badDate ? new Date(NaN) : clock.now()) },
      budgets: { maxOpenSegments: 1 },
    })
    const onRelease = vi.fn()
    const emitter = runtime.port.bind(systemBinding())
    const segment = emitter.startSegment(handling, { onRelease })
    if (!isSegment(segment)) throw new Error('expected a segment')
    badDate = true
    expect(segment.end()).toEqual({ kind: 'dropped', reason: 'invalid' })
    badDate = false
    expect(segment.end('ok')).toEqual({ kind: 'dropped', reason: 'invalid' })
    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    expect(await runtime.close(1000)).toMatchObject({ droppedBy: { invalid: 1 } })
  })

  it('releases overdue and live segments synchronously on close, preserving late-end counts', async () => {
    const { runtime, clock, written } = harness({ budgets: { maxSegmentLifetimeMs: 10 } })
    const emitter = runtime.port.bind(systemBinding())
    const oldReleased = vi.fn(() => {
      throw new Error('observer failed')
    })
    const youngReleased = vi.fn()
    const old = emitter.startSegment(handling, { onRelease: oldReleased })
    clock.advance(6)
    const young = emitter.startSegment(handling, { onRelease: youngReleased })
    if (!isSegment(old) || !isSegment(young)) throw new Error('expected segments')
    clock.advance(5)
    const closing = runtime.close(1000)
    expect(oldReleased).toHaveBeenCalledTimes(1)
    expect(youngReleased).toHaveBeenCalledTimes(1)
    expect(old.end()).toEqual({ kind: 'dropped', reason: 'closed' })
    expect(young.end()).toEqual({ kind: 'dropped', reason: 'closed' })
    young.end()
    old.end()
    expect(await closing).toMatchObject({ droppedBy: { expired: 1, closed: 1 } })
    expect(written.map(record => record.signal)).toEqual(['segment-start', 'segment-start'])
    expect(runtime.close(1)).toBe(closing)
    expect(oldReleased).toHaveBeenCalledTimes(1)
    expect(youngReleased).toHaveBeenCalledTimes(1)
  })

  it('notifies only after the lifetime boundary is exceeded and not again on late end', async () => {
    const { runtime, clock } = harness({ budgets: { maxOpenSegments: 1, maxSegmentLifetimeMs: 1 } })
    const emitter = runtime.port.bind(systemBinding())
    const onRelease = vi.fn()
    const segment = emitter.startSegment(handling, { onRelease })
    if (!isSegment(segment)) throw new Error('expected a segment')
    clock.advance(1)
    expect(emitter.startSegment(handling)).toEqual({ kind: 'dropped', reason: 'capacity' })
    expect(onRelease).not.toHaveBeenCalled()
    clock.advance(1)
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    expect(onRelease).toHaveBeenCalledTimes(1)
    expect(segment.end()).toEqual({ kind: 'dropped', reason: 'expired' })
    expect(await runtime.close(1000)).toMatchObject({ droppedBy: { expired: 1, capacity: 1 } })
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  it('releases a reserved place when record formation throws and admits the next start', async () => {
    const clock = manualClock()
    let badDate = true
    const { runtime } = harness({
      clock: { ...clock, now: () => (badDate ? new Date(NaN) : clock.now()) },
      budgets: { maxOpenSegments: 1 },
    })
    const emitter = runtime.port.bind(systemBinding())
    const onRelease = vi.fn()
    expect(emitter.startSegment(handling, { onRelease })).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(onRelease).toHaveBeenCalledTimes(1)
    badDate = false
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    expect(await runtime.close(1000)).toMatchObject({ droppedBy: { invalid: 1 } })
  })

  it('rolls back without another clock read when admission throws after taking a place', async () => {
    const clock = manualClock()
    let reads = 0
    let failing = true
    const { runtime } = harness({
      clock: {
        ...clock,
        monotonicMs() {
          reads += 1
          if (failing && reads > 1) throw new Error('clock failed')
          return clock.monotonicMs()
        },
      },
      budgets: { maxOpenSegments: 1 },
    })
    const emitter = runtime.port.bind(systemBinding())
    const onRelease = vi.fn()
    expect(emitter.startSegment(handling, { onRelease })).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    expect(onRelease).toHaveBeenCalledTimes(1)
    failing = false
    expect(isSegment(emitter.startSegment(handling))).toBe(true)
    await runtime.close(1000)
  })

  it('can notify release before start returns when admission discovers expiry', async () => {
    const clock = manualClock()
    const { runtime } = harness({
      clock: {
        ...clock,
        now() {
          clock.advance(2)
          return clock.now()
        },
      },
      budgets: { maxSegmentLifetimeMs: 1 },
    })
    const onRelease = vi.fn()
    const segment = runtime.port.bind(systemBinding()).startSegment(handling, { onRelease })
    expect(onRelease).toHaveBeenCalledTimes(1)
    if (!isSegment(segment)) throw new Error('expected a segment')
    expect(segment.end()).toEqual({ kind: 'dropped', reason: 'expired' })
    expect(await runtime.close(1000)).toMatchObject({ droppedBy: { expired: 1 } })
  })

  it('notifies on queue rollback, but does not register a callback for capacity or invalid rejection', async () => {
    const { runtime } = harness({ budgets: { maxOpenSegments: 1, maxQueueItems: 1 } })
    const emitter = runtime.port.bind(systemBinding())
    const active = vi.fn()
    const refused = vi.fn()
    const rolledBack = vi.fn()
    const first = emitter.startSegment(handling, { onRelease: active })
    if (!isSegment(first)) throw new Error('expected a segment')
    expect(emitter.startSegment(handling, { onRelease: refused })).toEqual({
      kind: 'dropped',
      reason: 'capacity',
    })
    expect(refused).not.toHaveBeenCalled()
    first.end()
    expect(active).toHaveBeenCalledTimes(1)
    expect(emitter.startSegment(handling, { onRelease: rolledBack })).toEqual({
      kind: 'dropped',
      reason: 'capacity',
    })
    expect(rolledBack).toHaveBeenCalledTimes(1)
    expect(emitter.startSegment(handling, { onRelease: 1 } as never)).toEqual({
      kind: 'dropped',
      reason: 'invalid',
    })
    await runtime.close(1000)
  })

  it('reports no reached sink when an empty queue drains successfully', async () => {
    const { runtime, written } = harness()
    expect(await runtime.close(1000)).toMatchObject({
      admitted: 0,
      pending: 0,
      flush: 'completed-to-boundary',
      boundary: 'none',
      transport: 'closed',
    })
    expect(written).toEqual([])
  })
})
