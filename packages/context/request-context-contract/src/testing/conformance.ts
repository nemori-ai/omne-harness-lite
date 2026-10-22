import assert from 'node:assert/strict'
import { type TenantId } from '@omne-harness/legal-identity'
import type { HistorySource, CompactionPolicyPort, RepresentationPolicyPort } from '../ports.js'
import type { Access, EpochId } from '../refs.js'
import { decodePlanId } from '../refs.js'
import type { AssemblyPorts, AssemblyPolicies } from '../assembly.js'
import type {
  AssemblyInput,
  AssemblyResult,
  PlanResult,
  StepResult,
  TransitionEvidence,
} from '../values.js'
import type { DeriveInput } from '../plan.js'
import type { ConformanceCase } from './case.js'
import type { HistoryFixture } from './history-source.js'
import { text, row, entry, evidence } from './fixtures.js'
export type ConformanceSubject<P> = Readonly<{
  operations: {
    assemble(
      input: AssemblyInput<P>,
      ports: AssemblyPorts<P>,
      policies: AssemblyPolicies,
    ): Promise<AssemblyResult>
    planCompaction(
      input: AssemblyInput<P>,
      ports: AssemblyPorts<P>,
      policies: AssemblyPolicies,
    ): Promise<PlanResult>
    deriveStep(
      input: DeriveInput,
      ports: AssemblyPorts<P>,
      policies: AssemblyPolicies,
    ): Promise<StepResult>
    resume(
      input: AssemblyInput<P> & { transition: TransitionEvidence },
      ports: AssemblyPorts<P>,
      policies: AssemblyPolicies,
    ): Promise<AssemblyResult>
  }
  input: AssemblyInput<P>
  ports: AssemblyPorts<P>
  policies: AssemblyPolicies
}>
type BoundCase = Readonly<{ id: string; obligation: string; run(): Promise<void> }>
const caseOf = (id: string, obligation: string, run: () => Promise<void>): BoundCase => ({
  id,
  obligation,
  run,
})
function requestContextCases<P>(subject: ConformanceSubject<P>): readonly BoundCase[] {
  const { operations: o, input, ports, policies } = subject
  return [
    caseOf('new-inputs-must-be-saved', 'RQ11-1', async () => {
      assert.equal(
        (await o.assemble({ ...input, inputs: { ...input.inputs, saved: null } }, ports, policies))
          .kind,
        'invalid',
      )
    }),
    caseOf('same-input-is-deterministic', 'RQ11-2', async () => {
      assert.deepEqual(
        await o.assemble(input, ports, policies),
        await o.assemble(input, ports, policies),
      )
    }),
    caseOf('fixed-overflow-is-outcome', 'RQ11-4', async () => {
      const meter = {
        ...ports.meter,
        measure: (value: Parameters<typeof ports.meter.measure>[0]) => {
          const result = ports.meter.measure(value)
          if ('failure' in result) return result
          return {
            ok: {
              ...result.ok,
              checks: result.ok.checks.map(c => ({
                ...c,
                measurement: {
                  kind: 'exact' as const,
                  amount: (BigInt(c.limit) + 1n).toString(),
                  method: c.measurement.method,
                },
              })),
            },
          }
        },
      }
      const result = await o.assemble(input, { ...ports, meter }, policies)
      assert.equal(result.kind, 'cannot-fit')
    }),
    caseOf('unknown-limits-remain-candidates', 'RQ11-9', async () => {
      const meter = {
        ...ports.meter,
        measure: (value: Parameters<typeof ports.meter.measure>[0]) => {
          const result = ports.meter.measure(value)
          if ('failure' in result) return result
          return {
            ok: {
              ...result.ok,
              checks: result.ok.checks.map(c => ({
                ...c,
                constraint: { ...c.constraint, upstream: { kind: 'unknown' as const } },
              })),
            },
          }
        },
      }
      const result = await o.assemble(input, { ...ports, meter }, policies)
      assert.ok(result.kind === 'candidate-before-extension' || result.kind === 'candidate-fixable')
    }),
    caseOf('resume-full-snapshot-required', 'RQ11-15', async () => {
      const plan = decodePlanId('plan:conformance')
      if ('failure' in plan) throw new Error('Fixture plan')
      const result = await o.resume(
        {
          ...input,
          transition: {
            planId: plan.ok,
            candidate: input.identity.candidate,
            committed: evidence,
            epoch: input.history.epoch,
          },
          contextRead: { ...input.contextRead, read: { kind: 'cursor-invalidated' } },
        },
        ports,
        policies,
      )
      assert.equal(result.kind, 'invalid')
    }),
    caseOf('incremental-material-required', 'RQ11-19', async () => {
      const result = await o.assemble(
        { ...input, contextRead: { ...input.contextRead, snapshot: null } },
        ports,
        policies,
      )
      assert.equal(result.kind, 'invalid')
    }),
    caseOf('carried-content-reuses-history', 'RQ11-2', async () => {
      let reads = 0
      const history = {
        ...ports.history,
        read: async (...args: Parameters<typeof ports.history.read>) => {
          reads++
          return ports.history.read(...args)
        },
      }
      const supplied = { ...ports, history }
      const first = await o.assemble(input, supplied, policies)
      assert.ok(first.kind === 'candidate-before-extension' || first.kind === 'candidate-fixable')
      const before = reads
      await o.assemble(
        {
          ...input,
          previous: {
            candidate: input.identity.candidate,
            enteredCompaction: null,
            carried: first.candidate,
          },
        },
        supplied,
        policies,
      )
      assert.equal(reads, before)
    }),
    caseOf('floor-cannot-be-dropped', 'RQ11-11', async () => {
      const policy = {
        ...policies.compaction,
        config: {
          ...policies.compaction.config,
          retainBudget: { kind: 'tokens' as const, retainTokens: '0' },
        },
        plan: () => ({
          kind: 'draft' as const,
          coverTo: entry('entry:0'),
          retained: [],
          bound: '2',
          shape: 'summarize' as const,
        }),
      }
      const history = {
        ...ports.history,
        compactionContext: async () => ({
          kind: 'context' as const,
          epoch: input.history.epoch,
          value: {
            covered: [{ ref: entry('entry:0'), message: row().message }],
            after: [],
            open: [entry('entry:0')],
          },
        }),
      }
      const result = await o.planCompaction(
        input,
        { ...ports, history },
        { ...policies, compaction: policy },
      )
      assert.equal(result.kind, 'cannot-fit')
    }),
    caseOf('plan-progress-and-policy-checked', 'RQ11-17', async () => {
      const planned = await o.planCompaction(input, ports, policies)
      assert.equal(planned.kind, 'planned')
      if (planned.kind !== 'planned') return
      const result = await o.deriveStep(
        {
          plan: planned.plan,
          progress: planned.progress,
          selection: input.selection,
          material: planned.first.material,
          step: { kind: 'vetoed', reason: 'test', evidence },
        },
        ports,
        { ...policies, compaction: { ...policies.compaction, configDigest: () => 'changed' } },
      )
      assert.equal(result.kind, 'invalid')
    }),
    caseOf('entered-plan-changes-outcome', 'RQ11-20', async () => {
      let n = 0
      const meter = {
        ...ports.meter,
        measure: (value: Parameters<typeof ports.meter.measure>[0]) => {
          const result = ports.meter.measure(value)
          if ('failure' in result) return result
          n++
          return {
            ok: {
              ...result.ok,
              checks: result.ok.checks.map(c => ({
                ...c,
                measurement: {
                  kind: 'exact' as const,
                  amount: c.metric === 'input-tokens' && n % 2 === 1 ? '900' : '1',
                  method: c.measurement.method,
                },
                limit: '1000',
              })),
            },
          }
        },
      }
      const plan = decodePlanId('plan:previous')
      assert.ok('ok' in plan)
      const result = await o.assemble(
        { ...input, previous: { candidate: input.identity.candidate, enteredCompaction: plan.ok } },
        { ...ports, meter },
        policies,
      )
      assert.equal(result.kind, 'cannot-fit')
    }),
    caseOf('tail-facts-never-enter-snapshot', 'RQ11-24', async () => {
      const result = await o.assemble(
        {
          ...input,
          contextRead: {
            ...input.contextRead,
            perRequest: [
              {
                key: 'test.tail',
                revision: 1,
                value: 'live',
                previous: null,
                volatility: 'per-request',
              },
            ],
          },
        },
        ports,
        policies,
      )
      assert.ok(result.kind === 'candidate-before-extension' || result.kind === 'candidate-fixable')
      assert.equal(result.candidate.layers.tailFacts.blocks.length, 1)
      assert.ok(
        result.candidate.layers.snapshotReminder.blocks.every(b => b.volatility !== 'per-request'),
      )
      assert.equal(
        result.candidate.assembled.messages.at(-1)?.id,
        result.candidate.layers.tailFacts.message?.id,
      )
    }),
    caseOf('pages-share-evidence', 'RQ11-26', async () => {
      const seen: unknown[] = []
      const history = {
        ...ports.history,
        read: async (e: typeof input.history, _access: unknown, after: number | null) => {
          seen.push(e)
          return {
            kind: 'page' as const,
            page: { rows: [row(after === null ? 0 : 1)], next: after === null ? 0 : null },
          }
        },
      }
      const result = await o.assemble(
        { ...input, history: { ...input.history, upper: 1 } },
        { ...ports, history },
        policies,
      )
      assert.ok(result.kind === 'candidate-before-extension' || result.kind === 'candidate-fixable')
      assert.equal(seen.length, 2)
      assert.equal(seen[0], seen[1])
    }),
    caseOf('unknown-source-not-empty', 'RQ11-34', async () => {
      const result = await o.assemble(
        input,
        { ...ports, history: { ...ports.history, read: async () => ({ kind: 'unknown' }) } },
        policies,
      )
      assert.equal(result.kind, 'unknown')
    }),
  ]
}
function historySourceCases<P>(
  subject: Readonly<{
    source: HistorySource<P>
    fixture: HistoryFixture
    access: Access<P>
    otherTenant: TenantId
    commit: () => Promise<EpochId>
  }>,
): readonly BoundCase[] {
  const first = subject.fixture.epochs[0]
  if (first === undefined) return []
  const evidence = {
    scope: subject.fixture.scope,
    epoch: first.epoch,
    upper: first.rows.at(-1)?.seq ?? -1,
  }
  return [
    caseOf('read-requires-access', 'RQ11-29', async () => {
      assert.equal((await subject.source.read(evidence, null, null, 65536)).kind, 'invalid')
    }),
    caseOf('tenant-isolation', 'RQ11-29', async () => {
      assert.equal(
        (
          await subject.source.read(
            evidence,
            { ...subject.access, tenant: subject.otherTenant },
            null,
            65536,
          )
        ).kind,
        'denied',
      )
    }),
    caseOf('page-size-retains-order', 'RQ11-28', async () => {
      const r = await subject.source.read(evidence, subject.access, null, 65536)
      assert.equal(r.kind, 'page')
      if (r.kind === 'page')
        assert.ok(r.page.rows.every((r, i, a) => i === 0 || r.seq > (a[i - 1]?.seq ?? -1)))
    }),
  ]
}
function compactionPolicyCases(
  subject: Readonly<{ policy: CompactionPolicyPort; fixture: HistoryFixture }>,
): readonly BoundCase[] {
  return [
    caseOf('configuration-stable', 'RQ11-17', async () => {
      assert.equal(subject.policy.configDigest(), subject.policy.configDigest())
      assert.ok(BigInt(subject.policy.config.stepBound) > 0n)
    }),
    caseOf('trim-does-not-mutate', 'RQ11-13', async () => {
      const material = { covered: [], retained: [], trimmed: [] }
      subject.policy.trim(material, { maxBlockBytes: '10' })
      assert.deepEqual(material, { covered: [], retained: [], trimmed: [] })
    }),
  ]
}
function representationPolicyCases(
  subject: Readonly<{ policy: RepresentationPolicyPort }>,
): readonly BoundCase[] {
  return [
    caseOf('text-original-decision', 'RQ11-7', async () => {
      const block = text('visible')
      assert.equal(
        subject.policy.choose({ block, conversion: null, modalities: ['text'] }),
        'original',
      )
    }),
    caseOf('unsupported-without-conversion', 'RQ11-7', async () => {
      assert.equal(
        subject.policy.choose({
          block: { ...text(''), kind: 'image', mediaType: 'image/png', inline: 'bytes' },
          conversion: null,
          modalities: ['text'],
        }),
        'none',
      )
    }),
  ]
}

