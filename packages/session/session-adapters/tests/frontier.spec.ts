import { it, expect } from 'vitest'
import { scene, ok, operation, operationId, evidence } from './fixtures/common-journal.ts'

it('frozen cancellation first interprets the complete captured suffix, including waiting after Q disappears', async () => {
  const { backend, view, access, execution, opened, input } = await scene('frontier', {
    entries: 1,
    bytes: 512,
    capacityBytes: 1024 * 1024,
  })
  const loaded = ok(await view.journal.load({ ...access, execution })),
    page = ok(await view.journal.inputs({ ...access, execution, watermark: loaded.inputWatermark }))
  ok(
    await view.journal.commit({
      ...access,
      execution,
      operation: operation('taken-and-wait'),
      authority: opened.authority,
      expected: loaded.revision,
      checkpoint: { ...input.checkpoint, inputBatch: page.batch.id },
      state: {
        kind: 'waiting',
        waits: [{ kind: 'dependency', owner: 'test', position: 'before_model' }],
      },
      events: [
        { kind: 'input-taken', batch: page.batch },
        {
          kind: 'waiting',
          waits: [{ kind: 'dependency', owner: 'test', position: 'before_model' }],
        },
      ],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
    }),
  )
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
  const state = ok(await backend.transactions.readWork(access))
  if (state.run.kind !== 'active') throw new Error('active expected')
  const command = {
    kind: 'control' as const,
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('cancel'),
      intent: { kind: 'cancel-run' as const, run: state.run.run, urgency: 'force' as const },
    },
  }
  ok(await backend.transactions.commit({ access, command, guards: [] }))
  const rows = backend.controls.entriesOf(access.tenant, access.session),
    kinds = rows.map(row => row.kind)
  expect(kinds.indexOf('run.batch-taken')).toBeGreaterThan(kinds.indexOf('session.frozen'))
  expect(kinds.indexOf('extension.passage')).toBeGreaterThan(kinds.indexOf('run.batch-taken'))
  expect(kinds.indexOf('run.terminal')).toBeGreaterThan(kinds.indexOf('extension.passage'))
  expect(ok(await backend.transactions.readWork(access)).pending).toEqual([])
  expect(backend.controls.frontierMetrics().yields).toBeGreaterThan(0)
  const count = rows.length
  ok(await backend.transactions.commit({ access, command, guards: [] }))
  expect(backend.controls.entriesOf(access.tenant, access.session)).toHaveLength(count)
})
