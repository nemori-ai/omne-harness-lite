import { it, expect } from 'vitest'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import {
  scene,
  ok,
  operation,
  operationId,
  evidence,
  submitInput,
} from './fixtures/common-journal.ts'

it('accepted alone cannot reconcile cancellation and the original independent stages remain distinct', async () => {
  const { backend, view, access, execution, opened, checkpoint } = await scene('cancel-stages')
  const loaded = ok(await view.journal.load({ ...access, execution })),
    page = ok(await view.journal.inputs({ ...access, execution, watermark: loaded.inputWatermark }))
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('take'),
      authority: opened.authority,
      expected: loaded.revision,
      checkpoint: { ...checkpoint, inputBatch: page.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  ok(
    await backend.controls.interpret({
      ...access,
      execution,
      sequence: '1',
      operation: operationId('interpret-take'),
    }),
  )
  const before = ok(await backend.transactions.readWork(access))
  if (before.run.kind !== 'active') throw new Error('no active Run')
  const control = operationId('cancel')
  ok(
    await backend.transactions.commit({
      access,
      command: {
        kind: 'control',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: control,
          intent: { kind: 'cancel-run', run: before.run.run, urgency: 'force' },
        },
      },
      guards: [],
    }),
  )
  const target = operation(deriveDriveOperation({ kind: 'control', execution, control }))
  ok(
    await view.journal.control({
      ...access,
      execution,
      operation: target,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  const initial = ok(
    await backend.controls.interpret({
      ...access,
      execution,
      sequence: '2',
      operation: operationId('interpret-accepted'),
    }),
  )
  expect(initial).toBeNull()
  expect(
    ok(await backend.transactions.readWork(access)).controls.find(
      item => item.operation === control,
    )?.state,
  ).toBe('propagating')
  for (const stage of ['intent-established', 'qualification-revoked'] as const)
    ok(
      await view.journal.recordControl({
        ...access,
        execution,
        operation: operation(stage),
        target,
        stage,
        state: 'reached',
        source: evidence(stage),
      }),
    )
  ok(
    await backend.controls.interpret({
      ...access,
      execution,
      sequence: '4',
      operation: operationId('interpret-qualified'),
    }),
  )
  expect(
    ok(await backend.transactions.readWork(access)).controls.find(
      item => item.operation === control,
    )?.state,
  ).toBe('reconciled')
  const stored = ok(await view.journal.load({ ...access, execution })).controls[0]!
  expect(stored.stages['duty-released']).toBeUndefined()
  expect(stored.stages['physically-stopped']).toBeUndefined()
  expect(stored.stages['producer-confirmed']).toBeUndefined()
})

it('an unrelated independent Agent control is observed without inventing a Session control', async () => {
  const { backend, view, access, execution } = await scene('independent-control')
  ok(
    await view.journal.control({
      ...access,
      execution,
      operation: operation('independent'),
      command: { kind: 'cancel', reason: evidence('independent') },
    }),
  )
  const before = backend.controls.entriesOf(access.tenant, access.session).length
  expect(
    ok(
      await backend.controls.interpret({
        ...access,
        execution,
        sequence: '1',
        operation: operationId('observe-control'),
      }),
    ),
  ).toBeNull()
  expect(backend.controls.entriesOf(access.tenant, access.session)).toHaveLength(before)
  expect(ok(await backend.transactions.readWork(access)).controls).toEqual([])
})
import { toolCall } from './fixtures/tool-call.ts'
import { cancel } from './fixtures/progression.ts'
import type { PendingCall } from '@omne-harness/agent-contract'

it('producer confirmation and physical stop cannot discharge the selected unassociated duties', async () => {
  const s = await scene('original-U'),
    tools = [toolCall(s.access.tenant, 'one'), toolCall(s.access.tenant, 'two')],
    calls = tools.map(tool => {
      const { reference: _reference, ...pending } = tool.pending
      return { ...pending, association: 'intent' } as PendingCall
    }),
    waits = calls.map(pending => ({ kind: 'producer' as const, pending }))
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('intents'),
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
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('waiting'),
    }),
  )
  ok(await cancel(s))
  const target = operation(
    deriveDriveOperation({
      kind: 'control',
      execution: s.execution,
      control: operationId('cancel'),
    }),
  )
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: target,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  let sequence = 2
  for (const stage of [
    'intent-established',
    'qualification-revoked',
    'producer-confirmed',
    'physically-stopped',
  ] as const) {
    ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation(stage),
        target,
        stage,
        state: 'reached',
        source: evidence(stage),
      }),
    )
    sequence++
  }
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: String(sequence),
      operation: operationId('before-duty'),
    }),
  )
  const before = ok(await s.backend.transactions.readWork(s.access))
  expect(before.controls[0]?.pendingUnassociatedWaiting).toHaveLength(2)
  expect(before.controls[0]?.state).not.toBe('reconciled')
  expect(before.waiting).toEqual([])
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('duty'),
      target,
      stage: 'duty-released',
      state: 'reached',
      source: evidence('custodian'),
    }),
  )
  sequence++
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: String(sequence),
      operation: operationId('duty'),
    }),
  )
  const after = ok(await s.backend.transactions.readWork(s.access))
  expect(after.controls[0]).toMatchObject({ pendingUnassociatedWaiting: [], state: 'reconciled' })
  expect(after.waiting).toEqual([])
})
it('an original completed Tool slot clears direct stopping only after the corresponding K intent is propagated', async () => {
  const s = await scene('already-completed-tool'),
    tool = toolCall(s.access.tenant),
    slot = tool.background.slots[0]!,
    batch = {
      ...tool.batch,
      slots: [
        {
          action: slot.action,
          each: null,
          candidate: null,
          handoff: null,
          kind: 'result' as const,
          result: tool.placeholder,
          terminal: { kind: 'completed' as const },
          custody: evidence('custody'),
        },
      ],
    },
    waits = [{ kind: 'producer' as const, pending: tool.pending }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('completed'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, batch },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('waiting'),
    }),
  )
  const control = operationId('stop'),
    target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
  ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'control',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: control,
          intent: { kind: 'stop-call', producer: { kind: 'tool', call: tool.pending.reference } },
        },
      },
      guards: [],
    }),
  )
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: target,
      command: { kind: 'interrupt-tool', call: tool.call, reason: evidence('stop') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('intent'),
      target,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('completed-proof'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]).toMatchObject({
    state: 'reconciled',
    pending: [],
  })
})

