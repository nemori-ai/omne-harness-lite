// The session-log Journal against the core conformance suite of the Agent contract's `./testing`
// entry (Agent SPEC "并发与提交", "托管协调与运行实例"): the facts every binding answers alike. The
// Agent memory Journal runs the same suite on its own fixture. Each case opens its own Session
// scene. The Session side records the handover of every input the Agent accepted, the initial one
// and each first submit, so that an ordinary end is not blocked on the Session side; that record
// is a Session write after the Journal answered, not a change of the Journal's answer.
import { describe, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  agentJournalCoreConformance,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
  type AgentJournalReplyAdmissionControls,
  type TestHostRecord,
} from '@omne-harness/agent-contract/testing'
import { memoryOtherAccess, operationId } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence, instance } from './fixtures/common-journal.ts'
import { accept, handed } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

const SETTLEMENT_QUALIFICATIONS: readonly string[] = ['settle', 'migrate-cancellation', 'reconcile']

/** The read actions the scene's reading flag governs (Agent SPEC D5 第 6 节). */
const READS: readonly string[] = ['load', 'readReplyAdmissions', 'query']

const fixture: AgentJournalCoreFixture<string> = {
  async open(name, options = {}) {
    const hostRecords = new Map<string, TestHostRecord>()
    const installed = options.cancellationPolicy !== 'absent'
    // The settlement qualifications the caller holds; every other action stays allowed.
    const held = new Set<string>(SETTLEMENT_QUALIFICATIONS)
    const reading = { allowed: true }
    const s = await scene(
      `core-${name}`,
      undefined,
      {
        agent: action =>
          (!SETTLEMENT_QUALIFICATIONS.includes(action) || held.has(action)) &&
          (!READS.includes(action) || reading.allowed),
        session: true,
      },
      { cancellationPolicy: installed ? 'installed' : 'absent', hostRecords },
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
    const admissions = s.view.controls.replyAdmissions
    const replyAdmissions: AgentJournalReplyAdmissionControls<string> = {
      seed: async count => {
        if (!admissions.seed(s.execution, count, s.access.tenant))
          throw new Error('the facts could not be seeded')
      },
      damage: async damage => {
        if (!admissions.damage(s.execution, damage, s.access.tenant))
          throw new Error(`the damage ${JSON.stringify(damage)} names nothing`)
      },
      limitPages: limits => admissions.limitPages(limits),
      statistics: () => admissions.statistics(),
      changeRule: async (rule, conversion) => {
        if (!admissions.changeRule(s.execution, rule, conversion, s.access.tenant))
          throw new Error('the rule could not be changed')
      },
      readable: allowed => {
        reading.allowed = allowed
      },
      // Another Session scene of the same tenant: its own execution and its own Journal.
      sibling: async label => fixture.open(`${name}-${label}`.slice(0, 48)),
      // The prefix of this execution as the same Journal would name it for another tenant: the
      // tenant part of the basis is the other tenant's. A basis of another tenant is denied
      // whether or not that tenant's prefix exists.
      foreignPrefix: async () => {
        const prefix = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
          .replyAdmissions.prefix
        const marker = prefix.basis.record.lastIndexOf('/reply-admission-prefix/')
        const parts = JSON.parse(prefix.basis.record.slice(0, marker)) as string[]
        const other = tenantCodec.encode(memoryOtherAccess('intruder', `core-${name}`).tenant)
        if (!other.ok) throw new Error('the other tenant has no text')
        const record = `${JSON.stringify([other.value, ...parts.slice(1)])}${prefix.basis.record.slice(marker)}`
        return { ...prefix, basis: { ...prefix.basis, record } }
      },
    }
    return {
      replyAdmissions,
      journal,
      access: s.access,
      otherAccess: memoryOtherAccess('intruder', `core-${name}`),
      execution: s.execution,
      receipt: s.opened.receipt,
      authority: s.opened.authority,
      checkpoint: s.checkpoint,
      installation: installed ? testCancellationPolicyInstallation : null,
      hostRecord: async record => {
        const source = evidence(`host/${hostRecords.size + 1}/${record.kind}`)
        hostRecords.set(source.record, record)
        return source
      },
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
      seedLegacyCandidate: async label => {
        const candidate = operation(`legacy-${label}`)
        if (!s.view.controls.seedLegacyCandidate(s.execution, candidate, s.access.tenant))
          throw new Error(`the legacy candidate ${label} could not be seeded`)
        return { candidate }
      },
      qualify: next => {
        held.clear()
        for (const qualification of next) held.add(qualification)
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
      await entry.run()
    })
  }
})
