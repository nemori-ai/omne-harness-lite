// The memory Journal against the core conformance suite of the contract's `./testing` entry
// (SPEC "并发与提交", "托管协调与运行实例"): the facts every binding, standalone or coordinated,
// answers alike. The session-adapters Journal runs the same suite on its own fixture.
import { beforeAll, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import type { AgentJournal, PendingCall } from '@omne-harness/agent-contract'
import {
  agentJournalCoreConformance,
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
  type SettlementQualification,
  type TestHostRecord,
} from '@omne-harness/agent-contract/testing'
import { decodeModelOperationId, encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  acceptedInput,
  access,
  checkpoint,
  commitAt,
  consumption,
  evidence,
  instance,
  load,
  modelCall,
  ok,
  open,
  operation,
  producedResult,
} from './journal-support.ts'
import { decodeActionId } from '@omne-harness/agent-contract'

type Journal = AgentJournal<string>
type Opened = AgentJournalCoreOpened<string>

const ALL_QUALIFICATIONS: readonly SettlementQualification[] = [
  'settle',
  'migrate-cancellation',
  'reconcile',
]

const fixture: AgentJournalCoreFixture<string> = {
  async open(name, options = {}) {
    const hostRecords = new Map<string, TestHostRecord>()
    const held = new Set<SettlementQualification>(ALL_QUALIFICATIONS)
    const installed = options.cancellationPolicy !== 'absent'
    const memory = createMemoryAgentJournal<string>({
      coordination: 'standalone',
      hostRecords,
      qualification: input => held.has(input.operation),
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
      // The result of a model call whose effect intent this execution saved: the call item of
      // the list is settled by the result, the custody stays with the result item (SPEC
      // "终结责任清单", the call and result rows).
      produceResult: async label => {
        const result = producedResult(label)
        const owned = consumption(`consumption-${label}`)
        const pending: PendingCall = {
          kind: 'model',
          purpose: 'main',
          action: ok(decodeActionId(`action-${label}`)),
          consumption: owned,
          position: { owner: 'agent', work: opened.execution, position: 'I3', purpose: 'main' },
          fixed: evidence(`fixed/${label}`),
          reference: ok(
            encodeModelInvocationRef({
              tenant: access.tenant,
              call: modelCall(label),
              admission: ok(decodeModelOperationId(`mop_${label}`)),
            }),
          ),
        }
        const snapshot = await load(memory.port, opened.execution)
        ok(
          await memory.port.commit(
            commitAt(snapshot, opened.authority, `effect-${label}`, {
              checkpoint: snapshot.checkpoint,
              effects: [{ action: pending.action, pending, authority: opened.authority }],
            }),
          ),
        )
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
      seedLegacyCandidate: async label => {
        const candidate = operation(`legacy-${label}`)
        if (!memory.seedLegacyCandidate(opened.execution, candidate, access.tenant))
          throw new Error(`the legacy candidate ${label} could not be seeded`)
        return { candidate }
      },
      qualify: next => {
        held.clear()
        for (const qualification of next) held.add(qualification)
      },
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
    async open(name, options) {
      const opened = await fixture.open(name, options)
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
 * The baseline fails nothing, so a red case comes from the decorator alone, and each negative
 * names the case its rule lives in.
 */
describe('the core conformance suite fails a Journal that breaks one of its rules', () => {
  beforeAll(async () => {
    expect(await failing(fixture)).toEqual([])
  })

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
    expect(names).toContain(
      'Q3: each atomic mutation that establishes a new fact allocates exactly one revision; the same operation recognizes without another and answers the same result',
    )
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
    expect(names).toContain(
      'Q11: after ended, a new commit, detach, tryFinish, submit, a recognizing submit of an accepted input and attach return terminal; the original end is recognized',
    )
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
    expect(names).toContain(
      'Q11: after ended, a commit with a stale expected revision returns terminal, not changed',
    )
  })
})
