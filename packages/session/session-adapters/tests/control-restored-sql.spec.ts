import { expect, it } from 'vitest'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { keptToolCall } from './fixtures/tool-call.ts'

it('a tool control read back from the store takes its next stage: the operation it has not named yet is null, not absent', async () => {
  const s = await sqlScene('control-restored')
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const tool = await keptToolCall({ view: s.view, access: s.access, execution: s.execution })
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    const waits = [{ kind: 'producer' as const, pending: tool.pending }]
    ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('tool-wait'),
        authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, batch: tool.batch },
        state: { kind: 'waiting', waits },
        events: [{ kind: 'waiting', waits }],
        effects: [{ action: tool.pending.action, pending: tool.pending, authority }],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const target = operation('withdraw')
    ok(
      await journal.control({
        ...s.access,
        execution: s.execution,
        operation: target,
        command: { kind: 'withdraw-tool', call: tool.call, reason: evidence('withdraw') },
      }),
    )
    // A replica that has only the store: every record of the execution is rebuilt from the facts.
    const cold = s.fresh().journal
    const restored = ok(await cold.load({ ...s.access, execution: s.execution })).controls
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ operation: target, toolOperation: null })
    const staged = await cold.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation('withdraw-intent'),
      target,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    })
    expect(staged).toMatchObject({ ok: { state: 'applied' } })
  } finally {
    await s.close()
  }
})
