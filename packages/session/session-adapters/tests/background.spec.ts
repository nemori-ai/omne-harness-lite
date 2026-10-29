import { it, expect } from 'vitest'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'
import { toolCall } from './fixtures/tool-call.ts'

it('reconciles a true background slot through a later snapshot, retaining the original slot after checkpoint replacement', async () => {
  const { backend, view, access, execution, opened, input } = await scene('background'),
    tool = toolCall(access.tenant)
  let receipt = ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('tool-wait'),
      authority: opened.authority,
      expected: opened.receipt.revision,
      checkpoint: { ...input.checkpoint, batch: tool.batch },
      state: { kind: 'waiting', waits: [{ kind: 'producer', pending: tool.pending }] },
      events: [{ kind: 'waiting', waits: [{ kind: 'producer', pending: tool.pending }] }],
      effects: [
        { action: tool.pending.action, pending: tool.pending, authority: opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  ok(
    await backend.controls.interpret({
      ...access,
      execution,
      sequence: '1',
      operation: operationId('interpret-wait'),
    }),
  )
  const control = operationId('background'),
    producer = { kind: 'tool' as const, call: tool.pending.reference }
  ok(
    await backend.transactions.commit({
      command: {
        kind: 'control',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: control,
          intent: { kind: 'background-tool', producer },
        },
      },
      guards: [],
    }),
  )
  const target = operation(deriveDriveOperation({ kind: 'control', execution, control }))
  receipt = ok(
    await view.journal.control({
      ...access,
      execution,
      operation: target,
      command: { kind: 'background-tool', call: tool.call, reason: evidence('request-background') },
    }),
  )
  for (const stage of ['intent-established', 'producer-confirmed'] as const)
    receipt = ok(
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
      operation: operationId('interpret-confirmed'),
    }),
  )
  expect(ok(await backend.transactions.readWork(access)).controls[0]?.pending).toEqual([producer])
  receipt = ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('slot'),
      authority: opened.authority,
      expected: receipt.revision,
      checkpoint: { ...input.checkpoint, batch: tool.background },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  receipt = ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('replace-checkpoint'),
      authority: opened.authority,
      expected: receipt.revision,
      checkpoint: input.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  const before = ok(await backend.transactions.readWork(access)),
    after = ok(
      await backend.controls.reconcile({
        ...access,
        execution,
        operation: operationId('snapshot-background'),
      }),
    )
  expect(after).not.toBeNull()
  const state = ok(await backend.transactions.readWork(access))
  expect(state.controls[0]).toMatchObject({ state: 'reconciled', pending: [] })
  if (before.run.kind !== 'active' || state.run.kind !== 'active') throw new Error('wrong Run')
  expect(state.run.execution.readThrough).toBe(before.run.execution.readThrough)
  expect(state.run.execution.revision).toBe(receipt.revision)
  expect(
    ok(await view.journal.load({ ...access, execution })).controls[0]?.stages['duty-released'],
  ).toBeUndefined()
})
it('a real background slot may predate K, but cannot replace its original propagated intent', async () => {
  const s = await scene('background-before-K'),
    tool = toolCall(s.access.tenant),
    waits = [{ kind: 'producer' as const, pending: tool.pending }]
  let receipt = ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('slot-first'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.input.checkpoint, batch: tool.background },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { pending: tool.pending, action: tool.pending.action, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
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
  const control = operationId('background'),
    target = operation(deriveDriveOperation({ kind: 'control', execution: s.execution, control }))
  ok(
    await s.backend.transactions.commit({
      command: {
        kind: 'control',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: control,
          intent: {
            kind: 'background-tool',
            producer: { kind: 'tool', call: tool.pending.reference },
          },
        },
      },
      guards: [],
    }),
  )
  ok(
    await s.backend.controls.reconcile({
      ...s.access,
      execution: s.execution,
      operation: operationId('before-intent'),
    }),
  )
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.pending).toHaveLength(1)
  receipt = ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: target,
      command: { kind: 'background-tool', call: tool.call, reason: evidence('background') },
    }),
  )
  receipt = ok(
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
  const snapshot = { ...s.access, execution: s.execution, operation: operationId('snapshot') }
  s.backend.controls.faultSession(snapshot, 'after-publish')
  expect(await s.backend.controls.reconcile(snapshot)).toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  const root = s.view.controls.root()
  ok(await s.backend.controls.reconcile(snapshot))
  expect(s.view.controls.root()).toBe(root)
  expect(ok(await s.backend.transactions.readWork(s.access)).controls[0]?.state).toBe('reconciled')
  expect(receipt.revision).not.toBe('1')
})
for (const variant of [
  'wrong-call',
  'wrong-action',
  'missing-confirmation',
  'wrong-consumption',
  'not-approved',
] as const)
  it(`rejects a background-shaped checkpoint with ${variant} at the original publication`, async () => {
    const s = await scene(`background-negative-${variant}`),
      tool = toolCall(s.access.tenant),
      other = toolCall(s.access.tenant, 'other'),
      slot = tool.background.slots[0]!
    const batch = {
      ...tool.background,
      ...(variant === 'not-approved'
        ? { barrier: { kind: 'all-denied' as const, evidence: evidence('denied') } }
        : {}),
      actions:
        variant === 'wrong-consumption'
          ? tool.background.actions.map(action => ({
              ...action,
              call: { ...tool.pending, consumption: other.pending.consumption },
            }))
          : tool.background.actions,
      slots: [
        variant === 'wrong-call'
          ? { ...slot, placeholder: { ...slot.placeholder, producer: other.placeholder.producer } }
          : variant === 'wrong-action'
            ? { ...slot, action: other.pending.action }
            : variant === 'missing-confirmation'
              ? { ...slot, confirmation: { ...slot.confirmation, digest: '' } }
              : slot,
      ],
    }
    const root = s.view.controls.root(),
      result = await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('bad-slot'),
        authority: s.opened.authority,
        expected: s.opened.receipt.revision,
        checkpoint: { ...s.input.checkpoint, batch },
        state: { kind: 'advancing' },
        events: [],
        effects: [
          { pending: tool.pending, action: tool.pending.action, authority: s.opened.authority },
        ],
        caller: { kind: 'none' },
        replyAdmission: null,
      })
    expect(result).toHaveProperty('failure')
    expect(s.view.controls.root()).toBe(root)
  })
