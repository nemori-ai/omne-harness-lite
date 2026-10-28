import { describe, it } from 'vitest'
import {
  agentJournalEntriesConformance,
  type AgentJournalEntriesFixture,
} from '@omne-harness/agent-contract/testing'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import {
  access,
  otherTenant,
  acceptedInput,
  checkpoint,
  instance,
  operation,
  evidence,
  ok,
} from './journal-support.ts'

function fixture() {
  const memory = createMemoryAgentJournal<string>()
  const journal = memory.port
  const received = memory.provider.received
  if (received === null) throw new Error('joint provider required')
  const entriesFixture: AgentJournalEntriesFixture<string> = {
    access,
    otherAccess: otherTenant,
    entries: memory.provider.entries,
    async open(who, execution) {
      return ok(
        await journal.open({
          ...who,
          execution,
          operation: operation(`open-${execution}`),
          instance: instance(),
          grant: null,
          initial: acceptedInput('initial'),
          checkpoint: checkpoint(),
        }),
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
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
        }),
      )
      snapshot = ok(await journal.load({ ...who, execution }))
      ok(
        await journal.tryFinish({
          ...who,
          execution,
          operation: operation(`finish-${execution}`),
          authorization: { kind: 'advancement', authority },
          expected: snapshot.revision,
          intent: {
            conclusion: { kind: 'complete' },
            inputWatermark: snapshot.inputWatermark,
            obligations: evidence('obligations'),
            beforeTerminal: evidence('before'),
            failure: null,
          },
        }),
      )
    },
    async read(who, execution) {
      const loaded = await journal.load({ ...who, execution })
      return 'ok' in loaded ? loaded.ok.entries : undefined
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
  }))
    it(scenario.name, scenario.run)
})
