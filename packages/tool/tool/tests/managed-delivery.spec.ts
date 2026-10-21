import { describe, expect, it } from 'vitest'
import { readToolInvocationRef, readToolOperationRef } from '@omne-harness/tool-contract'
import type {
  Handoff,
  ToolReleaseDeliveryOutcome,
  ReleasedDelivery,
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
  operationId,
  principalA,
  referenceFor,
  tenantA,
  textOf,
} from './runtime-values.ts'

const consumer = dummyRequest().consumer
const retained: Handoff = { kind: 'retained', custody: evidence('kept', consumer.owner) }
const processed: Handoff = { kind: 'processed', completion: evidence('done', consumer.owner) }

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

function releasedReceipt(outcome: ToolReleaseDeliveryOutcome): ReleasedDelivery {
  if (outcome.kind !== 'released') throw new Error(`expected released: ${JSON.stringify(outcome)}`)
  return outcome.receipt
}

describe('16 delivery release (P08)', () => {
  it.each([
    ['retained', retained],
    ['processed', processed],
  ])('16 release: the %s path releases the delivery with a Tool-side receipt', async (_, proof) => {
    const assembly = harness()
    const invoked = await assembly.admitInternal(dummyRequest())
    if (invoked.kind !== 'accepted') throw new Error('not admitted')
    const lookupInput = {
      principal: principalA,
      tenant: tenantA,
      reference: invoked.reference,
    }
    const before = ok(await assembly.runtime.queries.lookup(lookupInput))
    if (before.kind !== 'found') throw new Error('lost the call')
    expect(judged(before.state)).toMatchObject({
      phase: 'settled',
      result: 'v1',
      delivery: { kind: 'pending', delivery: 'd1', consumer },
    })
    const released = releasedReceipt(
      await assembly.runtime.commands.releaseDelivery(release(proof)),
    )
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
    expect(judged(found.state)).toMatchObject({ phase: 'settled', result: 'v1' })
    expect(judged(found.state).delivery).toEqual(released)
    expect(invoked.state.delivery).toEqual(before.state.delivery)
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
    await assembly.admitInternal(dummyRequest())
    const released = releasedReceipt(
      await assembly.runtime.commands.releaseDelivery(release(retained)),
    )
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
    await assembly.admitInternal(dummyRequest())
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
    releasedReceipt(await assembly.runtime.commands.releaseDelivery(release(retained)))
  })

  it('16 release: a second release answers the released state and writes nothing more', async () => {
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
    const released = releasedReceipt(
      await assembly.runtime.commands.releaseDelivery(release(retained)),
    )
    expect(await assembly.runtime.commands.releaseDelivery(release(retained))).toEqual({
      kind: 'released',
      receipt: released,
    })
    expect(await assembly.runtime.commands.releaseDelivery(release(processed))).toEqual({
      kind: 'released',
      receipt: released,
    })
    expect(assembly.store.commits).toBe(2)
  })

  it('16 release: another consumer position is a conflict and the delivery stays pending', async () => {
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
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
    await assembly.admitInternal(dummyRequest())
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

  it('16 release: the same operation with another handoff is a conflict', async () => {
    const assembly = harness()
    await assembly.admitInternal(dummyRequest())
    const { reference: _reference, ...payload } = release(retained)
    const mutation = {
      ...payload,
      call: callId('call-1'),
      operation: operationId('op-2'),
    }
    const released = ok(await assembly.ledger.commands.releaseDelivery(mutation))
    expect(await assembly.ledger.commands.releaseDelivery(mutation)).toEqual({ ok: released })
    expect(
      await assembly.ledger.commands.releaseDelivery({ ...mutation, evidence: processed }),
    ).toEqual({ failure: { kind: 'conflict', operation: 'op-2' } })
    expect(assembly.store.commits).toBe(2)
  })

  it.each([
    { path: 'retained', proof: retained, fault: 'unknown-dropped' },
    { path: 'processed', proof: processed, fault: 'unknown-dropped' },
    { path: 'retained', proof: retained, fault: 'unknown-applied' },
    { path: 'processed', proof: processed, fault: 'unknown-applied' },
  ] as const)(
    '16 release: $path recognises the original operation after $fault without losing delivery or content',
    async ({ proof, fault }) => {
      const assembly = harness()
      const invoked = await assembly.runtime.invoke({
        principal: principalA,
        tenant: tenantA,
        request: dummyRequest(),
      })
      if (invoked.kind !== 'accepted' || invoked.state.phase !== 'settled')
        throw new Error('fixture did not settle')
      const pending = invoked.state.delivery
      if (pending === null || pending.kind !== 'pending')
        throw new Error('fixture delivery was not pending')
      const { call, admission } = readToolInvocationRef(invoked.reference)
      const access = { principal: principalA, tenant: tenantA, reference: invoked.reference }
      const readInput = { ...access, result: invoked.state.result, after: null }
      const originalPage = ok(await assembly.runtime.queries.readResult(readInput))
      const tasks = () =>
        assembly.ledger.commands
          .loadRecovery({ principal: principalA, tenant: tenantA, call })
          .then(ok)
          .then(recovery => recovery.tasks.filter(task => task.kind === 'deliver'))
      const originalTasks = await tasks()
      expect(originalTasks).toEqual([
        {
          kind: 'deliver',
          operation: admission,
          state: 'pending',
          diagnostic: null,
          result: invoked.state.result,
          delivery: pending.delivery,
          consumer,
        },
      ])
      expect(originalPage.value.content.map(textOf).join('')).toContain('tool unavailable')
      const input = {
        ...access,
        result: invoked.state.result,
        delivery: pending.delivery,
        consumer,
        evidence: proof,
      }
      const before = assembly.store.commits
      assembly.store.injectCommit(fault)
      const unknown = await assembly.runtime.commands.releaseDelivery(input)
      if (unknown.kind !== 'commit-unknown')
        throw new Error(`expected commit-unknown: ${JSON.stringify(unknown)}`)
      const operation = readToolOperationRef(unknown.operation)
      expect(operation).toMatchObject({ tenant: tenantA, call, admission })
      expect(operation.operation).not.toBe(admission)
      expect(assembly.store.commits).toBe(before + 1)

      const query = { principal: principalA, tenant: tenantA, operation: unknown.operation }
      assembly.store.injectRead('unavailable')
      expect(await assembly.runtime.queries.queryOperation(query)).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'ledger-store' },
      })
      expect(assembly.store.commits).toBe(before + 1)
      const resolution = ok(await assembly.runtime.queries.queryOperation(query))
      const found = ok(await assembly.runtime.queries.lookup(access))
      if (found.kind !== 'found' || found.state.phase !== 'settled')
        throw new Error('lost the settled call')
      expect(found.state.result).toBe(invoked.state.result)
      expect(ok(await assembly.runtime.queries.readResult(readInput))).toEqual(originalPage)

      const saved = await assembly.store.read({ kind: 'call', tenant: tenantA, call })
      if (saved.kind !== 'complete') throw new Error('fixture store unreadable')
      const originalOperation = saved.records.find(
        record => record.kind === 'operation' && record.operation.operation === operation.operation,
      )
      if (fault === 'unknown-dropped') {
        expect(resolution).toEqual({ kind: 'not-committed' })
        expect(originalOperation).toBeUndefined()
        expect(judged(found.state).delivery).toEqual(pending)
        expect(await tasks()).toEqual(originalTasks)
      } else {
        if (resolution.kind !== 'committed' || originalOperation?.kind !== 'operation')
          throw new Error('lost the committed release operation')
        expect(resolution.revision).toBe(originalOperation.operation.revision)
        expect(resolution.receipt).toMatchObject({
          owner: '@omne-harness/tool',
          revision: originalOperation.operation.revision,
          record: `operation:${JSON.stringify({
            call,
            operation: operation.operation,
            tenant: { account: tenantA.account.text, organization: tenantA.organization.text },
          })}`,
        })
        expect(originalOperation.operation.receipt).toEqual({
          kind: 'release-delivery',
          delivery: found.state.delivery,
        })
        expect(found.state.delivery).toMatchObject({
          kind: 'released',
          delivery: pending.delivery,
          consumer,
          evidence: { owner: '@omne-harness/tool' },
        })
        expect(await tasks()).toEqual([])
      }

      const beforeExplicitRelease = assembly.store.commits
      const released = releasedReceipt(await assembly.runtime.commands.releaseDelivery(input))
      expect(assembly.store.commits).toBe(
        beforeExplicitRelease + (fault === 'unknown-dropped' ? 1 : 0),
      )
      if (fault === 'unknown-applied') expect(released).toEqual(found.state.delivery)
      expect(released.evidence.owner).toBe('@omne-harness/tool')
      expect(released.evidence).not.toEqual(
        proof.kind === 'retained' ? proof.custody : proof.completion,
      )
      const final = ok(await assembly.runtime.queries.lookup(access))
      expect(final).toMatchObject({ kind: 'found', state: { delivery: released } })
      expect(await tasks()).toEqual([])
      expect(ok(await assembly.runtime.queries.readResult(readInput))).toEqual(originalPage)
      expect(ok(await assembly.runtime.queries.queryOperation(query))).toEqual(resolution)
      const commits = assembly.store.commits
      expect(await assembly.runtime.commands.releaseDelivery(input)).toEqual({
        kind: 'released',
        receipt: released,
      })
      expect(assembly.store.commits).toBe(commits)
    },
  )
})
