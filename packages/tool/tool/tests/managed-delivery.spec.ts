import { describe, expect, it } from 'vitest'
import type {
  Handoff,
  ToolCommandOutcome,
  ToolDeliveryId,
  ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  callId,
  dummyRequest,
  evidence,
  harness,
  judged,
  ok,
  principalA,
  referenceFor,
  tenantA,
  textOf,
} from './runtime-values.ts'

const consumer = dummyRequest().consumer
const retained: Handoff = { kind: 'retained', custody: evidence('kept', consumer.owner) }
const processed: Handoff = { kind: 'processed', completion: evidence('done', consumer.owner) }

/**
 * The releaseDelivery of the default dummy's result `v1`/delivery `d1` of the call admitted
 * first (`call-1`/`op-1` by the identity counter). The operation identity is the runtime's:
 * minted fresh for each command.
 */
function release(evidenceOf: Handoff, overrides: Record<string, unknown> = {}) {
  return {
    principal: principalA,
    tenant: tenantA,
    reference: referenceFor('call-1', 'op-1'),
    result: 'v1' as ToolResultVersion,
    delivery: 'd1' as ToolDeliveryId,
    consumer,
    evidence: evidenceOf,
    ...overrides,
  }
}

/** The receipt of a committed command outcome, or a test failure with the actual one. */
function committed<T>(outcome: ToolCommandOutcome<T>): T {
  if (outcome.kind !== 'committed')
    throw new Error(`expected committed: ${JSON.stringify(outcome)}`)
  return outcome.receipt
}

describe('16 delivery release (P08)', () => {
  it.each([
    ['retained', retained],
    ['processed', processed],
  ])('16 release: the %s path releases the delivery with a Tool-side receipt', async (_, proof) => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const released = committed(await assembly.runtime.commands.releaseDelivery(release(proof)))
    expect(released).toMatchObject({
      kind: 'released',
      delivery: 'd1',
      consumer,
      evidence: {
        owner: '@omne-harness/tool',
        record: `delivery:{"call":"call-1","delivery":"d1","result":"v1","tenant":{"account":"${tenantA.account.text}","organization":"${tenantA.organization.text}"}}`,
      },
    })
    // The receipt is minted by Tool, not the consumer's evidence echoed back.
    if (released.kind === 'released')
      expect(released.evidence).not.toEqual(evidence('kept', consumer.owner))
    const found = ok(
      await assembly.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: assembly.referenceOf('call-1'),
      }),
    )
    if (found.kind !== 'found') throw new Error('lost the call')
    expect(judged(found.state).delivery).toEqual(released)
    // The full text stays readable after the release.
    const page = ok(
      await assembly.runtime.queries.readResult({
        principal: principalA,
        tenant: tenantA,
        reference: assembly.referenceOf('call-1'),
        result: 'v1' as ToolResultVersion,
        after: null,
      }),
    )
    expect(page.value.content.map(textOf).join('')).toContain('tool unavailable')
  })

  it('16 release: one commit releases the result, records the receipt and the state, and removes the deliver task', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const released = committed(await assembly.runtime.commands.releaseDelivery(release(retained)))
    expect(assembly.store.commits).toBe(2)
    const read = await assembly.store.read({
      kind: 'call',
      tenant: tenantA,
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
      { operation: { operation: 'op-cmd-1', revision: '2', receipt: { delivery: released } } },
    ])
  })

  it('16 release: the release of a call that was never admitted is an unknown call', async () => {
    const assembly = harness()
    expect(await assembly.runtime.commands.releaseDelivery(release(retained))).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'call', reason: 'unknown-call' },
    })
    expect(assembly.store.commits).toBe(0)
  })

  it('16 release: the consumer and the handoff are closed values, checked before any digest', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const withFunction = { ...consumer, work: () => 'work-1' }
    expect(
      await assembly.runtime.commands.releaseDelivery(
        release(retained, { consumer: withFunction }),
      ),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'consumer.work', reason: 'type' },
    })
    const withExtra = { ...consumer, note: 'extra' }
    expect(
      await assembly.runtime.commands.releaseDelivery(release(retained, { consumer: withExtra })),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'consumer.note', reason: 'unknown-field' },
    })
    const extraProof = { kind: 'retained', custody: { ...evidence('kept', consumer.owner), x: 1 } }
    expect(
      await assembly.runtime.commands.releaseDelivery(release(retained, { evidence: extraProof })),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'evidence.custody.x', reason: 'unknown-field' },
    })
    expect(
      await assembly.runtime.commands.releaseDelivery(release(retained, { consumer: null })),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'consumer', reason: 'type' },
    })
    expect(assembly.store.commits).toBe(1)
    committed(await assembly.runtime.commands.releaseDelivery(release(retained)))
  })

  it('16 release: a second release answers the released state and writes nothing more', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const released = committed(await assembly.runtime.commands.releaseDelivery(release(retained)))
    expect(await assembly.runtime.commands.releaseDelivery(release(retained))).toEqual({
      kind: 'committed',
      operation: expect.any(String),
      receipt: released,
    })
    expect(await assembly.runtime.commands.releaseDelivery(release(processed))).toEqual({
      kind: 'committed',
      operation: expect.any(String),
      receipt: released,
    })
    expect(assembly.store.commits).toBe(2)
  })

  it('16 release: another consumer position is a conflict and the delivery stays pending', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const other = { ...consumer, position: 'position-2' }
    expect(
      await assembly.runtime.commands.releaseDelivery(release(retained, { consumer: other })),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'conflict', operation: 'op-1' },
    })
    const found = ok(
      await assembly.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: assembly.referenceOf('call-1'),
      }),
    )
    expect(found.kind === 'found' && found.state.delivery?.kind).toBe('pending')
  })

  it('16 release: evidence that the consumer does not own, a wrong delivery and an unknown version are refused', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    const foreign: Handoff = { kind: 'retained', custody: evidence('kept', 'someone-else') }
    expect(await assembly.runtime.commands.releaseDelivery(release(foreign))).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'evidence.custody.owner', reason: 'owner-mismatch' },
    })
    expect(
      await assembly.runtime.commands.releaseDelivery(
        release(retained, { delivery: 'd9' as ToolDeliveryId }),
      ),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'delivery', reason: 'mismatch' },
    })
    expect(
      await assembly.runtime.commands.releaseDelivery(
        release(retained, { result: 'v9' as ToolResultVersion }),
      ),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'result', reason: 'unknown-version' },
    })
    expect(
      await assembly.runtime.commands.releaseDelivery(
        release(retained, { evidence: { kind: 'kept' } }),
      ),
    ).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'evidence.kind', reason: 'value' },
    })
  })

  it('16 release: an unknown commit keeps the responsibility until the operation is recognised', async () => {
    const assembly = harness()
    await assembly.invoke(dummyRequest())
    assembly.store.injectCommit('unknown-applied')
    const unknown = await assembly.runtime.commands.releaseDelivery(release(retained))
    if (unknown.kind !== 'commit-unknown')
      throw new Error(`expected commit-unknown: ${JSON.stringify(unknown)}`)
    const resolved = ok(
      await assembly.runtime.queries.queryOperation({
        principal: principalA,
        tenant: tenantA,
        operation: unknown.operation,
      }),
    )
    expect(resolved.kind).toBe('committed')
    expect(await assembly.runtime.commands.releaseDelivery(release(retained))).toMatchObject({
      kind: 'committed',
      receipt: { kind: 'released' },
    })
    expect(assembly.store.commits).toBe(2)
  })
})
