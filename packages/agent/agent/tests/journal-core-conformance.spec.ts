// The memory Journal against the core conformance suite of the contract's `./testing` entry
// (SPEC "并发与提交", "托管协调与运行实例"): the facts every binding, standalone or coordinated,
// answers alike. The session-adapters Journal runs the same suite on its own fixture.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import type { AgentJournal } from '@omne-harness/agent-contract'
import {
  agentJournalCoreConformance,
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
  type TestHostRecord,
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

type Journal = AgentJournal<string>
type Opened = AgentJournalCoreOpened<string>

const fixture: AgentJournalCoreFixture<string> = {
  async open(name, options = {}) {
    const hostRecords = new Map<string, TestHostRecord>()
    const installed = options.cancellationPolicy !== 'absent'
    const memory = createMemoryAgentJournal<string>({
      coordination: 'standalone',
      hostRecords,
      ...(installed
        ? {
            cancellation: {
              installation: testCancellationPolicyInstallation,
              policy: createTestCancellationPolicy(),
            },
          }
        : {}),
    })
    const opened = await open(memory.port, name)
    return {
      journal: memory.port,
      access,
      execution: opened.execution,
      receipt: opened.receipt,
      authority: opened.authority,
      checkpoint: checkpoint(),
      installation: installed ? testCancellationPolicyInstallation : null,
      hostRecord: async record => {
        const source = evidence(`host/${hostRecords.size + 1}/${record.kind}`)
        hostRecords.set(source.record, record)
        return source
      },
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
      await entry.run()
    })
  }
})

/** The fixture with the memory Journal of each opened execution wrapped by `decorate`. */
function decorated(
  decorate: (journal: Journal, opened: Opened) => Journal,
): AgentJournalCoreFixture<string> {
  return {
    async open(name) {
      const opened = await fixture.open(name)
      return { ...opened, journal: decorate(opened.journal, opened) }
    },
  }
}

/** The names of the cases that fail for `fixture`; a case that passes contributes nothing. */
async function failing(fixture: AgentJournalCoreFixture<string>): Promise<string[]> {
  const names: string[] = []
  for (const entry of agentJournalCoreConformance(fixture)) {
    try {
      await entry.run()
    } catch {
      names.push(entry.name)
    }
  }
  return names
}

/**
 * The suite turns red for a Journal that breaks one rule (S1 review I3): each decorator below keeps
 * every other answer of the memory Journal and breaks exactly one of the facts the suite states.
 */
describe('the core conformance suite fails a Journal that breaks one of its rules', () => {
  it('the retry of a committed commit answers conflict instead of the original result', async () => {
    const seen = new Set<string>()
    const names = await failing(
      decorated(journal => ({
        ...journal,
        async commit(input) {
          if (seen.has(input.operation))
            return fail({ kind: 'conflict', operation: input.operation })
          seen.add(input.operation)
          return journal.commit(input)
        },
      })),
    )
    expect(names.length).toBeGreaterThanOrEqual(1)
  })

  it('a new submit after ended is accepted instead of terminal', async () => {
    const names = await failing(
      decorated((journal, opened) => ({
        ...journal,
        async submit(input) {
          const answered = await journal.submit(input)
          if ('failure' in answered && answered.failure.kind === 'terminal')
            return succeed({ ...opened.receipt, operation: input.operation })
          return answered
        },
      })),
    )
    expect(names.length).toBeGreaterThanOrEqual(1)
  })

  it('a commit with a stale expected revision answers changed before terminal', async () => {
    const names = await failing(
      decorated((journal, opened) => ({
        ...journal,
        async commit(input) {
          const answered = await journal.commit(input)
          if ('failure' in answered && answered.failure.kind === 'terminal') {
            const latest = await journal.load({ ...opened.access, execution: input.execution })
            if ('ok' in latest && latest.ok.revision !== input.expected)
              return fail({ kind: 'changed' })
          }
          return answered
        },
      })),
    )
    expect(names.length).toBeGreaterThanOrEqual(1)
  })
})
