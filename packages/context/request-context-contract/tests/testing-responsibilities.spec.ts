import { expect, it } from 'vitest'
import type { CompactionMessage } from '@omne-harness/message'
import {
  coverageSchema,
  decodeEpochId,
  project,
  type Coverage,
} from '@omne-harness/request-context-contract'
import {
  createMemoryHistorySource,
  createScriptedCompactionPolicy,
  FIXTURE_COMPACTION_POLICY,
} from '@omne-harness/request-context-contract/testing'
import {
  fixture,
  row,
  entry,
  scope,
  epoch,
  text,
  message,
  evidence,
  target,
  upper,
  seq,
  assemble,
} from './fixtures.js'
import type { HistoryEvidence } from '@omne-harness/request-context-contract'
function historyFixture() {
  const f = fixture(),
    rows = [row(0), row(1), row(2), row(3)]
  return {
    f,
    data: {
      scope,
      tenant: f.input.identity.access.tenant,
      epochs: [
        {
          epoch,
          rows,
          entries: [
            { ref: rows[0]!.entry, message: rows[0]!.message },
            { ref: entry('entry:metadata'), message: null },
            ...rows.slice(1).map(row => ({ ref: row.entry, message: row.message })),
          ],
          open: [rows[0]!.entry, rows[3]!.entry],
        },
      ],
    },
  }
}
function compaction(): CompactionMessage {
  return {
    role: 'compaction',
    id: message('summary').id,
    blocks: [text('summary')],
    covers: { from: entry('entry:0'), to: entry('entry:2') },
    retained: [entry('entry:0')],
    derivation: evidence,
  }
}
const origin = entry('entry:0')
const initial = { kind: 'initial' as const }
function at(epochId: HistoryEvidence['epoch'], last: number): HistoryEvidence {
  return { target, epoch: epochId, upper: upper(last) }
}
it('compaction context preserves non-message entries, after entries and the complete open-work responsibility', async () => {
  const { f, data } = historyFixture(),
    source = createMemoryHistorySource<string>(data)
  const access = f.input.identity.access
  const evidence3 = at(epoch, 3)
  const result = await source.compactionContext({
    access,
    evidence: evidence3,
    coverTo: entry('entry:1'),
  })
  expect(result).toEqual({
    kind: 'context',
    evidence: evidence3,
    value: {
      origin,
      base: initial,
      covered: data.epochs[0]!.entries.slice(0, 3),
      after: data.epochs[0]!.entries.slice(3),
      open: [entry('entry:0'), entry('entry:3')],
    },
  })
  expect(
    await source.compactionContext({
      access: null as never,
      evidence: evidence3,
      coverTo: entry('entry:1'),
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'missing-access' })
  expect(
    await source.compactionContext({
      access,
      evidence: {
        ...evidence3,
        target: { ...target, scope: { ref: 'scope:other' as typeof scope.ref } },
      },
      coverTo: entry('entry:1'),
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'missing-scope' })
  expect(
    await source.compactionContext({ access, evidence: at(epoch, 99), coverTo: entry('entry:1') }),
  ).toMatchObject({ kind: 'invalid', reason: 'upper-out-of-range' })
  expect(
    await source.compactionContext({ access, evidence: evidence3, coverTo: entry('entry:absent') }),
  ).toMatchObject({ kind: 'invalid' })
  source.denyTenant(access.tenant)
  expect(
    await source.compactionContext({ access, evidence: evidence3, coverTo: entry('entry:1') }),
  ).toEqual({ kind: 'denied' })
  const failed = createMemoryHistorySource<string>(data)
  failed.fail('offline')
  expect(
    await failed.compactionContext({ access, evidence: evidence3, coverTo: entry('entry:1') }),
  ).toEqual({ kind: 'unavailable', diagnostic: 'offline' })
})
it('a synthesized compaction epoch exposes the same retained/summary/tail history through both read ports', async () => {
  const { f, data } = historyFixture(),
    source = createMemoryHistorySource<string>(data),
    record = compaction()
  const access = f.input.identity.access
  const next = source.commitCompaction(record)
  expect(next).not.toBe(epoch)
  const old = await source.read({
    access,
    evidence: at(epoch, 3),
    cursor: null,
    budgetBytes: 65536,
  })
  expect(old).toMatchObject({ kind: 'epoch-changed', current: { epoch: next, upper: upper(2) } })
  expect(
    await source.compactionContext({ access, evidence: at(epoch, 3), coverTo: record.covers.to }),
  ).toMatchObject({ kind: 'epoch-changed' })
  const current = at(next, 2)
  const page = await source.read({ access, evidence: current, cursor: null, budgetBytes: 65536 })
  expect(page.kind).toBe('page')
  if (page.kind !== 'page') throw new Error(page.kind)
  expect(page.page.rows.map(row => row.seq)).toEqual([seq(0), seq(1), seq(2)])
  expect(page.page.rows.map(row => row.message)).toEqual([row(0).message, record, row(3).message])
  const summaryEntry = page.page.rows[1]!.entry
  expect(summaryEntry).not.toBe(entry('entry:0'))
  const context = await source.compactionContext({
    access,
    evidence: current,
    coverTo: summaryEntry,
  })
  expect(context).toEqual({
    kind: 'context',
    evidence: current,
    value: {
      origin,
      base: { kind: 'previous', record: summaryEntry, pairings: [] },
      covered: [
        { ref: entry('entry:0'), message: row(0).message },
        { ref: summaryEntry, message: record },
      ],
      after: [{ ref: entry('entry:3'), message: row(3).message }],
      open: [entry('entry:0'), entry('entry:3')],
    },
  })
})
it('retaining the coverage endpoint and colliding opaque refs never overwrite the new compaction record', async () => {
  const { f, data } = historyFixture(),
    record = { ...compaction(), retained: [entry('entry:2')] }
  // Existing opaque refs can have the exact spelling chosen by an internal generator.
  const occupied = entry('compaction:' + record.id)
  const occupiedSuffix = entry('compaction:' + record.id + ':1')
  const previous = data.epochs[0]!
  const tail = { ...row(3), entry: occupied }
  const fixtureData = {
    ...data,
    epochs: [
      {
        ...previous,
        rows: [...previous.rows.slice(0, 3), tail],
        entries: [
          ...previous.entries.slice(0, 4),
          { ref: occupied, message: tail.message },
          { ref: occupiedSuffix, message: null },
        ],
        open: [entry('entry:2'), occupied, occupiedSuffix],
      },
    ],
  }
  const access = f.input.identity.access
  const source = createMemoryHistorySource<string>(fixtureData),
    next = source.commitCompaction(record),
    current = at(next, 2)
  const result = await source.read({ access, evidence: current, cursor: null, budgetBytes: 65536 })
  if (result.kind !== 'page') throw new Error(result.kind)
  const refs = result.page.rows.map(row => row.entry),
    inserted = result.page.rows[1]!
  expect(new Set(refs).size).toBe(3)
  expect(inserted.message).toEqual(record)
  expect(inserted.entry).not.toBe(record.covers.to)
  expect(inserted.entry).not.toBe(occupied)
  expect(inserted.entry).not.toBe(occupiedSuffix)
  expect(
    await source.compactionContext({ access, evidence: current, coverTo: inserted.entry }),
  ).toEqual({
    kind: 'context',
    evidence: current,
    value: {
      origin,
      base: { kind: 'previous', record: inserted.entry, pairings: [] },
      covered: [
        { ref: entry('entry:2'), message: row(2).message },
        { ref: inserted.entry, message: record },
      ],
      after: [
        { ref: occupied, message: tail.message },
        { ref: occupiedSuffix, message: null },
      ],
      open: [entry('entry:2'), occupied, occupiedSuffix],
    },
  })
})
it('a non-message coverage endpoint does not duplicate earlier rows or discard the uncovered tail', async () => {
  const { f, data } = historyFixture(),
    record = { ...compaction(), covers: { from: entry('entry:0'), to: entry('entry:metadata') } }
  const access = f.input.identity.access
  const source = createMemoryHistorySource<string>(data),
    next = source.commitCompaction(record),
    current = at(next, 4)
  const result = await source.read({ access, evidence: current, cursor: null, budgetBytes: 65536 })
  if (result.kind !== 'page') throw new Error(result.kind)
  expect(result.page.rows.map(row => row.message)).toEqual([
    row(0).message,
    record,
    row(1).message,
    row(2).message,
    row(3).message,
  ])
  const inserted = result.page.rows[1]!
  expect(
    await source.compactionContext({ access, evidence: current, coverTo: inserted.entry }),
  ).toEqual({
    kind: 'context',
    evidence: current,
    value: {
      origin,
      base: { kind: 'previous', record: inserted.entry, pairings: [] },
      covered: [
        { ref: entry('entry:0'), message: row(0).message },
        { ref: inserted.entry, message: record },
      ],
      after: [1, 2, 3].map(i => ({ ref: entry('entry:' + i), message: row(i).message })),
      open: [entry('entry:0'), entry('entry:3')],
    },
  })
})
it('a supplied next epoch controls the post-commit projection and access still applies', async () => {
  const { f, data } = historyFixture(),
    decoded = decodeEpochId('epoch:prepared')
  if ('failure' in decoded) throw new Error('Epoch fixture')
  const record = compaction(),
    newEntry = entry('entry:predeclared-summary')
  const rows = [
    row(0),
    { seq: seq(1), entry: newEntry, bytes: row(2).bytes, message: record },
    { ...row(3), seq: seq(2) },
  ]
  const source = createMemoryHistorySource<string>({
    ...data,
    epochs: [
      ...data.epochs,
      {
        epoch: decoded.ok,
        rows,
        entries: rows.map(row => ({ ref: row.entry, message: row.message })),
        open: [entry('entry:0'), entry('entry:3')],
      },
    ],
  })
  const access = f.input.identity.access
  expect(source.commitCompaction(record)).toBe(decoded.ok)
  expect(
    await source.read({
      access: null as never,
      evidence: at(decoded.ok, 2),
      cursor: null,
      budgetBytes: 65536,
    }),
  ).toMatchObject({ kind: 'invalid', reason: 'missing-access' })
  expect(
    await source.compactionContext({ access, evidence: at(decoded.ok, 2), coverTo: newEntry }),
  ).toEqual({
    kind: 'context',
    evidence: at(decoded.ok, 2),
    value: {
      origin,
      base: { kind: 'previous', record: newEntry, pairings: [] },
      covered: [
        { ref: entry('entry:0'), message: row(0).message },
        { ref: newEntry, message: record },
      ],
      after: [{ ref: entry('entry:3'), message: row(3).message }],
      open: [entry('entry:0'), entry('entry:3')],
    },
  })
})
it('scripted compaction preserves the mandatory floor and spends remaining budget on newer message entries', async () => {
  const { data } = historyFixture(),
    context = {
      origin,
      base: initial,
      covered: data.epochs[0]!.entries.slice(0, 4),
      after: [{ ref: entry('entry:3'), message: row(3).message }],
      open: [entry('entry:0'), entry('entry:3')],
    }
  const policy = createScriptedCompactionPolicy({
    ...FIXTURE_COMPACTION_POLICY,
    retainBudget: { kind: 'tokens', retainTokens: '20' },
    trimFirst: true,
  })
  const input = {
    context,
    view: project(data.epochs[0]!.rows, epoch),
    measure: async (refs: readonly unknown[]) => ({
      kind: 'measured' as const,
      tokens: String(new Set(refs).size * 10),
    }),
    windowTokens: '100',
  }
  const draft = await policy.plan(input)
  expect(draft).toEqual({
    kind: 'draft',
    coverTo: entry('entry:2'),
    retained: [entry('entry:0'), entry('entry:2')],
    bound: '2',
    shape: { kind: 'summarize', trimFirst: true },
  })
  const ratio = createScriptedCompactionPolicy({
    ...policy.config,
    retainBudget: { kind: 'ratio', retainRatio: '0.2' },
  })
  expect(await ratio.plan(input)).toEqual(draft)
  const insufficient = createScriptedCompactionPolicy({
    ...policy.config,
    retainBudget: { kind: 'tokens', retainTokens: '5' },
  })
  expect(await insufficient.plan(input)).toEqual({
    kind: 'floor-exceeds-budget',
    floor: [entry('entry:0')],
    budget: '5',
  })
  await expect(
    policy.plan({ ...input, context: { ...context, covered: [], after: [], open: [] } }),
  ).rejects.toThrow()
})
async function coveragePacket(): Promise<Coverage> {
  const f = fixture(),
    result = await assemble(
      {
        ...f.input,
        promptContributions: {
          contributions: [
            {
              kind: 'section',
              name: 'guidance',
              order: '1',
              template: 'Be clear',
              uses: [],
              scope: null,
              revision: '1',
              source: f.input.selection.profile.adoption,
            },
          ],
          digest: 'sections:1',
          generation: 'g',
        },
        alterations: [{ evidence, touches: 'existing-layers' }],
      },
      f.ports,
      f.policies,
    )
  if (result.kind !== 'candidate-before-extension') throw new Error(result.kind)
  return {
    ...result.candidate.coverage,
    budget: {
      ...result.candidate.coverage.budget,
      kind: 'deferred-media',
      deferred: [
        { storage: 'store', key: 'image', mediaType: 'image/png', bytes: '10', digest: 'media' },
      ],
    },
  }
}
it('coverage accepts complete section, alteration and deferred-reference evidence from a real candidate', async () => {
  expect(coverageSchema['~standard'].validate(await coveragePacket())).toHaveProperty('value')
})
it.each([
  [
    'deferred byte budget is not integral',
    (value: Coverage) => ({
      ...value,
      budget: { ...value.budget, deferred: [{ ...value.budget.deferred[0], bytes: '1.5' }] },
    }),
  ],
  [
    'deferred source has no storage',
    (value: Coverage) => ({
      ...value,
      budget: { ...value.budget, deferred: [{ ...value.budget.deferred[0], storage: null }] },
    }),
  ],
  [
    'alteration claims an unknown affected layer',
    (value: Coverage) => ({ ...value, alterations: [{ evidence, touches: 'history-head' }] }),
  ],
  [
    'alteration loses its durable digest',
    (value: Coverage) => ({
      ...value,
      alterations: [{ evidence: { ...evidence, digest: null }, touches: 'history-tail' }],
    }),
  ],
  [
    'section has an invalid scope reference',
    (value: Coverage) => ({
      ...value,
      prompt: { ...value.prompt, sections: [{ ...value.prompt.sections[0], scope: { ref: '' } }] },
    }),
  ],
  [
    'section loses its adoption',
    (value: Coverage) => ({
      ...value,
      prompt: { ...value.prompt, sections: [{ ...value.prompt.sections[0], source: null }] },
    }),
  ],
  [
    'section revision becomes numeric',
    (value: Coverage) => ({
      ...value,
      prompt: { ...value.prompt, sections: [{ ...value.prompt.sections[0], revision: 1 }] },
    }),
  ],
] as const)('coverage rejects durable evidence corruption: %s', async (_name, corrupt) => {
  expect(coverageSchema['~standard'].validate(corrupt(await coveragePacket()))).toHaveProperty(
    'issues',
  )
})
