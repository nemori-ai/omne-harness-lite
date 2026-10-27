import { describe, expect, it } from 'vitest'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  applyModelStreamDelta,
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type CallState,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
  type VisibleBlock,
} from '@omne-harness/model-contract'
import {
  createScriptedStreamObservation,
  ScriptedModelError,
  type ScriptedStreamObservation,
} from '@omne-harness/model-contract/testing'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  type StreamCallCodec,
  type StreamCursor,
  type StreamFrame,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { within } from './helpers/within.ts'

// Every product value is decoded inside a helper that the test calls, so none is built at
// module load.
function must<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error(`Invalid fixture value ${JSON.stringify(outcome)}`)
  return outcome.ok
}
function minted(account = '0'): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_' + '0'.repeat(26),
      account: 'acc_' + account.padStart(26, '0'),
    }),
  )
  if (!parsed.ok) throw new Error('Invalid tenant fixture')
  return parsed.value
}
type Principal = Readonly<{ subject: string }>
const viewer: Principal = { subject: 'viewer' }
const tenant = () => minted()
const foreign = () => minted('1')
const access = (): Access<Principal> => ({ tenant: tenant(), principal: viewer })
const call = () => must(decodeModelCallId('mcall_watched'))
const dispatch = () => must(decodeDispatchId('mdisp_watched'))
const codec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant: scope }) {
    const resolved = resolveModelInvocationRef(text, scope)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    return { ok: must(encodeModelInvocationRef(resolved.ok)) }
  },
}
function stream(id = 'str_watched', scope = tenant()): StreamRef {
  const invocation = must(
    encodeModelInvocationRef({
      tenant: scope,
      call: call(),
      admission: must(decodeModelOperationId('mop_watched')),
    }),
  )
  return must(
    encodeStreamRef(
      { tenant: scope, producer: 'model', call: invocation, stream: must(decodeStreamId(id)) },
      codec,
    ),
  )
}
function cursor(ref: StreamRef, position: string): StreamCursor {
  return must(encodeStreamCursor({ ref, position: must(decodeStreamPosition(position)) }))
}
function state(revision: string, control: CallState['control'] = { kind: 'none' }): CallState {
  return {
    call: call(),
    revision: must(decodeRevision(revision)),
    consumer: { owner: 'viewer-host', work: 'work', position: 'answer', purpose: 'reply' },
    control,
    custody: { kind: 'producer' },
    phase: 'running',
    dispatch: dispatch(),
    firstContent: 'observed',
  }
}
function growing(index: string, value: string): VisibleBlock {
  return { kind: 'growing', index, mode: 'append', content: 'text', value }
}
function snapshot(
  input: Readonly<{
    ref?: StreamRef
    revision: string
    outputCursor: string
    blocks: readonly VisibleBlock[]
    control?: CallState['control']
  }>,
): ModelStreamSnapshot {
  return {
    ref: input.ref ?? stream(),
    dispatch: dispatch(),
    value: {
      call: call(),
      cursor: must(decodeOutputCursor(input.outputCursor)),
      state: state(input.revision, input.control),
      blocks: input.blocks,
    },
  }
}
const first = () => snapshot({ revision: '1', outputCursor: '1', blocks: [growing('0', 'a')] })
const second = () => snapshot({ revision: '2', outputCursor: '2', blocks: [growing('0', 'ab')] })
const third = () =>
  snapshot({
    revision: '3',
    outputCursor: '3',
    blocks: [growing('0', 'abc'), growing('1', 'x')],
  })

type Frame = StreamFrame<ModelStreamSnapshot, ModelStreamDelta>
type Reader = Readonly<{ next(): Promise<Frame | 'finished'>; abort(): void }>

/** Opens one observation and reads it frame by frame. */
function watch(
  source: ScriptedStreamObservation<Principal>,
  ref = stream(),
  who = access(),
): Reader {
  const controller = new AbortController()
  const iterator = source.observation
    .observe({ access: who, ref, signal: controller.signal })
    [Symbol.asyncIterator]()
  return {
    async next() {
      const step = await within(iterator.next(), 'next')
      return step.done === true ? 'finished' : step.value
    },
    abort: () => controller.abort(),
  }
}

function opened(options: { capacity?: number } = {}) {
  const source = createScriptedStreamObservation<Principal>(options)
  source.setAccess(access(), 'allow')
  const published = source.publish({ tenant: tenant(), snapshot: first() })
  return { source, published }
}

