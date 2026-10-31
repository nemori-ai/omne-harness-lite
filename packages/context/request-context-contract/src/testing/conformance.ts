import assert from 'node:assert/strict'
import { type TenantId } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import type { HistorySource, CompactionPolicyPort, RepresentationPolicyPort } from '../ports.js'
import type { AssemblyOperations } from '../ports.js'
import type { Access } from '../refs.js'
import { decodePlanId } from '../refs.js'
import type { HistoryCursor, HistoryEvidence } from '../values.js'
import type { ConformanceCase } from './case.js'
import type { HistoryFixture } from './history-source.js'
import {
  createAssemblyFixture,
  text,
  row,
  entry,
  evidence,
  fixtureBudget,
  type AssemblyFixture,
  type AssemblyFixtureOptions,
} from './fixtures.js'
import { createScriptedCompactionPolicy, createScriptedInputMeter } from './doubles.js'
import { countingBasis } from './fixtures.js'
/**
 * An operation group implementation under test: it binds the fixture's target, sources and
 * policies, as `createAssemblyOperations` or a registry's `assembly(target)` does.
 */
export type ConformanceSubject = Readonly<{
  operations(
    fixture: AssemblyFixture,
  ): AssemblyOperations<string> | Promise<AssemblyOperations<string>>
}>
type BoundCase = Readonly<{ id: string; obligation: string; run(): Promise<void> }>
const caseOf = (id: string, obligation: string, run: () => Promise<void>): BoundCase => ({
  id,
  obligation,
  run,
})
function scripted(
  amount: (input: Parameters<M.ModelInputMeter['measure']>[0], n: number) => M.RequestBudget,
) {
  let n = 0
  return { meter: createScriptedInputMeter(countingBasis, input => ({ ok: amount(input, ++n) })) }
}
function overLimit(): M.RequestBudget {
  const budget = fixtureBudget()
  return {
    ...budget,
    checks: budget.checks.map(c => ({
      ...c,
      measurement: {
        kind: 'exact' as const,
        amount: (BigInt(c.limit) + 1n).toString(),
        method: c.measurement.method,
      },
    })),
  }
}
function isCandidate(kind: string): boolean {
  return kind === 'candidate-before-extension' || kind === 'candidate-fixable'
}
function requestContextCases(subject: ConformanceSubject): readonly BoundCase[] {
  const make = async (options: AssemblyFixtureOptions = {}) => {
    const fixture = createAssemblyFixture(options)
    return { fixture, o: await subject.operations(fixture) }
  }
  return [
    caseOf('new-inputs-must-be-saved', 'RQ11-1', async () => {
      const { fixture, o } = await make()
      const history = fixture.sources.values().history
      fixture.sources.update('history', { ...history, inputs: { ...history.inputs, saved: null } })
      assert.equal((await o.assemble(fixture.call)).kind, 'invalid')
    }),
    caseOf('same-input-is-deterministic', 'RQ11-2', async () => {
      const { fixture, o } = await make()
      assert.deepEqual(await o.assemble(fixture.call), await o.assemble(fixture.call))
    }),
    caseOf('fixed-overflow-is-outcome', 'RQ11-4', async () => {
      const { fixture, o } = await make({ preparation: scripted(() => overLimit()) })
      assert.equal((await o.assemble(fixture.call)).kind, 'cannot-fit')
    }),
    caseOf('unknown-limits-remain-candidates', 'RQ11-9', async () => {
      const { fixture, o } = await make({
        preparation: scripted(() => {
          const budget = fixtureBudget()
          return {
            ...budget,
            checks: budget.checks.map(c => ({
              ...c,
              constraint: { ...c.constraint, upstream: { kind: 'unknown' as const } },
            })),
          }
        }),
      })
      assert.ok(isCandidate((await o.assemble(fixture.call)).kind))
    }),
    caseOf('resume-full-snapshot-required', 'RQ11-15', async () => {
      const { fixture, o } = await make()
      const plan = decodePlanId('plan:conformance')
      if ('failure' in plan) throw new Error('Fixture plan')
      const context = fixture.sources.values().context
      fixture.sources.update('context', {
        contextRead: { ...context.contextRead, read: { kind: 'cursor-invalidated' } },
        transition: {
          planId: plan.ok,
          candidate: fixture.call.candidate,
          committed: evidence,
          epoch: fixture.sources.values().history.evidence.epoch,
        },
      })
      assert.equal((await o.resume(fixture.call)).kind, 'invalid')
    }),
    caseOf('incremental-material-required', 'RQ11-19', async () => {
      const { fixture, o } = await make()
      const context = fixture.sources.values().context
      fixture.sources.update('context', {
        ...context,
        contextRead: { ...context.contextRead, snapshot: null },
      })
      assert.equal((await o.assemble(fixture.call)).kind, 'invalid')
    }),
    caseOf('carried-content-reuses-history', 'RQ11-2', async () => {
      const { fixture, o } = await make()
      const first = await o.assemble(fixture.call)
      assert.ok(first.kind === 'candidate-before-extension' || first.kind === 'candidate-fixable')
      const control = fixture.sources.values().control
      fixture.sources.update('control', {
        ...control,
        previous: {
          candidate: fixture.call.candidate,
          enteredCompaction: null,
          carried: first.candidate,
        },
      })
      const before = fixture.history.readCount()
      await o.assemble(fixture.call)
      assert.equal(fixture.history.readCount(), before)
    }),
    caseOf('floor-cannot-be-dropped', 'RQ11-11', async () => {
      const base = createAssemblyFixture()
      const policy: CompactionPolicyPort = {
        ...base.policies.compaction,
        config: {
          ...base.policies.compaction.config,
          retainBudget: { kind: 'tokens', retainTokens: '0' },
        },
      }
      const { fixture, o } = await make({
        policies: { ...base.policies, compaction: policy },
        open: [entry('entry:0')],
      })
      assert.equal((await o.planCompaction(fixture.call)).kind, 'cannot-fit')
    }),
    caseOf('retention-measures-the-whole-set', 'RQ11/J14', async () => {
      // One message measures 10, two measure 15: summing single entries would give 20.
      const base = createAssemblyFixture()
      const policy = createScriptedCompactionPolicy({
        retainBudget: { kind: 'tokens', retainTokens: '16' },
        retainPreference: 'newest-first',
        triggerPercent: null,
        headroomTokens: null,
        trimFirst: false,
        stepBound: '2',
      })
      const { fixture, o } = await make({
        rows: [row(0), row(1)],
        policies: { ...base.policies, compaction: policy },
        preparation: scripted(input =>
          fixtureBudget(['0', '10', '15'][input.assembled.messages.length] ?? '1000'),
        ),
      })
      const planned = await o.planCompaction(fixture.call)
      assert.equal(planned.kind, 'planned')
      if (planned.kind === 'planned') assert.equal(planned.plan.retained.length, 2)
    }),
    caseOf('plan-progress-and-policy-checked', 'RQ11-17', async () => {
      const { fixture, o } = await make()
      const planned = await o.planCompaction(fixture.call)
      assert.equal(planned.kind, 'planned')
      if (planned.kind !== 'planned') return
      const changed = await subject.operations({
        ...fixture,
        policies: {
          ...fixture.policies,
          compaction: { ...fixture.policies.compaction, configDigest: () => 'changed' },
        },
      })
      const result = await changed.deriveStep({
        call: fixture.call,
        plan: planned.plan,
        progress: planned.progress,
        material: planned.first.material,
        step: { kind: 'vetoed', index: '0', reason: 'test', evidence },
      })
      assert.equal(result.kind, 'invalid')
    }),
    caseOf('trim-is-not-a-step', 'RQ11/J12', async () => {
      const base = createAssemblyFixture()
      const policy: CompactionPolicyPort = {
        ...base.policies.compaction,
        config: { ...base.policies.compaction.config, trimFirst: true, stepBound: '1' },
        plan: async ({ context }) => ({
          kind: 'draft',
          coverTo: context.covered.at(-1)?.ref ?? entry('entry:0'),
          retained: [],
          bound: '1',
          shape: { kind: 'summarize', trimFirst: true },
        }),
      }
      const { fixture, o } = await make({ policies: { ...base.policies, compaction: policy } })
      const planned = await o.planCompaction(fixture.call)
      assert.equal(planned.kind, 'planned')
      if (planned.kind !== 'planned') return
      assert.equal(planned.first.kind, 'summarize')
      assert.equal(planned.first.index, '0')
      assert.equal(planned.progress.completed, '0')
    }),
    caseOf('entered-plan-changes-outcome', 'RQ11-20', async () => {
      const { fixture, o } = await make({
        preparation: scripted((_input, n) =>
          n % 2 === 1 ? fixtureBudget('900') : fixtureBudget('1'),
        ),
      })
      const plan = decodePlanId('plan:previous')
      assert.ok('ok' in plan)
      const control = fixture.sources.values().control
      fixture.sources.update('control', {
        ...control,
        previous: { candidate: fixture.call.candidate, enteredCompaction: plan.ok },
      })
      assert.equal((await o.assemble(fixture.call)).kind, 'cannot-fit')
    }),
    caseOf('tail-facts-never-enter-snapshot', 'RQ11-24', async () => {
      const { fixture, o } = await make()
      const context = fixture.sources.values().context
      fixture.sources.update('context', {
        ...context,
        contextRead: {
          ...context.contextRead,
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
      })
      const result = await o.assemble(fixture.call)
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
      const { fixture, o } = await make({ rows: [row(0), row(1)] })
      const seen: HistoryEvidence[] = []
      const read = fixture.history.read.bind(fixture.history)
      const spy: AssemblyFixture = {
        ...fixture,
        sources: {
          ...fixture.sources,
          history: {
            ...fixture.history,
            read: async input => {
              seen.push(input.evidence)
              return read({ ...input, budgetBytes: 5 })
            },
          },
        },
      }
      const operations = await subject.operations(spy)
      const result = await operations.assemble(fixture.call)
      assert.ok(isCandidate(result.kind))
      assert.equal(seen.length, 2)
      assert.deepEqual(seen[0], seen[1])
      void o
    }),
    caseOf('unknown-source-not-empty', 'RQ11-34', async () => {
      const { fixture } = await make()
      const spy: AssemblyFixture = {
        ...fixture,
        sources: {
          ...fixture.sources,
          history: { ...fixture.history, read: async () => ({ kind: 'unknown' }) },
        },
      }
      const result = await (await subject.operations(spy)).assemble(fixture.call)
      assert.equal(result.kind, 'unknown')
    }),
    caseOf('unstable-group-is-unavailable', 'RQ11/J14', async () => {
      const { fixture, o } = await make()
      fixture.sources.churn('prompt', true)
      const result = await o.assemble(fixture.call)
      assert.equal(result.kind, 'unavailable')
      if (result.kind === 'unavailable') assert.equal(result.diagnostic, 'unstable-input:prompt')
    }),
    caseOf('lease-is-given-back', 'RQ11/RQ-05', async () => {
      const { fixture, o } = await make({
        preparation: {
          release: () => ({
            failure: { kind: 'unavailable', dependency: 'lease', diagnostic: 'stuck' },
          }),
        },
      })
      const result = await o.assemble(fixture.call)
      assert.equal(result.kind, 'unavailable')
      assert.equal(fixture.preparation.outstanding(), 0)
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
  const last = first.rows.at(-1)
  const evidence: HistoryEvidence = {
    target: { tenant: subject.fixture.tenant, scope: subject.fixture.scope },
    epoch: first.epoch,
    upper: last === undefined ? { kind: 'empty' } : { kind: 'entry', seq: last.seq },
  }
  const read = (
    access: Access<P> | null,
    cursor: HistoryCursor | null,
    budgetBytes: number,
    e = evidence,
  ) => subject.source.read({ access: access as Access<P>, evidence: e, cursor, budgetBytes })
  return [
    caseOf('read-requires-access', 'RQ11-29', async () => {
      assert.equal((await read(null, null, 65536)).kind, 'invalid')
    }),
    caseOf('tenant-isolation', 'RQ11-29', async () => {
      assert.equal(
        (await read({ ...subject.access, tenant: subject.otherTenant }, null, 65536)).kind,
        'denied',
      )
    }),
    caseOf('page-size-retains-order', 'RQ11-28', async () => {
      const r = await read(subject.access, null, 65536)
      assert.equal(r.kind, 'page')
      if (r.kind === 'page') assert.ok(r.page.rows.every((r, i) => r.seq === String(i)))
    }),
    caseOf('foreign-cursor-is-invalid', 'RQ11/十进制序位', async () => {
      const head = first.rows[0]
      assert.ok(head, 'History conformance needs a row')
      const other: HistoryEvidence = { ...evidence, upper: { kind: 'entry', seq: head.seq } }
      const result = await read(subject.access, { evidence: other, after: head.seq }, 65536)
      assert.equal(result.kind, 'invalid')
    }),
    caseOf('page-respects-byte-budget', 'RQ11-28/H5', async () => {
      const [head, next] = first.rows
      assert.ok(head && next, 'History conformance needs at least two rows')
      const bytes = Number(head.bytes)
      assert.ok(Number.isSafeInteger(bytes) && bytes > 0 && BigInt(next.bytes) > 0n)
      const page = await read(subject.access, null, bytes)
      assert.equal(page.kind, 'page')
      if (page.kind !== 'page') return
      assert.deepEqual(
        page.page.rows.map(row => row.seq),
        [head.seq],
      )
      assert.ok(page.page.rows.reduce((sum, row) => sum + BigInt(row.bytes), 0n) <= BigInt(bytes))
      assert.equal(page.page.next?.after, head.seq)
      const following = await read(subject.access, page.page.next, Number(next.bytes))
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
        let after: HistoryCursor | null = null
        const cursors = new Set<string>()
        while (true) {
          const result = await source.read({
            access: subject.access,
            evidence,
            cursor: after,
            budgetBytes: Number(bytes),
          })
          assert.equal(result.kind, 'page')
          if (result.kind !== 'page') throw new Error('Expected fixture history page')
          rows.push(...result.page.rows)
          if (result.page.next === null) break
          assert.ok(!cursors.has(result.page.next.after), 'History pages must advance')
          cursors.add(result.page.next.after)
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
              index === 0
                ? {
                    seq: value.seq,
                    entry: value.entry,
                    bytes: value.bytes,
                    message: changedMessage,
                  }
                : value,
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
      const page = await read(subject.access, { evidence, after: head.seq }, Number(next.bytes))
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
  'retention-measures-the-whole-set',
  'plan-progress-and-policy-checked',
  'trim-is-not-a-step',
  'entered-plan-changes-outcome',
  'tail-facts-never-enter-snapshot',
  'pages-share-evidence',
  'unknown-source-not-empty',
  'unstable-group-is-unavailable',
  'lease-is-given-back',
] as const
export type RequestContextObligation = (typeof REQUEST_CONTEXT_OBLIGATIONS)[number]
export const HISTORY_SOURCE_OBLIGATIONS = [
  'read-requires-access',
  'tenant-isolation',
  'page-size-retains-order',
  'foreign-cursor-is-invalid',
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
export function requestContextConformance(): readonly ConformanceCase<ConformanceSubject>[] {
  return suite(REQUEST_CONTEXT_OBLIGATIONS, requestContextCases)
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
