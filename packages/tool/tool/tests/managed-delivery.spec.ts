import { describe, expect, it } from 'vitest'
import type { Handoff } from '@omne-harness/tool-contract'
import {
  admission,
  callId,
  dummyRequest,
  evidence,
  harness,
  judged,
  ok,
  operationId,
  principalA,
  tenantA,
  textOf,
} from './runtime-values.ts'

const consumer = dummyRequest().consumer
const retained: Handoff = { kind: 'retained', custody: evidence('kept', consumer.owner) }
const processed: Handoff = { kind: 'processed', completion: evidence('done', consumer.owner) }

function release(operation: string, evidenceOf: Handoff, overrides: Record<string, unknown> = {}) {
  return {
    principal: principalA,
    tenant: tenantA,
    call: callId('call-1'),
    operation: operationId(operation),
    result: 'v1' as never,
    delivery: 'd1' as never,
    consumer,
    evidence: evidenceOf,
    ...overrides,
  }
}

describe('16 delivery release (P08)', () => {
  it.each([
    ['retained', retained],
    ['processed', processed],
  ])('16 release: the %s path releases the delivery with a Tool-side receipt', async (_, proof) => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const released = ok(await runtime.releaseDelivery(release('op-2', proof)))
    expect(released).toMatchObject({
      kind: 'released',
      delivery: 'd1',
      consumer,
      evidence: {
        owner: '@omne-harness/tool',
        record:
          'delivery:{"call":"call-1","delivery":"d1","result":"v1","tenant":{"account":"acc_a","organization":"org_a"}}',
      },
    })
    // The receipt is minted by Tool, not the consumer's evidence echoed back.
    if (released.kind === 'released')
      expect(released.evidence).not.toEqual(evidence('kept', consumer.owner))
    const found = ok(
      await runtime.lookup({ ...release('op-2', proof), admission: operationId('op-1') }),
    )
    if (found.kind !== 'found') throw new Error('lost the call')
    expect(judged(found.state).delivery).toEqual(released)
    // The full text stays readable after the release.
    const page = ok(
      await runtime.readResult({ ...release('op-2', proof), result: 'v1' as never, after: null }),
    )
    expect(page.value.content.map(textOf).join('')).toContain('tool unavailable')
  })

  it('16 release: one commit releases the result, records the receipt and the state, and removes the deliver task', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const released = ok(await runtime.releaseDelivery(release('op-2', retained)))
    expect(store.commits).toBe(2)
    const read = await store.read({
      kind: 'call',
      tenant: tenantA as never,
      call: callId('call-1'),
    })
    if (read.kind !== 'complete') throw new Error('read failed')
    expect(read.revision).toBe('2')
    const of = <K extends string>(kind: K) => read.records.filter(record => record.kind === kind)
    expect(of('task')).toEqual([])
    expect(of('result')).toMatchObject([{ result: { delivery: released } }])
    expect(of('call')).toMatchObject([{ call: { state: { delivery: released, revision: '2' } } }])
    expect(of('operation')).toMatchObject([
      { operation: { operation: 'op-1', revision: '1' } },
      { operation: { operation: 'op-2', revision: '2', receipt: { delivery: released } } },
    ])
  })

  it('16 release: the release of a call that was never admitted is an unknown call', async () => {
    const { runtime, store } = harness()
    expect(await runtime.releaseDelivery(release('op-2', retained))).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'unknown-call' },
    })
    expect(store.commits).toBe(0)
  })

  it('16 release: the consumer and the handoff are closed values, checked before any digest', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const withFunction = { ...consumer, work: () => 'work-1' }
    expect(
      await runtime.releaseDelivery(release('op-2', retained, { consumer: withFunction })),
    ).toEqual({
      failure: { kind: 'invalid', field: 'consumer.work', reason: 'type' },
    })
    const withExtra = { ...consumer, note: 'extra' }
    expect(
      await runtime.releaseDelivery(release('op-2', retained, { consumer: withExtra })),
    ).toEqual({
      failure: { kind: 'invalid', field: 'consumer.note', reason: 'unknown-field' },
    })
    const extraProof = { kind: 'retained', custody: { ...evidence('kept', consumer.owner), x: 1 } }
    expect(
      await runtime.releaseDelivery(release('op-2', retained, { evidence: extraProof })),
    ).toEqual({
      failure: { kind: 'invalid', field: 'evidence.custody.x', reason: 'unknown-field' },
    })
    expect(await runtime.releaseDelivery(release('op-2', retained, { consumer: null }))).toEqual({
      failure: { kind: 'invalid', field: 'consumer', reason: 'type' },
    })
    expect(store.commits).toBe(1)
    ok(await runtime.releaseDelivery(release('op-2', retained)))
  })

  it('16 release: a second release answers the released state and writes nothing more', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const released = ok(await runtime.releaseDelivery(release('op-2', retained)))
    expect(await runtime.releaseDelivery(release('op-2', retained))).toEqual({ ok: released })
    expect(await runtime.releaseDelivery(release('op-3', processed))).toEqual({ ok: released })
    expect(store.commits).toBe(2)
  })

  it('16 release: another consumer position is a conflict and the delivery stays pending', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const other = { ...consumer, position: 'position-2' }
    expect(await runtime.releaseDelivery(release('op-2', retained, { consumer: other }))).toEqual({
      failure: { kind: 'conflict', operation: 'op-1' },
    })
    const found = ok(
      await runtime.lookup({ ...release('op-2', retained), admission: operationId('op-1') }),
    )
    expect(found.kind === 'found' && found.state.delivery?.kind).toBe('pending')
  })

  it('16 release: evidence that the consumer does not own, a wrong delivery and an unknown version are refused', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    const foreign: Handoff = { kind: 'retained', custody: evidence('kept', 'someone-else') }
    expect(await runtime.releaseDelivery(release('op-2', foreign))).toEqual({
      failure: { kind: 'invalid', field: 'evidence.custody.owner', reason: 'owner-mismatch' },
    })
    expect(await runtime.releaseDelivery(release('op-2', retained, { delivery: 'd9' }))).toEqual({
      failure: { kind: 'invalid', field: 'delivery', reason: 'mismatch' },
    })
    expect(await runtime.releaseDelivery(release('op-2', retained, { result: 'v9' }))).toEqual({
      failure: { kind: 'invalid', field: 'result', reason: 'unknown-version' },
    })
    expect(
      await runtime.releaseDelivery(release('op-2', retained, { evidence: { kind: 'kept' } })),
    ).toEqual({
      failure: { kind: 'invalid', field: 'evidence.kind', reason: 'value' },
    })
  })

  it('16 release: the same operation with another handoff is a conflict', async () => {
    const { runtime } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    ok(await runtime.releaseDelivery(release('op-2', retained)))
    expect(await runtime.releaseDelivery(release('op-2', processed))).toEqual({
      failure: { kind: 'conflict', operation: 'op-2' },
    })
  })

  it('16 release: an unknown commit keeps the responsibility until the operation is recognised', async () => {
    const { runtime, store } = harness()
    ok(await runtime.admit(admission('call-1', 'op-1', dummyRequest())))
    store.injectCommit('unknown-applied')
    expect(await runtime.releaseDelivery(release('op-2', retained))).toEqual({
      failure: { kind: 'commit-unknown', operation: 'op-2' },
    })
    const resolved = ok(await runtime.queryOperation({ ...release('op-2', retained) }))
    expect(resolved.kind).toBe('committed')
    expect(await runtime.releaseDelivery(release('op-2', retained))).toMatchObject({
      ok: { kind: 'released' },
    })
    expect(store.commits).toBe(2)
  })
})