describe('an observation of a published Model stream', () => {
  it('gives the confirmed snapshot first and then one delta per advance, each from the last cursor', async () => {
    const { source, published } = opened()
    expect(published).toBe(cursor(stream(), '1'))
    const reader = watch(source)
    expect(await reader.next()).toEqual({ kind: 'snapshot', cursor: published, value: first() })
    const c2 = source.advance({ tenant: tenant(), snapshot: second() })
    const c3 = source.advance({ tenant: tenant(), snapshot: third() })
    expect(c2).toBe(cursor(stream(), '2'))
    expect(c3).toBe(cursor(stream(), '3'))
    const delta1 = await reader.next()
    expect(delta1).toMatchObject({
      kind: 'delta',
      from: published,
      cursor: c2,
      value: { blocks: [growing('0', 'ab')] },
    })
    const delta2 = await reader.next()
    expect(delta2).toMatchObject({ kind: 'delta', from: c2, cursor: c3 })
    if (
      delta1 === 'finished' ||
      delta2 === 'finished' ||
      delta1.kind !== 'delta' ||
      delta2.kind !== 'delta'
    )
      throw new Error('expected two deltas')
    const applied = must(
      applyModelStreamDelta({
        tenant: tenant(),
        before: must(
          applyModelStreamDelta({ tenant: tenant(), before: first(), delta: delta1.value }),
        ),
        delta: delta2.value,
      }),
    )
    expect(applied).toEqual(third())
  })

  it('advances the public cursor on a state-only change and gives an empty delta', async () => {
    const { source, published } = opened()
    const reader = watch(source)
    await reader.next()
    const cancelled = snapshot({
      revision: '2',
      outputCursor: '1',
      blocks: [growing('0', 'a')],
      control: {
        kind: 'requested',
        operation: must(decodeModelOperationId('mop_cancel')),
        propagation: 'pending',
        upstream: 'unknown',
      },
    })
    const c2 = source.advance({ tenant: tenant(), snapshot: cancelled })
    expect(c2).toBe(cursor(stream(), '2'))
    expect(await reader.next()).toMatchObject({
      kind: 'delta',
      from: published,
      cursor: c2,
      value: { blocks: [], state: { control: { kind: 'requested' } } },
    })
  })

  it('gives the then-current full snapshot to an observer that comes back, not the old deltas', async () => {
    const { source } = opened()
    const early = watch(source)
    await early.next()
    source.advance({ tenant: tenant(), snapshot: second() })
    early.abort()
    expect(await early.next()).toEqual({ kind: 'ended', reason: 'observer-closed' })
    expect(await early.next()).toBe('finished')
    expect(source.openObservations(stream())).toBe(0)
    const c3 = source.advance({ tenant: tenant(), snapshot: third() })
    const back = watch(source)
    expect(await back.next()).toEqual({ kind: 'snapshot', cursor: c3, value: third() })
    const fourth = snapshot({
      revision: '4',
      outputCursor: '4',
      blocks: [growing('0', 'abcd'), growing('1', 'x')],
    })
    const c4 = source.advance({ tenant: tenant(), snapshot: fourth })
    expect(await back.next()).toMatchObject({
      kind: 'delta',
      from: c3,
      cursor: c4,
      value: { blocks: [growing('0', 'abcd')] },
    })
    expect(source.openObservations(stream())).toBe(1)
  })

  it('takes the snapshot and registers the subscription together, so an advance right after the request is a delta', async () => {
    const { source, published } = opened()
    const reader = watch(source)
    const pending = reader.next()
    const c2 = source.advance({ tenant: tenant(), snapshot: second() })
    expect(await within(pending, 'pending')).toEqual({
      kind: 'snapshot',
      cursor: published,
      value: first(),
    })
    expect(await reader.next()).toMatchObject({ kind: 'delta', from: published, cursor: c2 })
  })

  it('ends every open observer and every later one with the reason the source ended with', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    source.end({ ref: stream(), reason: 'source-closed' })
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'source-closed' })
    expect(await reader.next()).toBe('finished')
    expect(await watch(source).next()).toEqual({ kind: 'ended', reason: 'source-closed' })
    expect(source.openObservations(stream())).toBe(0)
  })

  it('ends a slow observer with a buffer gap after the last frame it took once its untaken frames exceed the limit', async () => {
    const { source, published } = opened({ capacity: 2 })
    const reader = watch(source)
    await reader.next()
    source.advance({ tenant: tenant(), snapshot: second() })
    source.advance({ tenant: tenant(), snapshot: third() })
    expect(source.openObservations(stream())).toBe(1)
    source.advance({
      tenant: tenant(),
      snapshot: snapshot({
        revision: '4',
        outputCursor: '4',
        blocks: [growing('0', 'abcd'), growing('1', 'x')],
      }),
    })
    expect(source.openObservations(stream())).toBe(0)
    expect(await reader.next()).toEqual({ kind: 'gap', reason: 'buffer', after: published })
    expect(await reader.next()).toBe('finished')
  })

  it('gives the buffer gap the cursor of the last delta the observer took, not the last one queued', async () => {
    const { source } = opened({ capacity: 1 })
    const reader = watch(source)
    await reader.next()
    const c2 = source.advance({ tenant: tenant(), snapshot: second() })
    expect(await reader.next()).toMatchObject({ kind: 'delta', cursor: c2 })
    source.advance({ tenant: tenant(), snapshot: third() })
    source.advance({
      tenant: tenant(),
      snapshot: snapshot({
        revision: '4',
        outputCursor: '4',
        blocks: [growing('0', 'abcd'), growing('1', 'x')],
      }),
    })
    source.end({ ref: stream(), reason: 'source-closed' })
    expect(await reader.next()).toEqual({ kind: 'gap', reason: 'buffer', after: c2 })
    expect(await reader.next()).toBe('finished')
  })

  it('resolves a waiting next and every later next as done once the iterator returns', async () => {
    const { source } = opened()
    const iterator = source.observation
      .observe({ access: access(), ref: stream(), signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    expect(await within(iterator.next(), 'next')).toMatchObject({
      done: false,
      value: { kind: 'snapshot' },
    })
    const waiting = iterator.next()
    const stopped = iterator.return?.()
    if (stopped === undefined) throw new Error('the iterator has no return')
    expect(await within(stopped, 'return')).toEqual({ done: true, value: undefined })
    expect(await within(waiting, 'waiting')).toEqual({ done: true, value: undefined })
    source.advance({ tenant: tenant(), snapshot: second() })
    expect(await within(iterator.next(), 'next')).toEqual({ done: true, value: undefined })
    expect(source.openObservations(stream())).toBe(0)
  })

  it('gives a waiting reader the delta as soon as the source advances', async () => {
    const { source, published } = opened()
    const reader = watch(source)
    await reader.next()
    const waiting = reader.next()
    const c2 = source.advance({ tenant: tenant(), snapshot: second() })
    expect(await waiting).toMatchObject({ kind: 'delta', from: published, cursor: c2 })
  })

  it('gives a waiting reader the end as soon as the source ends', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    const waiting = reader.next()
    source.end({ ref: stream(), reason: 'source-closed' })
    expect(await waiting).toEqual({ kind: 'ended', reason: 'source-closed' })
    expect(source.openObservations(stream())).toBe(0)
  })

  it('ends at once as observer-closed when the signal was aborted before the first read', async () => {
    const { source } = opened()
    const controller = new AbortController()
    controller.abort()
    const iterator = source.observation
      .observe({ access: access(), ref: stream(), signal: controller.signal })
      [Symbol.asyncIterator]()
    expect(await within(iterator.next(), 'next')).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'observer-closed' },
    })
    expect(await within(iterator.next(), 'next')).toEqual({ done: true, value: undefined })
    expect(source.openObservations(stream())).toBe(0)
  })

  it('ends as observer-closed when the reader aborts after the source ended but before it took the end', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    source.end({ ref: stream(), reason: 'source-closed' })
    reader.abort()
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'observer-closed' })
    expect(await reader.next()).toBe('finished')
  })

  it('stays done when the signal aborts after the iterator returned', async () => {
    const { source } = opened()
    const controller = new AbortController()
    const iterator = source.observation
      .observe({ access: access(), ref: stream(), signal: controller.signal })
      [Symbol.asyncIterator]()
    await within(iterator.next(), 'next')
    const stopped = iterator.return?.()
    if (stopped === undefined) throw new Error('the iterator has no return')
    await within(stopped, 'return')
    controller.abort()
    expect(await within(iterator.next(), 'next')).toEqual({ done: true, value: undefined })
  })

  it('hands out frozen copies and is not changed by later changes to the inputs', async () => {
    const source = createScriptedStreamObservation<Principal>()
    source.setAccess(access(), 'allow')
    const input = first()
    const published = source.publish({ tenant: tenant(), snapshot: input })
    Reflect.set(input.value, 'blocks', [growing('0', 'changed')])
    const reader = watch(source)
    const frame = await reader.next()
    expect(frame).toEqual({ kind: 'snapshot', cursor: published, value: first() })
    if (frame === 'finished' || frame.kind !== 'snapshot') throw new Error('expected a snapshot')
    expect(Object.isFrozen(frame.value.value.blocks)).toBe(true)
    expect(Object.isFrozen(frame.value.value.state.consumer)).toBe(true)
    const again = await watch(source).next()
    expect(again).toEqual(frame)
    expect(again).not.toBe(frame)
  })
})

