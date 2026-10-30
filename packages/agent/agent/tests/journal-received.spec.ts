import { describe, it } from 'vitest'
import type { AgentEvent, EventPage, JournalCommit } from '@omne-harness/agent-contract'
import {
  agentJournalEntriesConformance,
  type AgentJournalEntriesFixture,
} from '@omne-harness/agent-contract/testing'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import {
  acceptedInput,
  access,
  checkpoint,
  evidence,
  instance,
  ok,
  openInput,
  operation,
  otherTenant,
} from './journal-support.ts'

function fixture() {
  const memory = createMemoryAgentJournal<string>({ coordination: 'standalone' })
  const journal = memory.port
  const received = memory.provider.received
  if (received === null) throw new Error('joint provider required')
  const entriesFixture: AgentJournalEntriesFixture<string> = {
    access,
    otherAccess: otherTenant,
    entries: memory.provider.entries,
    async open(who, execution) {
      return ok(
        await journal.open(
          openInput({
            ...who,
            execution,
            operation: operation(`open-${execution}`),
            instance: instance(),
            grant: null,
            initial: acceptedInput('initial'),
            checkpoint: checkpoint(),
          }),
        ),
      ).authority
    },
    async supersede(who, execution) {
      return ok(
        await journal.attach({
          ...who,
          execution,
          operation: operation(`attach-${execution}`),
          instance: instance('replacement'),
          grant: null,
          takeover: evidence('takeover'),
          recovery: evidence('recovery'),
        }),
      ).authority
    },
    async end(who, execution) {
      let snapshot = ok(await journal.load({ ...who, execution }))
      const authority = snapshot.executionAttachment
      if (!authority) throw new Error('expected attachment')
      const inputs = ok(
        await journal.inputs({ ...who, execution, watermark: snapshot.inputWatermark }),
      )
      ok(
        await journal.commit({
          ...who,
          execution,
          operation: operation(`take-${execution}`),
          authority,
          expected: snapshot.revision,
          checkpoint: { ...snapshot.checkpoint, inputBatch: inputs.batch.id },
          state: { kind: 'advancing' },
          handoff: null,
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          finish: null,
        }),
      )
      // F1, F2, prepareFinish, load, then tryFinish with the projection (SPEC "条件终结").
      const settling = async (name: string, finish: JournalCommit<string>['finish']) => {
        snapshot = ok(await journal.load({ ...who, execution }))
        ok(
          await journal.commit({
            ...who,
            execution,
            operation: operation(`${name}-${execution}`),
            authority,
            expected: snapshot.revision,
            checkpoint: { ...snapshot.checkpoint, position: name },
            state: { kind: 'settling' },
            handoff: null,
            events: [],
            effects: [],
            caller: { kind: 'none' },
            replyAdmission: null,
            finish,
          }),
        )
      }
      await settling('F1', {
        origin: evidence('origin'),
        conclusion: { kind: 'complete' },
        failure: null,
        inputWatermark: snapshot.inputWatermark,
        conditions: evidence('conditions'),
      })
      await settling('F2', null)
      snapshot = ok(await journal.load({ ...who, execution }))
      ok(
        await journal.prepareFinish({
          ...who,
          execution,
          operation: operation(`prepare-${execution}`),
          authorization: { kind: 'advancement', authority },
          expected: snapshot.revision,
          candidate: snapshot.settlement.candidate?.candidate ?? operation('none'),
        }),
      )
      snapshot = ok(await journal.load({ ...who, execution }))
      if (snapshot.state.kind !== 'settling') throw new Error('expected settling')
      ok(
        await journal.tryFinish({
          ...who,
          execution,
          operation: operation(`finish-${execution}`),
          authorization: { kind: 'advancement', authority },
          expected: snapshot.revision,
          intent: snapshot.state.intent,
        }),
      )
    },
    async detach(who, execution) {
      const snapshot = ok(await journal.load({ ...who, execution }))
      const authority = snapshot.executionAttachment
      if (!authority) throw new Error('expected attachment')
      ok(
        await journal.detach({
          ...who,
          execution,
          operation: operation(`detach-${execution}`),
          authority,
          reason: evidence('detach'),
        }),
      )
    },
    // The memory Journal scripts the next `record` call of any execution; the suite only scripts
    // one execution at a time, so the two readings meet.
    async failNextRecord(_who, _execution, fault) {
      memory.failNext('record', fault)
    },
    async read(who, execution) {
      const loaded = await journal.load({ ...who, execution })
      return 'ok' in loaded ? loaded.ok.entries : undefined
    },
    async events(who, execution) {
      const events: AgentEvent[] = []
      let after: string | null = null
      for (;;) {
        const page: EventPage = ok(
          await journal.output.read({ ...who, execution, after, limit: 100 }),
        )
        if (page.kind !== 'page') throw new Error('expected a page')
        events.push(...page.events)
        if (page.caughtUp) return events
        after = page.next
      }
    },
  }
  const joint = {
    ...memory.receiving,
    ...memory.provider,
    received,
    async inspect(who: typeof access, execution: Parameters<typeof memory.receiving.inspect>[1]) {
      const stats = await memory.receiving.inspect(who, execution)
      return { ...stats, revision: stats.revision - 1 }
    },
  }
  return { entriesFixture, joint }
}

describe('one memory Journal received provider', () => {
  const { entriesFixture, joint } = fixture()
  for (const scenario of agentJournalEntriesConformance(entriesFixture, {
    received: 'required',
    joint,
  })) {
    // A case the fixture cannot drive is reported as skipped with its reason, never as green.
    if ('uncovered' in scenario) it.skip(`${scenario.name} (${scenario.uncovered})`, scenario.run)
    else it(scenario.name, scenario.run)
  }
})
