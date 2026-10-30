import { ordinaryInput, assistantMessage } from '@omne-harness/session-contract/testing'
import { decodeInputId } from '@omne-harness/agent-contract'
import { sampleStartFence } from '@omne-harness/agent-contract/testing'
import { describe, it, expect } from 'vitest'
import {
  scene,
  ok,
  operation,
  operationId,
  evidence,
  submitInput,
} from './fixtures/common-journal.ts'

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
  const { backend, view, access, execution, opened, checkpoint } = await scene('observed-tail')
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
      checkpoint: { ...checkpoint, inputBatch: batch.batch.id },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: batch.batch }],
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
    await view.journal.submit(
      submitInput(access, execution, operation('submit-2'), {
        id: ok(decodeInputId(value.input)),
        source: value.origin,
        content: value.message,
        priority: 'ordinary',
      }),
    ),
  )
  const message = assistantMessage('answer')
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('message-tail'),
      authority: opened.authority,
      expected: submitted.revision,
      checkpoint: { ...checkpoint, inputBatch: batch.batch.id },
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
      handoff: null,
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

// Red when the `entry` event of a recorded condition is normalized to anything but `observed`: the
// Session has no consequence of its own for it (session-contract EC-01), and a later decision that
// scans the uninterpreted tail accepts only a tail whose every event is observed.
it('interprets the entry event of a recorded condition as observed, with no Session consequence', async () => {
  const { backend, view, access, execution, opened } = await scene('entry-observed')
  ok(
    await view.entries.record({
      ...access,
      execution,
      operation: operation('fence'),
      authority: opened.authority,
      entry: sampleStartFence('observed'),
    }),
  )
  const page = ok(await view.journal.output.read({ ...access, execution, after: null, limit: 10 }))
  if (page.kind !== 'page') throw new Error('retention gap')
  expect(page.events.map(event => event.body.kind)).toEqual(['entry'])
  const before = backend.controls.entriesOf(access.tenant, access.session).length
  expect(
    ok(
      await backend.controls.interpret({
        ...access,
        execution,
        operation: operationId('interpret-entry'),
        sequence: page.events[0]!.sequence,
      }),
    ),
  ).toBeNull()
  expect(backend.controls.entriesOf(access.tenant, access.session)).toHaveLength(before)
  const work = ok(await backend.transactions.readWork(access))
  if (work.run.kind !== 'active') throw new Error('not active')
  expect(work.run.execution.readThrough).toBe('0')
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
  const final = await backend.transactions.commit({
    access,
    command: {
      kind: 'control',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId('cancel'),
        intent: { kind: 'cancel-run', run: work.run.run, urgency: 'force' },
      },
    },
    guards: [],
  })
  expect(final).toHaveProperty('ok')
})