describe('what an observation request is refused with', () => {
  it('denies by default, and an unavailable control plane ends as unavailable', async () => {
    const source = createScriptedStreamObservation<Principal>()
    source.publish({ tenant: tenant(), snapshot: first() })
    expect(await watch(source).next()).toEqual({ kind: 'ended', reason: 'denied' })
    source.setAccess(access(), 'unavailable')
    expect(await watch(source).next()).toEqual({ kind: 'ended', reason: 'unavailable' })
    source.setAccess({ tenant: tenant(), principal: { subject: 'viewer' } }, 'allow')
    expect(await watch(source).next()).toEqual({ kind: 'ended', reason: 'unavailable' })
    source.setAccess(access(), 'deny')
    expect(await watch(source).next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(source.openObservations(stream())).toBe(0)
  })

  it('denies a foreign tenant and an unminted tenant without telling whether the stream exists', async () => {
    const { source } = opened()
    source.setAccess({ tenant: foreign(), principal: viewer }, 'allow')
    expect(await watch(source, stream(), { tenant: foreign(), principal: viewer }).next()).toEqual({
      kind: 'ended',
      reason: 'denied',
    })
    expect(
      await watch(source, stream('str_missing'), { tenant: foreign(), principal: viewer }).next(),
    ).toEqual({ kind: 'ended', reason: 'denied' })
    // @ts-expect-error an unminted tenant exercises the runtime identity guard
    expect(await watch(source, stream(), { tenant: {}, principal: viewer }).next()).toEqual({
      kind: 'ended',
      reason: 'denied',
    })
  })

  it('ends as stale-stream for an unpublished stream of the tenant and for an unreadable reference', async () => {
    const { source } = opened()
    expect(await watch(source, stream('str_missing')).next()).toEqual({
      kind: 'ended',
      reason: 'stale-stream',
    })
    // @ts-expect-error an unreadable reference exercises the runtime envelope guard
    expect(await watch(source, 'not a reference').next()).toEqual({
      kind: 'ended',
      reason: 'stale-stream',
    })
  })

  it('ends a queued observer as denied when its access is withdrawn before the next frame', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    source.advance({ tenant: tenant(), snapshot: second() })
    source.setAccess(access(), 'deny')
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(await reader.next()).toBe('finished')
    expect(source.openObservations(stream())).toBe(0)
  })

  it('ends as denied when the access is withdrawn after the source ended but before the reader took the end', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    source.end({ ref: stream(), reason: 'source-closed' })
    source.setAccess(access(), 'deny')
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(await reader.next()).toBe('finished')
  })

  it('ends as unavailable when the control plane goes away after the source ended but before the reader took the end', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    source.end({ ref: stream(), reason: 'source-closed' })
    source.setAccess(access(), 'unavailable')
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'unavailable' })
  })

  it('ends as denied when the access is withdrawn after a buffer overflow but before the reader took the gap', async () => {
    const { source } = opened({ capacity: 1 })
    const reader = watch(source)
    await reader.next()
    source.advance({ tenant: tenant(), snapshot: second() })
    source.advance({ tenant: tenant(), snapshot: third() })
    source.setAccess(access(), 'deny')
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(await reader.next()).toBe('finished')
  })

  it('ends as denied when the access is withdrawn after an abort but before the reader took the end', async () => {
    const { source } = opened()
    const reader = watch(source)
    await reader.next()
    reader.abort()
    source.setAccess(access(), 'deny')
    expect(await reader.next()).toEqual({ kind: 'ended', reason: 'denied' })
    expect(await reader.next()).toBe('finished')
  })
})

