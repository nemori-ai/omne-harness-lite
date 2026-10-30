import { it, expect } from 'vitest'
import { decodeActionId, type PendingCall, type ProducedResult } from '@omne-harness/agent-contract'
import { sampleReceivedModelResult } from '@omne-harness/agent-contract/testing'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { scene, ok, operation, operationId, evidence, instance } from './fixtures/common-journal.ts'
import { toolCall } from './fixtures/tool-call.ts'

function modelCall(tenant: Parameters<typeof sampleReceivedModelResult>[0]) {
  const entry = sampleReceivedModelResult(tenant, 'normalization')
  if (entry.delivery.producer !== 'model') throw new Error('model expected')
  const pending: PendingCall = {
    kind: 'model',
    purpose: 'extension',
    reference: entry.delivery.key.reference,
    action: ok(decodeActionId('model-action')),
    consumption: entry.consumption,
    position: entry.consumer,
    fixed: evidence('model-request'),
  }
  const result: ProducedResult = {
    producer: {
      kind: 'model',
      call: ok(resolveModelInvocationRef(pending.reference, tenant)).call,
    },
    version: '1',
    delivery: 'original-delivery',
    source: evidence('model-result'),
  }
  return { pending, result }
}
it('registers multiple producers with their original purposes and keeps event sequence independent of the later head', async () => {
  const s = await scene('multiple-producers'),
    tool = toolCall(s.access.tenant),
    model = modelCall(s.access.tenant),
    calls = [tool.pending, model.pending],
    waits = calls.map(pending => ({ kind: 'producer' as const, pending }))
  let receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('wait'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: calls.map(pending => ({
        pending,
        action: pending.action,
        authority: s.opened.authority,
      })),
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  // The first head commit moves the checkpoint back and writes; the next two establish no new
  // fact, so they recognize the current revision without a write (Agent SPEC "执行修订").
  let written = receipt
  for (let i = 0; i < 3; i++) {
    receipt = ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`head-${i}`),
        authority: s.opened.authority,
        expected: receipt.revision,
        checkpoint: s.checkpoint,
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    if (i === 0) written = receipt
    else expect(receipt.revision).toBe(written.revision)
  }
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('waiting'),
    }),
  )
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  expect(snapshot.callRegistrations?.map(item => item.registration.purpose)).toEqual([
    'action',
    'extension',
  ])
  expect(snapshot.run.kind === 'active' && snapshot.run.execution).toMatchObject({
    revision: '3',
    readThrough: '1',
    evidence: written.evidence,
  })
  const rows = s.backend.controls
    .entriesOf(s.access.tenant, s.access.session)
    .filter(
      row =>
        row.kind === 'call.bound' ||
        row.kind === 'extension.passage' ||
        row.kind === 'history.annotated',
    )
  expect(new Set(rows.map(row => row.revision)).size).toBe(1)
})
it('a producer event uses the original effect after checkpoint movement and remains bound to its initiating attempt', async () => {
  const s = await scene('producer-first'),
    model = modelCall(s.access.tenant)
  let receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('original-effect'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [model.pending] },
      state: { kind: 'advancing' },
      events: [],
      effects: [
        { pending: model.pending, action: model.pending.action, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const before = ok(await s.backend.transactions.readWork(s.access))
  if (before.run.kind !== 'active') throw new Error('active expected')
  const old = before.run.advance!.attempt
  const claimed = ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'claim',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('claim'),
          run: before.run.run,
          instance: { owner: 'agent', id: 'new' },
          continuity: evidence('continuity'),
        },
      },
      guards: [],
    }),
  )
  const attached = ok(
    await s.view.journal.attach({
      ...s.access,
      execution: s.execution,
      operation: operation('attach-new'),
      instance: instance('new'),
      grant: claimed.receipt.source,
      recovery: evidence('recovery'),
      takeover: evidence('takeover'),
    }),
  )
  receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('producer'),
      authority: attached.authority,
      expected: attached.receipt.revision,
      checkpoint: s.checkpoint,
      state: { kind: 'advancing' },
      events: [{ kind: 'producer', result: model.result, consumption: model.pending.consumption }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('producer'),
    }),
  )
  expect(
    ok(await s.backend.transactions.readWork(s.access)).consumptions[0]?.binding.initiatingAttempt,
  ).toBe(old)
  expect(receipt.revision).not.toBe('1')
})
it('an unassociated Tool intent retains its original identity when a later event supplies the actual invocation', async () => {
  const s = await scene('intent-association'),
    tool = toolCall(s.access.tenant),
    { reference: _reference, ...rest } = tool.pending,
    intent: PendingCall = { ...rest, association: 'intent' }
  let receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('intent'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [intent] },
      state: { kind: 'waiting', waits: [{ kind: 'producer', pending: intent }] },
      events: [{ kind: 'waiting', waits: [{ kind: 'producer', pending: intent }] }],
      effects: [{ pending: intent, action: intent.action, authority: s.opened.authority }],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('intent'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).consumptions).toEqual([])
  receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('associate'),
      authority: s.opened.authority,
      expected: receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [tool.pending] },
      state: { kind: 'waiting', waits: [{ kind: 'producer', pending: tool.pending }] },
      events: [{ kind: 'waiting', waits: [{ kind: 'producer', pending: tool.pending }] }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '2',
      operation: operationId('associate'),
    }),
  )
  const after = ok(await s.backend.transactions.readWork(s.access)),
    root = s.view.controls.root()
  expect(after.callRegistrations).toHaveLength(1)
  expect(after.consumptions[0]?.id).toBe(tool.pending.consumption)
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('intent'),
    }),
  )
  expect(s.view.controls.root()).toBe(root)
})
