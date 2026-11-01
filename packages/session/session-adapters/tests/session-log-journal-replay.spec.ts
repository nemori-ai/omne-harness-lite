// AG-23 on the production Journal: the traces of the finishing model replayed step by step onto
// the session-log Journal provider over SQL (the node:sqlite double of the Session log
// combination). Each trace opens its own Session scene; the Session side records the handover of
// every input the Agent accepted, as the memory scene does.
import { describe, it } from 'vitest'
import {
  agentJournalReplayConformance,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
} from '@omne-harness/agent-contract/testing'
import {
  decodeInputId,
  type AgentJournal,
  type DurableEvidence,
} from '@omne-harness/agent-contract'
import { guard, operationId, ordinaryInput } from '@omne-harness/session-contract/testing'
import { evidence, instance, ok, operation } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { toolCall } from './fixtures/tool-call.ts'

async function accept(s: SqlScene, label: string) {
  const value = ordinaryInput(`input-${label}`)
  ok(
    await s.port.commit({
      access: s.sessionAccess,
      command: {
        kind: 'accept',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId(`accept-${label}`),
          value,
        },
      },
      guards: [guard('evidence-bridge', 'ordinary-intake', value)],
    }),
  )
  return {
    id: ok(decodeInputId(`input-${label}`)),
    source: value.origin,
    content: value.message,
    priority: 'ordinary' as const,
  }
}

/**
 * `durable`: every Journal call of the replay goes to a new provider, which has no in-process copy
 * and rebuilds the records of the session from storage first.
 */
const fixtureOf = (mode: 'kept' | 'durable'): AgentJournalCoreFixture<string> => ({
  async open(name) {
    const s = await sqlScene(`replay-${mode}-${name}`.slice(0, 48), { cancellation: 'installed' })
    const opened = ok(await s.view.journal.open(s.openInput))
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    const handedOver = new Set<string>()
    const base = mode === 'kept' ? s.view.journal : routed(() => s.fresh().journal)
    const journal: typeof s.view.journal = {
      ...base,
      async submit(input) {
        const answered = await base.submit(input)
        if (
          'ok' in answered &&
          input.lineage.kind === 'new-input' &&
          !handedOver.has(input.value.id)
        ) {
          handedOver.add(input.value.id)
          ok(await handed(s, input.value.id, answered.ok.evidence as DurableEvidence))
        }
        return answered
      },
    }
    return {
      journal,
      access: s.access,
      execution: s.execution,
      receipt: opened.receipt,
      authority: opened.authority,
      checkpoint: s.checkpoint,
      installation: testCancellationPolicyInstallation,
      acceptInput: label => accept(s, label),
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
      faultNext: (_method, outcome) => {
        if (outcome === 'applied') s.controls?.loseNextReply()
        else s.controls?.dropNext()
      },
      takeover: async label => {
        const before = ok(await s.port.readWork(s.sessionAccess))
        if (before.run.kind !== 'active') throw new Error('active Run expected')
        const claimed = ok(
          await s.port.commit({
            access: s.sessionAccess,
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
})

/** A Journal whose every call goes to the Journal `next()` gives at that call. */
function routed(next: () => AgentJournal<string>): AgentJournal<string> {
  const journal = next()
  const call =
    <K extends Exclude<keyof AgentJournal<string>, 'capabilities' | 'output'>>(name: K) =>
    (input: Parameters<AgentJournal<string>[K]>[0]) =>
      (next()[name] as (value: typeof input) => ReturnType<AgentJournal<string>[K]>)(input)
  return {
    capabilities: journal.capabilities,
    open: call('open'),
    attach: call('attach'),
    detach: call('detach'),
    commit: call('commit'),
    submit: call('submit'),
    control: call('control'),
    acknowledge: call('acknowledge'),
    recordResult: call('recordResult'),
    recordControl: call('recordControl'),
    recordHandoff: call('recordHandoff'),
    prepareFinish: call('prepareFinish'),
    tryFinish: call('tryFinish'),
    commitSettlement: call('commitSettlement'),
    recordTerminalObservation: call('recordTerminalObservation'),
    load: call('load'),
    inputs: call('inputs'),
    readReplyAdmissions: call('readReplyAdmissions'),
    query: call('query'),
    output: {
      read: input => next().output.read(input),
      events: input => next().output.events(input),
    },
  }
}

for (const mode of ['kept', 'durable'] as const)
  describe(`the production session-log Journal replays the traces of the finishing model (AG-23, ${mode} copy)`, () => {
    for (const entry of agentJournalReplayConformance(fixtureOf(mode))) {
      it(entry.name, async () => {
        await entry.run()
      })
    }
  })