describe('what the script may not do', () => {
  it('refuses to publish a stream twice, to advance an unpublished one, or to advance past a conflict', () => {
    const { source } = opened()
    expect(() => source.publish({ tenant: tenant(), snapshot: first() })).toThrow(
      ScriptedModelError,
    )
    expect(() => source.advance({ tenant: tenant(), snapshot: second() })).not.toThrow()
    expect(() =>
      source.advance({ tenant: tenant(), snapshot: { ...second(), ref: stream('str_other') } }),
    ).toThrow(ScriptedModelError)
    expect(() =>
      source.advance({
        tenant: tenant(),
        snapshot: snapshot({ revision: '1', outputCursor: '1', blocks: [] }),
      }),
    ).toThrow('revision-regression')
    expect(() => source.end({ ref: stream('str_other'), reason: 'source-closed' })).toThrow(
      ScriptedModelError,
    )
  })

  it('refuses a snapshot of another tenant and a snapshot that is not a valid projection', () => {
    const source = createScriptedStreamObservation<Principal>()
    expect(() => source.publish({ tenant: foreign(), snapshot: first() })).toThrow(
      ScriptedModelError,
    )
    expect(() =>
      source.publish({
        tenant: tenant(),
        snapshot: { ...first(), dispatch: must(decodeDispatchId('mdisp_other')) },
      }),
    ).toThrow('dispatch-mismatch')
    expect(() => createScriptedStreamObservation<Principal>({ capacity: 0 })).toThrow(
      ScriptedModelError,
    )
  })
})
