import { describe, expect, it } from 'vitest'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  decodeRevision,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type CallState,
  type ModelStreamObservation,
  type ModelStreamSelection,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import {
  createScriptedStreamObservation,
  createScriptedStreamReferences,
} from '@omne-harness/model-contract/testing'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  judgeStreamCursor,
  type StreamCallCodec,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { within } from './helpers/within.ts'

// Every product value is decoded inside a helper that the test calls, so none is built at
// module load.
function must<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error('Invalid fixture value')
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
const principal = { subject: 'viewer' }
const tenant = () => minted()
const foreign = () => minted('1')
const access = (): Access<typeof principal> => ({ tenant: tenant(), principal })
const call = () => must(decodeModelCallId('mcall_current'))
const dispatch = () => must(decodeDispatchId('mdisp_current'))
const admission = () => must(decodeModelOperationId('mop_current'))
const reference = () =>
  must(encodeModelInvocationRef({ tenant: tenant(), call: call(), admission: admission() }))
const wrongAdmission = () =>
  must(
    encodeModelInvocationRef({
      tenant: tenant(),
      call: call(),
      admission: must(decodeModelOperationId('mop_wrong')),
    }),
  )
const codec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant: scope }) {
    const resolved = resolveModelInvocationRef(text, scope)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    return { ok: must(encodeModelInvocationRef(resolved.ok)) }
  },
}
function stream(id = 'str_current', invocation = reference()): StreamRef {
  return must(
    encodeStreamRef(
      { tenant: tenant(), producer: 'model', call: invocation, stream: must(decodeStreamId(id)) },
      codec,
    ),
  )
}
function state(rev = '1'): CallState {
  return {
    call: call(),
    revision: must(decodeRevision(rev)),
    consumer: { owner: 'viewer-host', work: 'work', position: 'answer', purpose: 'reply' },
    control: { kind: 'none' },
    custody: { kind: 'producer' },
    phase: 'running',
    dispatch: dispatch(),
    firstContent: 'observed',
  }
}
function selection(rev = '1', ref = stream()): ModelStreamSelection {
  return {
    state: state(rev),
    current: { ref, dispatch: dispatch(), projection: 'model-output-v1' },
  }
}
function fixture() {
  const value = createScriptedStreamReferences<typeof principal>()
  value.setAccess(access(), 'allow')
  return value
}
const denied = { failure: { kind: 'denied', action: 'current' } }
const unavailable = {
  failure: { kind: 'unavailable', dependency: 'stream-references', diagnostic: 'scripted-source' },
}