function suite<F>(
  names: readonly string[],
  create: (fixture: F) => readonly BoundCase[],
): readonly ConformanceCase<F>[] {
  return names.map(name => ({
    name,
    clause: 'RQ-11',
    async run(fixture) {
      const item = create(fixture).find(x => x.id === name)
      assert.ok(item, `Missing conformance case ${name}`)
      await item.run()
    },
  }))
}
export const REQUEST_CONTEXT_OBLIGATIONS = [
  'new-inputs-must-be-saved',
  'same-input-is-deterministic',
  'fixed-overflow-is-outcome',
  'unknown-limits-remain-candidates',
  'resume-full-snapshot-required',
  'incremental-material-required',
  'carried-content-reuses-history',
  'floor-cannot-be-dropped',
  'plan-progress-and-policy-checked',
  'entered-plan-changes-outcome',
  'tail-facts-never-enter-snapshot',
  'pages-share-evidence',
  'unknown-source-not-empty',
] as const
export type RequestContextObligation = (typeof REQUEST_CONTEXT_OBLIGATIONS)[number]
export const HISTORY_SOURCE_OBLIGATIONS = [
  'read-requires-access',
  'tenant-isolation',
  'page-size-retains-order',
] as const
export type HistorySourceObligation = (typeof HISTORY_SOURCE_OBLIGATIONS)[number]
export const COMPACTION_POLICY_OBLIGATIONS = [
  'configuration-stable',
  'trim-does-not-mutate',
] as const
export type CompactionPolicyObligation = (typeof COMPACTION_POLICY_OBLIGATIONS)[number]
export const REPRESENTATION_POLICY_OBLIGATIONS = [
  'text-original-decision',
  'unsupported-without-conversion',
] as const
export type RepresentationPolicyObligation = (typeof REPRESENTATION_POLICY_OBLIGATIONS)[number]
export function requestContextConformance<P>(): readonly ConformanceCase<ConformanceSubject<P>>[] {
  return suite(REQUEST_CONTEXT_OBLIGATIONS, requestContextCases<P>)
}
export type HistorySourceFixture<P> = Parameters<typeof historySourceCases<P>>[0]
export function historySourceConformance<P>(): readonly ConformanceCase<HistorySourceFixture<P>>[] {
  return suite(HISTORY_SOURCE_OBLIGATIONS, historySourceCases<P>)
}
export type CompactionPolicyFixture = Parameters<typeof compactionPolicyCases>[0]
export function compactionPolicyConformance(): readonly ConformanceCase<CompactionPolicyFixture>[] {
  return suite(COMPACTION_POLICY_OBLIGATIONS, compactionPolicyCases)
}
export type RepresentationPolicyFixture = Parameters<typeof representationPolicyCases>[0]
export function representationPolicyConformance(): readonly ConformanceCase<RepresentationPolicyFixture>[] {
  return suite(REPRESENTATION_POLICY_OBLIGATIONS, representationPolicyCases)
}