import { decodeToolWaitId } from '@omne-harness/tool-contract/provider'
for (const proof of ['no-response', 'placeholder', 'late'] as const)
  it(`does not use a ${proof} Tool slot as pre-interrupt completion`, async () => {
    const s = await scene(`tool-stop-${proof}`),
      tool = toolCall(s.access.tenant),
      slot = tool.background.slots[0]!,
      waits = [{ kind: 'producer' as const, pending: tool.pending }]
    const completed = {
      ...tool.batch,
      slots: [
        {
          action: slot.action,
          each: null,
          candidate: null,
          handoff: null,
          kind: 'result' as const,
          result: tool.placeholder,
          terminal:
            proof === 'no-response'
              ? {
                  kind: 'no-response' as const,
                  wait: ok(decodeToolWaitId('wait')),
                  reason: 'no response',
                }
              : { kind: 'completed' as const },
          custody: evidence('custody'),
        },
      ],
    }
    const batch =
      proof === 'placeholder' ? tool.background : proof === 'late' ? tool.batch : completed
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('original'),
        authority: s.opened.authority,
        expected: s.opened.receipt.revision,
        checkpoint: { ...s.checkpoint, batch },
        state: { kind: 'waiting', waits },
        events: [{ kind: 'waiting', waits }],
        effects: [
          { action: tool.pending.action, pending: tool.pending, authority: s.opened.authority },
        ],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
      }),
    )
    ok(
      await s.backend.controls.interpret({
        ...s.access,
        execution: s.execution,
        sequence: '1',
        operation: operationId('waiting'),
      }),
    )
    const control = operationId('stop'),
      target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
    ok(
      await s.backend.transactions.commit({
        access: s.access,
        command: {
          kind: 'control',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: control,
            intent: { kind: 'stop-call', producer: { kind: 'tool', call: tool.pending.reference } },
          },
        },
        guards: [],
      }),
    )
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: target,
        command: { kind: 'interrupt-tool', call: tool.call, reason: evidence('stop') },
      }),
    )
    const receipt = ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation('intent'),
        target,
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    if (proof === 'late')
      ok(
        await s.view.journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation('late-result'),
          authority: s.opened.authority,
          expected: receipt.revision,
          checkpoint: { ...s.checkpoint, batch: completed },
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
        }),
      )
    ok(
      await s.backend.controls.reconcile({
        ...s.access,
        execution: s.execution,
        operation: operationId('snapshot'),
      }),
    )
    expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.pending).toHaveLength(1)
  })

