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
  type AgentJournalReplyAdmissionControls,
  type SettlementQualification,
  type TestHostRecord,
} from '@omne-harness/agent-contract/testing'
import { decodeModelOperationId, encodeModelInvocationRef } from '@omne-harness/model-contract'
import { encodeToolInvocationRef, resolveToolInvocationRef } from '@omne-harness/tool-contract'
import {
  acceptedInput,
  access,
  checkpoint,
  commitAt,
  consumption,
  evidence,
  execution,
  instance,
  load,
  modelCall,
  ok,
  open,
  openInput,
  operation,
  otherTenant,
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
    const reading = { allowed: true }
    const memory = createMemoryAgentJournal<string>({
      coordination: 'standalone',
      hostRecords,
      reader: () => reading.allowed,
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
    const controls = (id: Opened['execution']): AgentJournalReplyAdmissionControls<string> => ({
      seed: async count => {
        if (!memory.replyAdmissions.seed(id, count, access.tenant))
          throw new Error(`the facts of ${id} could not be seeded`)
      },
      damage: async damage => {
        if (!memory.replyAdmissions.damage(id, damage, access.tenant))
          throw new Error(`the damage ${JSON.stringify(damage)} names nothing`)
      },
      limitPages: limits => memory.replyAdmissions.limitPages(limits),
      statistics: () => memory.replyAdmissions.statistics(),
      changeRule: async (rule, conversion) => {
        if (!memory.replyAdmissions.changeRule(id, rule, conversion, access.tenant))
          throw new Error('the rule could not be changed')
      },
      readable: allowed => {
        reading.allowed = allowed
      },
      sibling: async label => {
        const sibling = await open(memory.port, `${name}-${label}`)
        return {
          journal: memory.port,
          access,
          otherAccess: otherTenant,
          execution: sibling.execution,
          receipt: sibling.receipt,
          authority: sibling.authority,
          checkpoint: checkpoint(),
          acceptInput: async item => acceptedInput(`input-${label}-${item}`),
          replyAdmissions: controls(sibling.execution),
        }
      },
      foreignPrefix: async () => {
        const foreign = execution(`${name}-foreign`)
        ok(
          await memory.port.open(
            openInput({
              ...otherTenant,
              execution: foreign,
              operation: operation(`open-${name}-foreign`),
              initial: acceptedInput('input-foreign'),
            }),
          ),
        )
        if (!memory.replyAdmissions.seed(foreign, 1, otherTenant.tenant))
          throw new Error('the foreign fact could not be seeded')
        return ok(await memory.port.load({ ...otherTenant, execution: foreign })).replyAdmissions
          .prefix
      },
    })
    return {
      journal: memory.port,
      access,
      otherAccess: otherTenant,
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
      replyAdmissions: controls(opened.execution),
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

/**
 * The fixture with every host record the suite registers passed through `rewrite` first: the
 * memory Journal then serves the rewritten record as the trusted host read.
 */
function hostRecordsRewritten(
  rewrite: (record: TestHostRecord) => TestHostRecord,
): AgentJournalCoreFixture<string> {
  return {
    async open(name, options) {
      const opened = await fixture.open(name, options)
      const { hostRecord } = opened
      if (hostRecord === undefined) throw new Error('the memory fixture offers host records')
      return { ...opened, hostRecord: record => hostRecord(rewrite(record)) }
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

  it.each([
    [
      'recordHandoff',
      'another tenant: a root recordHandoff is denied with the action recordHandoff, the same for an existing and a missing execution, before any scripted fault; the attempt takes no custody slot, so the owner commits the same operation as the root',
    ],
    [
      'prepareFinish',
      'another tenant: prepareFinish under an advancement and under a cancel is denied with the action prepareFinish, the same for an existing and a missing execution, before the qualification and any scripted fault; the issued lists and FinishIntent.obligations stay; the owner then issues both lists',
    ],
    [
      'tryFinish',
      'another tenant: tryFinish with a list this execution issued is denied with the action tryFinish, the same for an existing and a missing execution, before any scripted fault; the execution stays settling with no ended event, and the owner then ends it',
    ],
    [
      'commitSettlement',
      'another tenant: each of the six commitSettlement variants is denied with the action commitSettlement, the same for an existing and a missing execution, before the qualification and any scripted fault, and writes nothing',
    ],
  ] as const)('%s that serves any caller as the owner of the execution', async (method, name) => {
    const names = await failing(
      decorated((journal, opened) => ({
        ...journal,
        [method]: (input: object) =>
          (journal[method] as (input: object) => unknown)({ ...input, ...opened.access }),
      })),
    )
    expect(names).toContain(name)
  })

  it('a host read that serves the tool return of another tenant as a return of the owner', async () => {
    // The reference of a tool-return record is the only place its tenant lives: a host read that
    // re-homes a foreign reference to the owner's tenant stands for a Journal that does not resolve
    // the tenant of the returned reference.
    const names = await failing(
      hostRecordsRewritten(record => {
        if (record.kind !== 'tool-return') return record
        const foreign = resolveToolInvocationRef(record.returned.reference, otherTenant.tenant)
        if ('failure' in foreign) return record
        const reference = ok(encodeToolInvocationRef({ ...foreign.ok, tenant: access.tenant }))
        return { ...record, returned: { ...record.returned, reference } }
      }),
    )
    expect(names).toContain(
      'record-tool-association: a host return whose reference belongs to another tenant is denied with the action commitSettlement before its intent and request are compared, the same for a return of another intent or another request; the association stays',
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
