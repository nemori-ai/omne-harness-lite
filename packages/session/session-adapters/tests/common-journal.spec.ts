import { ordinaryInput, assistantMessage } from '@omne-harness/session-contract/testing'
import { decodeInputId } from '@omne-harness/agent-contract'
import { describe, it, expect } from 'vitest'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'

describe('common Session log', () => {
  it('creates Session and opens Agent from its original grant', async () => {
    const { view, access, execution, opened } = await scene()
    const snapshot = ok(await view.journal.load({ ...access, execution }))
    expect(snapshot.entries).toEqual([])
    expect(snapshot.revision).toBe(opened.receipt.revision)
    const recalled = ok(
      await view.journal.query({ ...access, execution, operation: operation('open') }),
    )
    expect(recalled.kind).toBe('committed')
  })
})

it('can finalize after scanning an observed-only tail without a cursor-only write', async () => {
  const { backend, view, access, execution, opened, input } = await scene('observed-tail')
  const loaded = ok(await view.journal.load({ ...access, execution }))
  const batch = ok(
    await view.journal.inputs({ ...access, execution, watermark: loaded.inputWatermark }),
  )
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('take'),
      authority: opened.authority,
      expected: loaded.revision,
      checkpoint: { ...input.checkpoint, inputBatch: batch.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: batch.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
  ok(
    await backend.controls.interpret({
      ...access,
      execution,
      operation: operationId('interpret-take'),
      sequence: '1',
    }),
  )
  const value = ordinaryInput('input-2')
  ok(
    await backend.transactions.commit({
      access,
      command: {
        kind: 'accept',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('accept-2'),
          value,
        },
      },
      guards: [],
    }),
  )
  const submitted = ok(
    await view.journal.submit({
      ...access,
      execution,
      operation: operation('submit-2'),
      value: {
        id: ok(decodeInputId(value.input)),
        source: value.origin,
        content: value.message,
        priority: 'ordinary',
      },
    }),
  )
  const message = assistantMessage('answer')
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('message-tail'),
      authority: opened.authority,
      expected: submitted.revision,
      checkpoint: { ...input.checkpoint, inputBatch: batch.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'message', message, source: evidence('message-admission') }],
      effects: [],
      caller: {
        kind: 'message',
        message,
        source: evidence('message-source'),
        admission: evidence('message-admission'),
      },
      replyAdmission: null,
    }),
  )
  const before = ok(await backend.transactions.readWork(access))
  await backend.controls.interpret({
    ...access,
    execution,
    operation: operationId('observe-tail'),
    sequence: '2',
  })
  ok(
    await backend.transactions.commit({
      access,
      command: {
        kind: 'freeze',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('freeze'),
          verdict: { cause: 'tool-shape-lost', evidence: evidence('freeze') },
        },
      },
      guards: [],
    }),
  )
  if (before.run.kind !== 'active') throw new Error('not active')
  const command = {
    kind: 'control' as const,
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('cancel'),
      intent: { kind: 'cancel-run' as const, run: before.run.run, urgency: 'force' as const },
    },
  }
  const final = await backend.transactions.commit({ access, command, guards: [] })
  expect(final).toHaveProperty('ok')
})