it('reconciles each original same-call K independently and requires its own propagated intent', async () => {
  const s = await scene('two-original-controls'),
    tool = toolCall(s.access.tenant),
    waits = [{ kind: 'producer' as const, pending: tool.pending }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, batch: tool.batch },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { pending: tool.pending, action: tool.pending.action, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
    }),
  )
  ok(
    await s.backend.controls.interpret({
      ...s.access,
      execution: s.execution,
      sequence: '1',
      operation: operationId('waiting'),
    }),
  )
  const targets = []
  for (const name of ['one', 'two']) {
    const control = operationId(name),
      target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
    targets.push(target)
    ok(
      await s.backend.transactions.commit({
        access: s.access,
        command: {
          kind: 'control',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: control,
            intent: { kind: 'stop-call', producer: { kind: 'tool', call: tool.pending.reference } },
          },
        },
        guards: [],
      }),
    )
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: target,
        command: { kind: 'interrupt-tool', call: tool.call, reason: evidence(name) },
      }),
    )
  }
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('first-confirmation'),
      target: targets[0]!,
      stage: 'producer-confirmed',
      state: 'reached',
      source: evidence('first-confirmation'),
    }),
  )
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('before-intents'),
    }),
  )
  const pending = ok(await s.backend.transactions.readWork(s.access)).controls
  expect(pending[0]?.state).not.toBe('reconciled')
  expect(pending[1]?.pending).toHaveLength(1)
  for (const [index, target] of targets.entries()) {
    ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation(`intent-${index}`),
        target,
        stage: 'intent-established',
        state: 'reached',
        source: evidence(`intent-${index}`),
      }),
    )
    if (index === 1)
      ok(
        await s.view.journal.recordControl({
          ...s.access,
          execution: s.execution,
          operation: operation('second-confirmation'),
          target,
          stage: 'producer-confirmed',
          state: 'reached',
          source: evidence('second-confirmation'),
        }),
      )
  }
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('both'),
    }),
  )
  expect(
    ok(await s.backend.transactions.readWork(s.access)).controls.map(item => item.state),
  ).toEqual(['reconciled', 'reconciled'])
  const progress = s.backend.controls
    .entriesOf(s.access.tenant, s.access.session)
    .filter(row => row.kind === 'control.progress')
    .slice(-2)
  expect(progress).toHaveLength(2)
  expect(progress[0]?.revision).toBe(progress[1]?.revision)
})

import { decodeInputId } from '@omne-harness/agent-contract'
import { ordinaryInput } from '@omne-harness/session-contract/testing'
it('urgent interruption is propagated by the original submit without fabricating an Agent control record', async () => {
  const s = await scene('urgent-submit'),
    snapshot = ok(await s.backend.transactions.readWork(s.access)),
    urgent = ordinaryInput('urgent')
  if (snapshot.run.kind !== 'active') throw new Error('active Run expected')
  ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'interrupt',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId('urgent'),
          run: snapshot.run.run,
          urgent,
          decision: evidence('human'),
        },
      },
      guards: [],
    }),
  )
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('before-submit'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.state).toBe('propagating')
  const request = submitInput(
    s.access,
    s.execution,
    operation(
      deriveDriveOperation({ kind: 'submit', execution: s.execution, input: urgent.input }),
    ),
    {
      id: ok(decodeInputId(urgent.input)),
      content: urgent.message,
      source: urgent.origin,
      priority: 'urgent',
    },
  )
  ok(await s.view.journal.submit(request))
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('after-submit'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.state).toBe('reconciled')
  expect(ok(await s.view.journal.load({ ...s.access, execution: s.execution })).controls).toEqual(
    [],
  )
})
