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
      evidence: { owner: '@omne-harness/tool', record: 'delivery:call-1/v1/d1' },
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
    const other = { ...consumer, position: 'step-2' }
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
