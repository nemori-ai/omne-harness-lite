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
  type ModelInvocationRef,
  type ModelStreamDelta,
  type ModelStreamObservation,
  type ModelStreamSelection,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  judgeStreamCursor,
  type StreamCallCodec,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { createModelStreamFixture } from './helpers/model-stream-selection-fixture.ts'
import { createStreamFixture } from '../../../common/stream-arrival/tests/helpers/stream-observation-fixture.ts'

function must<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error('Invalid fixture value')
  return outcome.ok
}
function minted(account = '0'): TenantId {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_' + '0'.repeat(26),
      account: 'acc_' + account.padStart(26, '0'),
    }),
  )
  if (!tenant.ok) throw new Error('Invalid tenant fixture')
  return tenant.value
}
const tenant = minted()
const foreign = minted('1')
const principal = { subject: 'viewer' }
const access: Access<typeof principal> = { tenant, principal }
const call = must(decodeModelCallId('mcall_current'))
const dispatch = must(decodeDispatchId('mdisp_current'))
const admission = must(decodeModelOperationId('mop_current'))
const reference = must(encodeModelInvocationRef({ tenant, call, admission }))
const wrongAdmission = must(
  encodeModelInvocationRef({ tenant, call, admission: must(decodeModelOperationId('mop_wrong')) }),
)
const codec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant: scope }) {
    const resolved = resolveModelInvocationRef(text, scope)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    return { ok: must(encodeModelInvocationRef(resolved.ok)) }
  },
}
function stream(id = 'str_current', invocation = reference): StreamRef {
  return must(
    encodeStreamRef(
      { tenant, producer: 'model', call: invocation, stream: must(decodeStreamId(id)) },
      codec,
    ),
  )
}
function state(rev = '1'): CallState {
  return {
    call,
    revision: must(decodeRevision(rev)),
    consumer: { owner: 'agent', work: 'work', position: 'answer', purpose: 'reply' },
    control: { kind: 'none' },
    custody: { kind: 'producer' },
    phase: 'running',
    dispatch,
    firstContent: 'observed',
  }
}
function selection(rev = '1', ref = stream()): ModelStreamSelection {
  return { state: state(rev), current: { ref, dispatch, projection: 'model-output-v1' } }
}
function fixture() {
  const value = createModelStreamFixture<typeof principal>()
  value.setAccess(access, 'allow')
  return value
}
const denied = { failure: { kind: 'denied', action: 'current' } }
const unavailable = {
  failure: { kind: 'unavailable', dependency: 'stream-references', diagnostic: 'fixture-source' },
}