describe('Model current public protocol through the scripted stream references', () => {
  it('C01 preserves the confirmed state for both never-published and withdrawn null targets', async () => {
    const f = fixture()
    const first = state()
    f.establishWithoutTarget({ reference: reference(), state: first })
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual({
      ok: { state: first, current: null },
    })
    f.confirmSelection({ reference: reference(), selection: selection('2') })
    f.withdrawTarget(reference())
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual({
      ok: { state: state('2'), current: null },
    })
  })
  it('C02 keeps not-accepted, wrong admission and an unavailable source separate from null', async () => {
    const f = fixture()
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual({
      failure: { kind: 'invalid', field: 'reference', reason: 'not-accepted' },
    })
    f.establishWithoutTarget({ reference: reference(), state: state() })
    expect(
      await within(
        f.references.current({ access: access(), reference: wrongAdmission() }),
        'current',
      ),
    ).toEqual({
      failure: { kind: 'invalid', field: 'admission', reason: 'not-original' },
    })
    f.setSource('unavailable')
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual(unavailable)
    expect(
      await within(
        f.references.current({ access: access(), reference: wrongAdmission() }),
        'current',
      ),
    ).toEqual(unavailable)
  })
  it('C03 checks the real tenant and invocation codec before reading the owner', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    expect(
      await within(
        f.references.current({
          // @ts-expect-error an unminted tenant exercises the runtime identity guard
          access: { principal, tenant: {} },
          reference: reference(),
        }),
        'current',
      ),
    ).toEqual({ failure: { kind: 'denied', action: 'tenant' } })
    expect(
      await within(
        f.references.current({
          access: { principal, tenant: foreign() },
          reference: reference(),
        }),
        'current',
      ),
    ).toEqual(denied)
    expect(
      await within(
        f.references.current({
          access: access(),
          // @ts-expect-error a malformed reference exercises the runtime codec guard
          reference: 'broken',
        }),
        'current',
      ),
    ).toEqual({ failure: { kind: 'invalid', field: 'reference', reason: 'reference-syntax' } })
    expect(f.events()).toEqual([])
  })
  it('C04 denies by default and distinguishes principal identity and tenant scope', async () => {
    const f = createScriptedStreamReferences<typeof principal>()
    f.confirmSelection({ reference: reference(), selection: selection() })
    for (const target of [reference(), wrongAdmission()])
      expect(
        await within(f.references.current({ access: access(), reference: target }), 'current'),
      ).toEqual(denied)
    f.setAccess(access(), 'allow')
    expect(
      await within(
        f.references.current({
          access: { tenant: tenant(), principal: { ...principal } },
          reference: reference(),
        }),
        'current',
      ),
    ).toEqual(denied)
    f.setAccess({ principal, tenant: foreign() }, 'allow')
    f.setAccess(access(), 'deny')
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual(denied)
    expect(f.events()).toEqual([])
  })
  it('C04 isolates identical call ids by minted tenant while recognizing an equivalent tenant value', async () => {
    const f = fixture()
    const foreignReference = must(
      encodeModelInvocationRef({ tenant: foreign(), call: call(), admission: admission() }),
    )
    const foreignAccess = { principal, tenant: foreign() }
    f.establishWithoutTarget({ reference: reference(), state: state('1') })
    f.establishWithoutTarget({ reference: foreignReference, state: state('2') })
    f.setAccess(foreignAccess, 'allow')
    expect(
      must(
        await within(
          f.references.current({
            access: { principal, tenant: minted() },
            reference: reference(),
          }),
          'current',
        ),
      ).state.revision,
    ).toBe(must(decodeRevision('1')))
    expect(
      must(
        await within(
          f.references.current({ access: foreignAccess, reference: foreignReference }),
          'current',
        ),
      ).state.revision,
    ).toBe(must(decodeRevision('2')))
    f.setAccess(access(), 'deny')
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual(denied)
    expect(
      must(
        await within(
          f.references.current({ access: foreignAccess, reference: foreignReference }),
          'current',
        ),
      ).state.revision,
    ).toBe(must(decodeRevision('2')))
  })
  it('C04 checks unavailable qualification before a missing call or wrong admission', async () => {
    const f = fixture()
    f.setAccess(access(), 'unavailable')
    for (const target of [reference(), wrongAdmission()])
      expect(
        await within(f.references.current({ access: access(), reference: target }), 'current'),
      ).toEqual(unavailable)
    expect(f.events()).toEqual([])
  })
  it('C05 re-reads one immutable confirmation after a held response', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access: access(), reference: reference() })
    await within(f.reached(1), 'reached')
    const replacement = selection('2', stream('str_next'))
    f.confirmSelection({ reference: reference(), selection: replacement })
    f.releaseResponse(1)
    const result = must(await within(pending, 'pending'))
    expect(result).toEqual(replacement)
    expect(result).not.toBe(replacement)
    expect(Object.isFrozen(result.state.consumer)).toBe(true)
    expect(Object.isFrozen(result.current)).toBe(true)
    const consumer = replacement.state.consumer
    Reflect.set(consumer, 'work', 'mutated')
    expect(result.state.consumer.work).toBe('work')
    expect(consumer.work).toBe('mutated')
    f.withdrawTarget(reference())
    expect(result.current?.ref).toBe(stream('str_next'))
  })
  it('C06 rechecks deny qualification before releasing a response', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access: access(), reference: reference() })
    await within(f.reached(1), 'reached')
    f.setAccess(access(), 'deny')
    f.releaseResponse(1)
    expect(await within(pending, 'pending')).toEqual(denied)
    expect(f.events()).toEqual([])
  })
  it('C06 rechecks unavailable qualification before releasing a response', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access: access(), reference: reference() })
    await within(f.reached(1), 'reached')
    f.setAccess(access(), 'unavailable')
    f.releaseResponse(1)
    expect(await within(pending, 'pending')).toEqual(unavailable)
    expect(f.events()).toEqual([])
  })
  it('C05 rechecks source availability and does not reuse an old confirmed response', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access: access(), reference: reference() })
    await within(f.reached(1), 'reached')
    f.setSource('unavailable')
    f.releaseResponse(1)
    expect(await within(pending, 'pending')).toEqual(unavailable)
  })
  it('C07 retains the confirmed projection after business settlement', async () => {
    const f = fixture()
    const settled: CallState = {
      ...state('2'),
      phase: 'settled',
      settlement: {
        version: must(decodeResultVersion('mrver_current')),
        cursor: must(decodeOutputCursor('1')),
        termination: { kind: 'completed', reason: 'stop' },
        source: { owner: 'model', record: 'saved', revision: '1', digest: 'digest' },
      },
    }
    const current = selection().current
    f.confirmSelection({ reference: reference(), selection: { state: settled, current } })
    expect(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).toEqual({
      ok: { state: settled, current },
    })
    expect(current).not.toBeNull()
  })
  it('C09 leaves late-response suppression to the consumer using its latest issued request', async () => {
    const f = fixture()
    f.confirmSelection({ reference: reference(), selection: selection() })
    let latestIssued = 0
    let displayed: ModelStreamSelection | null = null
    const issue = () => ({
      id: ++latestIssued,
      response: f.references.current({ access: access(), reference: reference() }),
    })
    const apply = async (request: ReturnType<typeof issue>) => {
      const result = await within(request.response, 'response')
      if (request.id === latestIssued && 'ok' in result) displayed = result.ok
    }
    const old = issue()
    const newSelection = selection('2', stream('str_next'))
    f.confirmSelection({ reference: reference(), selection: newSelection })
    const recent = issue()
    await apply(recent)
    expect(displayed).toEqual(newSelection)
    await apply(old)
    expect(displayed).toEqual(newSelection)
    expect(must(await within(old.response, 'response'))).toEqual(selection())
  })
  it('rejects control-plane source mismatches instead of manufacturing a confirmed target', () => {
    const f = fixture()
    expect(() =>
      f.confirmSelection({
        reference: reference(),
        selection: {
          ...selection(),
          state: { ...state(), call: must(decodeModelCallId('mcall_other')) },
        },
      }),
    ).toThrow('another call')
    expect(() =>
      f.confirmSelection({
        reference: reference(),
        selection: selection('1', stream('str_wrong', wrongAdmission())),
      }),
    ).toThrow('another invocation')
    f.confirmSelection({ reference: reference(), selection: selection() })
    expect(() => f.establishWithoutTarget({ reference: wrongAdmission(), state: state() })).toThrow(
      'admission cannot change',
    )
  })
})

