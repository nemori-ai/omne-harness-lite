// The session-log Journal against the core conformance suite of the Agent contract's `./testing`
// entry (Agent SPEC "并发与提交", "托管协调与运行实例"): the facts every binding answers alike. The
// Agent memory Journal runs the same suite on its own fixture. Each case opens its own Session
// scene; the first input is handed over so that an ordinary end is not blocked on the Session side.
import { describe, expect, it } from 'vitest'
import {
  agentJournalCoreConformance,
  type AgentJournalCoreFixture,
} from '@omne-harness/agent-contract/testing'
import { operationId } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence, instance } from './fixtures/common-journal.ts'
import { accept, handed } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

const fixture: AgentJournalCoreFixture<string> = {
  async open(name) {
    const s = await scene(`core-${name}`)
    ok(await handed(s))
    return {
      journal: s.view.journal,
      access: s.access,
      execution: s.execution,
      receipt: s.opened.receipt,
      authority: s.opened.authority,
      checkpoint: s.input.checkpoint,
      acceptInput: label => accept(s, `input-${label}`),
      produceResult: async label => {
        const tool = toolCall(s.access.tenant, label)
        const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
        const attachment = loaded.executionAttachment
        if (attachment === null) throw new Error('an active attachment is expected')
        ok(
          await s.view.journal.commit({
            ...s.access,
            execution: s.execution,
            operation: operation(`pending-${label}`),
            authority: attachment,
            expected: loaded.revision,
            checkpoint: { ...loaded.checkpoint, batch: tool.batch },
            state: { kind: 'advancing' },
            events: [],
            effects: [
              { action: tool.pending.action, pending: tool.pending, authority: attachment },
            ],
            caller: { kind: 'none' },
            replyAdmission: null,
          }),
        )
        return {
          result: tool.placeholder,
          consumption: tool.pending.consumption,
          transfer: {
            kind: 'custody',
            result: tool.placeholder,
            consumption: tool.pending.consumption,
            retained: evidence(`custody-${label}`),
          },
        }
      },
      faultNext: (method, outcome) =>
        s.view.controls.failNext(method, { kind: 'commit-unknown', outcome }),
      takeover: async label => {
        const before = ok(await s.backend.transactions.readWork(s.access))
        if (before.run.kind !== 'active') throw new Error('active Run expected')
        const claimed = ok(
          await s.backend.transactions.commit({
            access: s.access,
            command: {
              kind: 'claim',
              input: {
                tenant: s.access.tenant,
                session: s.access.session,
                operation: operationId(`claim-${label}`),
                run: before.run.run,
                instance: { owner: 'agent', id: label },
                continuity: evidence(`continuity-${label}`),
              },
            },
            guards: [],
          }),
        )
        return ok(
          await s.view.journal.attach({
            ...s.access,
            execution: s.execution,
            operation: operation(`attach-${label}`),
            instance: instance(label),
            grant: claimed.receipt.source,
            recovery: evidence(`recovery-${label}`),
            takeover: evidence(`takeover-${label}`),
          }),
        ).authority
      },
    }
  },
}

describe('the session-log Journal passes the core conformance suite', () => {
  for (const entry of agentJournalCoreConformance(fixture)) {
    it(entry.name, async () => {
      expect('uncovered' in entry, 'the session fixture covers every case').toBe(false)
      await entry.run()
    })
  }
})