describe('Model current public protocol through a controlled query adapter', () => {
  it('C01 preserves the confirmed state for both never-published and withdrawn null targets', async () => {
    const f = fixture()
    const first = state()
    f.establishWithoutTarget({ reference, state: first })
    expect(await f.references.current({ access, reference })).toEqual({
      ok: { state: first, current: null },
    })
    f.confirmSelection({ reference, selection: selection('2') })
    f.withdrawTarget(reference)
    expect(await f.references.current({ access, reference })).toEqual({
      ok: { state: state('2'), current: null },
    })
  })
  it('C02 keeps not-accepted, wrong admission and an unavailable source separate from null', async () => {
    const f = fixture()
    expect(await f.references.current({ access, reference })).toEqual({
      failure: { kind: 'invalid', field: 'reference', reason: 'not-accepted' },
    })
    f.establishWithoutTarget({ reference, state: state() })
    expect(await f.references.current({ access, reference: wrongAdmission })).toEqual({
      failure: { kind: 'invalid', field: 'admission', reason: 'not-original' },
    })
    f.setSource('unavailable')
    expect(await f.references.current({ access, reference })).toEqual(unavailable)
    expect(await f.references.current({ access, reference: wrongAdmission })).toEqual(unavailable)
  })
  it('C03 checks the real tenant and invocation codec before reading the owner', async () => {
    const f = fixture()
    f.confirmSelection({ reference, selection: selection() })
    expect(
      await f.references.current({ access: { principal, tenant: {} as TenantId }, reference }),
    ).toEqual({ failure: { kind: 'denied', action: 'tenant' } })
    expect(
      await f.references.current({ access: { principal, tenant: foreign }, reference }),
    ).toEqual(denied)
    expect(
      await f.references.current({ access, reference: 'broken' as ModelInvocationRef }),
    ).toEqual({ failure: { kind: 'invalid', field: 'reference', reason: 'reference-syntax' } })
    expect(f.events()).toEqual([])
  })
  it('C04 denies by default and distinguishes principal identity and tenant scope', async () => {
    const f = createModelStreamFixture<typeof principal>()
    f.confirmSelection({ reference, selection: selection() })
    for (const target of [reference, wrongAdmission])
      expect(await f.references.current({ access, reference: target })).toEqual(denied)
    f.setAccess(access, 'allow')
    expect(
      await f.references.current({ access: { tenant, principal: { ...principal } }, reference }),
    ).toEqual(denied)
    f.setAccess({ principal, tenant: foreign }, 'allow')
    f.setAccess(access, 'deny')
    expect(await f.references.current({ access, reference })).toEqual(denied)
    expect(f.events()).toEqual([])
  })
  it('C04 isolates identical call ids by minted tenant while recognizing an equivalent tenant value', async () => {
    const f = fixture()
    const foreignReference = must(encodeModelInvocationRef({ tenant: foreign, call, admission }))
    const foreignAccess = { principal, tenant: foreign }
    f.establishWithoutTarget({ reference, state: state('1') })
    f.establishWithoutTarget({ reference: foreignReference, state: state('2') })
    f.setAccess(foreignAccess, 'allow')
    expect(
      must(await f.references.current({ access: { principal, tenant: minted() }, reference })).state
        .revision,
    ).toBe(must(decodeRevision('1')))
    expect(
      must(await f.references.current({ access: foreignAccess, reference: foreignReference })).state
        .revision,
    ).toBe(must(decodeRevision('2')))
    f.setAccess(access, 'deny')
    expect(await f.references.current({ access, reference })).toEqual(denied)
    expect(
      must(await f.references.current({ access: foreignAccess, reference: foreignReference })).state
        .revision,
    ).toBe(must(decodeRevision('2')))
  })
  it('C04 checks unavailable qualification before a missing call or wrong admission', async () => {
    const f = fixture()
    f.setAccess(access, 'unavailable')
    for (const target of [reference, wrongAdmission])
      expect(await f.references.current({ access, reference: target })).toEqual(unavailable)
    expect(f.events()).toEqual([])
  })
  it('C05 re-reads one immutable confirmation after a held response', async () => {
    const f = fixture()
    f.confirmSelection({ reference, selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access, reference })
    await f.reached(1)
    const replacement = selection('2', stream('str_next'))
    f.confirmSelection({ reference, selection: replacement })
    f.releaseResponse(1)
    const result = must(await pending)
    expect(result).toEqual(replacement)
    expect(result).not.toBe(replacement)
    expect(Object.isFrozen(result.state.consumer)).toBe(true)
    expect(Object.isFrozen(result.current)).toBe(true)
    const consumer = replacement.state.consumer
    Reflect.set(consumer, 'work', 'mutated')
    expect(result.state.consumer.work).toBe('work')
    expect(consumer.work).toBe('mutated')
    f.withdrawTarget(reference)
    expect(result.current?.ref).toBe(stream('str_next'))
  })
  it.each(['deny', 'unavailable'] as const)(
    'C06 rechecks %s qualification before releasing a response',
    async decision => {
      const f = fixture()
      f.confirmSelection({ reference, selection: selection() })
      f.holdResponse(1)
      const pending = f.references.current({ access, reference })
      await f.reached(1)
      f.setAccess(access, decision)
      f.releaseResponse(1)
      expect(await pending).toEqual(decision === 'deny' ? denied : unavailable)
      expect(f.events()).toEqual([])
    },
  )
  it('C05 rechecks source availability and does not reuse an old confirmed response', async () => {
    const f = fixture()
    f.confirmSelection({ reference, selection: selection() })
    f.holdResponse(1)
    const pending = f.references.current({ access, reference })
    await f.reached(1)
    f.setSource('unavailable')
    f.releaseResponse(1)
    expect(await pending).toEqual(unavailable)
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
    f.confirmSelection({ reference, selection: { state: settled, current } })
    expect(await f.references.current({ access, reference })).toEqual({
      ok: { state: settled, current },
    })
    expect(current).not.toBeNull()
  })
  it('C09 leaves late-response suppression to the consumer using its latest issued request', async () => {
    const f = fixture()
    f.confirmSelection({ reference, selection: selection() })
    let latestIssued = 0
    let displayed: ModelStreamSelection | null = null
    const issue = () => ({
      id: ++latestIssued,
      response: f.references.current({ access, reference }),
    })
    const apply = async (request: ReturnType<typeof issue>) => {
      const result = await request.response
      if (request.id === latestIssued && 'ok' in result) displayed = result.ok
    }
    const old = issue()
    const newSelection = selection('2', stream('str_next'))
    f.confirmSelection({ reference, selection: newSelection })
    const recent = issue()
    await apply(recent)
    expect(displayed).toEqual(newSelection)
    await apply(old)
    expect(displayed).toEqual(newSelection)
    expect(must(await old.response)).toEqual(selection())
  })
  it('rejects control-plane source mismatches instead of manufacturing a confirmed target', () => {
    const f = fixture()
    expect(() =>
      f.confirmSelection({
        reference,
        selection: {
          ...selection(),
          state: { ...state(), call: must(decodeModelCallId('mcall_other')) },
        },
      }),
    ).toThrow('another call')
    expect(() =>
      f.confirmSelection({
        reference,
        selection: selection('1', stream('str_wrong', wrongAdmission)),
      }),
    ).toThrow('another invocation')
    f.confirmSelection({ reference, selection: selection() })
    expect(() => f.establishWithoutTarget({ reference: wrongAdmission, state: state() })).toThrow(
      'admission cannot change',
    )
  })
})