it('C08 keeps publication, retirement and observer cancellation separate across the null window', async () => {
  const f = fixture()
  const oldRef = stream()
  const newRef = stream('str_next')
  const source = createScriptedStreamObservation<typeof principal>()
  const oldCursor = must(
    encodeStreamCursor({ ref: oldRef, position: must(decodeStreamPosition('1')) }),
  )
  const newCursor = must(
    encodeStreamCursor({ ref: newRef, position: must(decodeStreamPosition('1')) }),
  )
  const snapshot = (ref: StreamRef): ModelStreamSnapshot => ({
    ref,
    dispatch: dispatch(),
    value: {
      call: call(),
      cursor: must(decodeOutputCursor('1')),
      state: state(ref === newRef ? '2' : '1'),
      blocks: [],
    },
  })
  source.setAccess(access(), 'allow')
  expect(source.publish({ tenant: tenant(), snapshot: snapshot(oldRef) })).toBe(oldCursor)
  f.confirmSelection({ reference: reference(), selection: selection() })
  const observation: ModelStreamObservation<typeof principal> = source.observation
  const controller = new AbortController()
  const iterator = observation
    .observe({ access: access(), ref: oldRef, signal: controller.signal })
    [Symbol.asyncIterator]()
  expect((await within(iterator.next(), 'next')).value).toEqual({
    kind: 'snapshot',
    cursor: oldCursor,
    value: snapshot(oldRef),
  })
  f.withdrawTarget(reference())
  expect(
    must(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).current,
  ).toBeNull()
  expect(source.openObservations(oldRef)).toBe(1)
  source.end({ ref: oldRef, reason: 'stale-stream' })
  expect((await within(iterator.next(), 'next')).value).toEqual({
    kind: 'ended',
    reason: 'stale-stream',
  })
  expect((await within(iterator.next(), 'next')).done).toBe(true)
  expect(
    must(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ).current,
  ).toBeNull()
  expect(source.publish({ tenant: tenant(), snapshot: snapshot(newRef) })).toBe(newCursor)
  f.confirmSelection({ reference: reference(), selection: selection('2', newRef) })
  const selected = must(
    await within(f.references.current({ access: access(), reference: reference() }), 'current'),
  )
  expect(selected.current?.ref).toBe(newRef)
  expect(judgeStreamCursor({ value: oldCursor, ref: newRef })).toEqual({
    failure: { kind: 'foreign-stream' },
  })
  const next = source.observation
    .observe({ access: access(), ref: newRef, signal: controller.signal })
    [Symbol.asyncIterator]()
  expect((await within(next.next(), 'next')).value).toEqual({
    kind: 'snapshot',
    cursor: newCursor,
    value: snapshot(newRef),
  })
  controller.abort()
  expect((await within(next.next(), 'next')).value).toEqual({
    kind: 'ended',
    reason: 'observer-closed',
  })
  expect((await within(next.next(), 'next')).done).toBe(true)
  expect(
    must(
      await within(f.references.current({ access: access(), reference: reference() }), 'current'),
    ),
  ).toEqual(selected)
  expect(source.openObservations(oldRef) + source.openObservations(newRef)).toBe(0)
})
