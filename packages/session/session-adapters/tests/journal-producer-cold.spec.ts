import { expect, it } from 'vitest'
import { readExecutionInterpretation } from '../src/cordis/agent-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import { toolCall } from './fixtures/tool-call.ts'

it('publishes the original producer registration from a cold caller without a prior waiting event', async () => {
  const s = await sqlScene('cold-producer-registration')
  try {
    const opened = ok(await s.view.journal.open(s.openInput))
    const tool = toolCall(s.access.tenant)
    const call = {
      ...s.access,
      execution: s.execution,
      authority: opened.authority,
      state: { kind: 'advancing' as const },
      caller: { kind: 'none' as const },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }
    const intended = ok(
      await s.view.journal.commit({
        ...call,
        operation: operation('intend'),
        expected: opened.receipt.revision,
        checkpoint: { ...s.checkpoint, calls: [tool.pending], batch: tool.batch },
        effects: [
          { action: tool.pending.action, pending: tool.pending, authority: opened.authority },
        ],
        events: [],
      }),
    )
    const cold = s.fresh().journal
    const loaded = ok(await cold.load({ ...s.access, execution: s.execution }))
    ok(
      await cold.commit({
        ...call,
        operation: operation('produce'),
        expected: intended.revision,
        checkpoint: loaded.checkpoint,
        effects: [],
        events: [
          { kind: 'producer', result: tool.placeholder, consumption: tool.pending.consumption },
        ],
      }),
    )
    const read = await readExecutionInterpretation(
      {
        storage: s.storage,
        tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
      },
      { tenant: s.access.tenant, session: s.access.session, execution: s.execution, after: '0' },
    )
    expect(read.kind).toBe('read')
    if (read.kind !== 'read') throw new Error('interpretation must be readable')
    expect(
      read.execution?.events.flatMap(event => event.consequences ?? []).map(item => item.kind),
    ).toContain('call-registration')
  } finally {
    await s.close()
  }
})