it('C08 keeps publication, retirement and observer cancellation separate across the null window', async () => {
  const f = fixture()
  const oldRef = stream()
  const newRef = stream('str_next')
  const limits = {
    snapshotBytes: 10000,
    deltaBytes: 10000,
    producerEndBytes: 10000,
    queueFrames: 10,
    queueBytes: 10000,
    residenceMs: 1000,
    observersPerTenant: 10,
    totalMemoryBytes: 100000,
  }
  const oldSource = createStreamFixture<typeof principal, ModelStreamSnapshot, ModelStreamDelta>({
    tenant,
    ref: oldRef,
    codec,
    limits,
  })
  const newSource = createStreamFixture<typeof principal, ModelStreamSnapshot, ModelStreamDelta>({
    tenant,
    ref: newRef,
    codec,
    limits,
  })
  const oldCursor = must(
    encodeStreamCursor({ ref: oldRef, position: must(decodeStreamPosition('1')) }),
  )
  const newCursor = must(
    encodeStreamCursor({ ref: newRef, position: must(decodeStreamPosition('1')) }),
  )
  const snapshot = (ref: StreamRef): ModelStreamSnapshot => ({
    ref,
    dispatch,
    value: {
      call,
      cursor: must(decodeOutputCursor('1')),
      state: state(ref === newRef ? '2' : '1'),
      blocks: [],
    },
  })
  oldSource.setAccess(access, 'allow')
  newSource.setAccess(access, 'allow')
  oldSource.confirm({ snapshot: snapshot(oldRef), cursor: oldCursor })
  f.confirmSelection({ reference, selection: selection() })
  const observation: ModelStreamObservation<typeof principal> = oldSource.observer
  const controller = new AbortController()
  const iterator = observation
    .observe({ access, ref: oldRef, signal: controller.signal })
    [Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual({
    kind: 'snapshot',
    cursor: oldCursor,
    value: snapshot(oldRef),
  })
  f.withdrawTarget(reference)
  expect(must(await f.references.current({ access, reference })).current).toBeNull()
  expect(oldSource.resources().subscriptions).toBe(1)
  oldSource.retire()
  expect((await iterator.next()).value).toEqual({ kind: 'ended', reason: 'stale-stream' })
  expect((await iterator.next()).done).toBe(true)
  expect(must(await f.references.current({ access, reference })).current).toBeNull()
  newSource.confirm({ snapshot: snapshot(newRef), cursor: newCursor })
  f.confirmSelection({ reference, selection: selection('2', newRef) })
  const selected = must(await f.references.current({ access, reference }))
  expect(selected.current?.ref).toBe(newRef)
  expect(judgeStreamCursor({ value: oldCursor, ref: newRef })).toEqual({
    failure: { kind: 'foreign-stream' },
  })
  const next = newSource.observer
    .observe({ access, ref: newRef, signal: controller.signal })
    [Symbol.asyncIterator]()
  expect((await next.next()).value).toEqual({
    kind: 'snapshot',
    cursor: newCursor,
    value: snapshot(newRef),
  })
  controller.abort()
  expect((await next.next()).value).toEqual({ kind: 'ended', reason: 'observer-closed' })
  expect((await next.next()).done).toBe(true)
  expect(must(await f.references.current({ access, reference }))).toEqual(selected)
  expect(oldSource.resources().subscriptions + newSource.resources().subscriptions).toBe(0)
})
