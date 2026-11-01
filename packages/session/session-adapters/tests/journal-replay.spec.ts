// The session-log Journal against the trace replay of the Agent contract's `./testing` entry
// (AG-23): the behaviors the TLC simulation of the finishing model exported are replayed step by
// step, and the violating behaviors of the negative controls are reported at their forbidden last
// step. The Agent memory Journal runs the same replay on its own fixture. Each trace opens its own
// Session scene; the Session side records the handover of every input the Agent accepted, so an
// ordinary end is not blocked on the Session side (a Session write after the Journal answered).
import { describe, it } from 'vitest'
import {
  agentJournalReplayConformance,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
} from '@omne-harness/agent-contract/testing'
import { operationId } from '@omne-harness/session-contract/testing'
import { evidence, instance, ok, operation, scene } from './fixtures/common-journal.ts'
import { accept, handed } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

const fixture: AgentJournalCoreFixture<string> = {
  async open(name) {
    const s = await scene(
      `replay-${name}`.slice(0, 48),
      undefined,
      { agent: true, session: true },
      { cancellationPolicy: 'installed' },
    )
    ok(await handed(s))
    const handedOver = new Set<string>()
    const journal: typeof s.view.journal = {
      ...s.view.journal,
      async submit(input) {
        const answered = await s.view.journal.submit(input)
        if (
          'ok' in answered &&
          input.lineage.kind === 'new-input' &&
          !handedOver.has(input.value.id)
        ) {
          handedOver.add(input.value.id)
          ok(await handed(s, { id: input.value.id, receipt: answered.ok.evidence }))
        }
        return answered
      },
    }
    return {
      journal,
      access: s.access,
      execution: s.execution,
      receipt: s.opened.receipt,
      authority: s.opened.authority,
      checkpoint: s.checkpoint,
      installation: testCancellationPolicyInstallation,
      acceptInput: label => accept(s, `input-${label}`),
      // A Tool call whose effect intent the execution saves under the current attachment.
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
            handoff: null,
            finish: null,
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

describe('the session-log Journal replays the traces of the finishing model', () => {
  for (const entry of agentJournalReplayConformance(fixture)) {
    it(entry.name, async () => {
      await entry.run()
    })
  }
})
