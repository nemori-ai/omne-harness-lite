import assert from 'node:assert/strict'
import { type TenantId } from '@omne-harness/legal-identity'
import type { HistorySource, CompactionPolicyPort, RepresentationPolicyPort } from '../ports.js'
import type { Access } from '../refs.js'
import { decodePlanId } from '../refs.js'
import type { AssemblyPorts, AssemblyPolicies } from '../ports.js'
import type {
  AssemblyInput,
  AssemblyResult,
  PlanResult,
  StepResult,
  TransitionEvidence,
} from '../values.js'
import type { DeriveInput } from '../values.js'
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
    caseOf('floor-after-cover-cannot-evade-budget', 'RQ06/RQ11-11', async () => {
      const first = row(0),
        last = row(1)
      const history: HistorySource<P> = {
        async read() {
          return { kind: 'page', page: { rows: [first, last], next: null } }
        },
        async compactionContext() {
          return {
            kind: 'context',
            epoch: input.history.epoch,
            value: {
              covered: [
                { ref: first.entry, message: first.message },
                { ref: last.entry, message: last.message },
              ],
              after: [],
              open: [last.entry],
            },
          }
        },
      }
      const policy: CompactionPolicyPort = {
        ...policies.compaction,
        config: {
          ...policies.compaction.config,
          retainBudget: { kind: 'tokens', retainTokens: '100' },
        },
        plan: () => ({
          kind: 'draft',
          coverTo: first.entry,
          retained: [],
          bound: policies.compaction.config.stepBound,
          shape: 'summarize',
        }),
      }
      const measured = (amount: string): typeof ports.meter => ({
        ...ports.meter,
        measure(value) {
          const result = ports.meter.measure(value)
          if ('failure' in result) return result
          return {
            ok: {
              ...result.ok,
              checks: result.ok.checks.map(check =>
                check.metric === 'input-tokens'
                  ? {
                      ...check,
                      measurement: {
                        kind: 'exact' as const,
                        amount,
                        method: check.measurement.method,
                      },
                    }
                  : check,
              ),
            },
          }
        },
      })
      const current = { ...input, history: { ...input.history, upper: 1 } }
      const failed = await o.planCompaction(
        current,
        { ...ports, history, meter: measured('150') },
        { ...policies, compaction: policy },
      )
      assert.equal(failed.kind, 'cannot-fit')
      if (failed.kind === 'cannot-fit') {
        assert.equal(failed.reason, 'floor-exceeds-budget')
        assert.deepEqual(failed.floor, [last.entry])
      }
      const legal = await o.planCompaction(
        current,
        { ...ports, history, meter: measured('50') },
        { ...policies, compaction: policy },
      )
      assert.equal(legal.kind, 'planned')
      if (legal.kind === 'planned') {
        assert.deepEqual(legal.plan.floor, [])
        assert.deepEqual(legal.plan.after, [last.message])
      }
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
    /** Builds this same source implementation against an independent fixture. */
    createSource: (fixture: HistoryFixture) => HistorySource<P>
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
    caseOf('missing-scope-is-invalid', 'RQ11-29', async () => {
      const { scope: _scope, ...missing } = evidence
      const result = await subject.source.read(
        missing as typeof evidence,
        subject.access,
        null,
        65536,
      )
      assert.equal(result.kind, 'invalid')
      if (result.kind === 'invalid') assert.equal(result.reason, 'missing-scope')
    }),
    caseOf('page-respects-byte-budget', 'RQ11-28/H5', async () => {
      const [head, next] = first.rows
      assert.ok(head && next, 'History conformance needs at least two rows')
      const bytes = Number(head.bytes)
      assert.ok(Number.isSafeInteger(bytes) && bytes > 0 && BigInt(next.bytes) > 0n)
      const page = await subject.source.read(evidence, subject.access, null, bytes)
      assert.equal(page.kind, 'page')
      if (page.kind !== 'page') return
      assert.deepEqual(
        page.page.rows.map(row => row.seq),
        [head.seq],
      )
      assert.ok(page.page.rows.reduce((sum, row) => sum + BigInt(row.bytes), 0n) <= BigInt(bytes))
      assert.equal(page.page.next, head.seq)
      const following = await subject.source.read(
        evidence,
        subject.access,
        page.page.next,
        Number(next.bytes),
      )
      assert.equal(following.kind, 'page')
      if (following.kind === 'page') {
        assert.equal(following.page.rows[0]?.seq, next.seq)
        assert.ok(
          following.page.rows.reduce((sum, row) => sum + BigInt(row.bytes), 0n) <=
            BigInt(next.bytes),
        )
      }
    }),
    caseOf('prefix-digest-is-chained', 'RQ11-C3/H3', async () => {
      const [head, next] = first.rows
      assert.ok(head && next, 'History conformance needs at least two rows')
      const bytes = first.rows.reduce((sum, row) => sum + BigInt(row.bytes), 0n)
      assert.ok(bytes > 0n && bytes <= BigInt(Number.MAX_SAFE_INTEGER))
      const readDigests = async (source: HistorySource<P>) => {
        const rows: import('../values.js').HistoryRow[] = []
        let after: number | null = null
        const cursors = new Set<number>()
        while (true) {
          const result = await source.read(evidence, subject.access, after, Number(bytes))
          assert.equal(result.kind, 'page')
          if (result.kind !== 'page') throw new Error('Expected fixture history page')
          rows.push(...result.page.rows)
          if (result.page.next === null) break
          assert.ok(!cursors.has(result.page.next), 'History pages must advance')
          cursors.add(result.page.next)
          after = result.page.next
        }
        assert.deepEqual(
          rows.map(row => row.seq),
          first.rows.map(row => row.seq),
        )
        assert.ok(
          rows.every(row => typeof row.prefixDigest === 'string' && row.prefixDigest.length > 0),
        )
        return rows.map(row => row.prefixDigest)
      }
      const original = await readDigests(subject.source)
      // The factory must exercise the same implementation, not a reference provider.
      assert.deepEqual(await readDigests(subject.createSource(subject.fixture)), original)
      const changedMessage = {
        role: 'user' as const,
        id: head.message.id,
        blocks: [text('prefix-chain-change:' + JSON.stringify(head.message))] as const,
      }
      const changed: HistoryFixture = {
        ...subject.fixture,
        epochs: [
          {
            ...first,
            rows: first.rows.map((value, index) =>
              index === 0 ? { ...value, message: changedMessage } : value,
            ),
            entries: first.entries.map(value =>
              value.ref === head.entry ? { ...value, message: changedMessage } : value,
            ),
          },
          ...subject.fixture.epochs.slice(1),
        ],
      }
      const suffix = await readDigests(subject.createSource(changed))
      original.forEach((digest, index) =>
        assert.notEqual(
          suffix[index],
          digest,
          'Earlier row changes must propagate through every suffix digest',
        ),
      )
      // Page boundaries cannot restart the chain.
      const page = await subject.source.read(evidence, subject.access, head.seq, Number(next.bytes))
      assert.equal(page.kind, 'page')
      if (page.kind === 'page') assert.equal(page.page.rows[0]?.prefixDigest, original[1])
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
  'floor-after-cover-cannot-evade-budget',
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
  'missing-scope-is-invalid',
  'page-respects-byte-budget',
  'prefix-digest-is-chained',
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
