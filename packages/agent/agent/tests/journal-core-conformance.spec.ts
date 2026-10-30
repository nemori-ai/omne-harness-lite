// The memory Journal against the core conformance suite of the contract's `./testing` entry
// (SPEC "并发与提交", "托管协调与运行实例"): the facts every binding, standalone or coordinated,
// answers alike. The session-adapters Journal runs the same suite on its own fixture.
import { describe, expect, it } from 'vitest'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import {
  agentJournalCoreConformance,
  type AgentJournalCoreFixture,
} from '@omne-harness/agent-contract/testing'
import {
  acceptedInput,
  access,
  checkpoint,
  consumption,
  evidence,
  instance,
  ok,
  open,
  operation,
  producedResult,
} from './journal-support.ts'

const fixture: AgentJournalCoreFixture<string> = {
  async open(name) {
    const memory = createMemoryAgentJournal<string>({ coordination: 'standalone' })
    const opened = await open(memory.port, name)
    return {
      journal: memory.port,
      access,
      execution: opened.execution,
      receipt: opened.receipt,
      authority: opened.authority,
      checkpoint: checkpoint(),
      acceptInput: async label => acceptedInput(`input-${label}`),
      produceResult: async label => {
        const result = producedResult(label)
        const owned = consumption(`consumption-${label}`)
        return {
          result,
          consumption: owned,
          transfer: { kind: 'processed', result, consumption: owned, completion: evidence('done') },
        }
      },
      faultNext: (method, outcome) => memory.failNext(method, { kind: 'commit-unknown', outcome }),
      takeover: async label =>
        ok(
          await memory.port.attach({
            ...access,
            execution: opened.execution,
            operation: operation(`takeover-${label}`),
            instance: instance(`instance-${label}`),
            grant: null,
            recovery: evidence('recovery'),
            takeover: evidence('takeover'),
          }),
        ).authority,
    }
  },
}

describe('the memory Journal passes the core conformance suite', () => {
  for (const entry of agentJournalCoreConformance(fixture)) {
    it(entry.name, async () => {
      expect('uncovered' in entry, 'the memory fixture covers every case').toBe(false)
      await entry.run()
    })
  }
})
