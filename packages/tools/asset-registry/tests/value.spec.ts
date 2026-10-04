// @module-tag slow
// 归慢层：重 CPU：每条用例的夹具都跑一次完整的资产评估（真实编译 JSON Schema），再建表与快照。
import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { ManifestRecord } from '@omne-harness-lite/assembly-manifest-store'
import {
  buildTableContents,
  buildSnapshots,
  buildReport,
  computeAvailability,
  findInSnapshot,
  extractRootSourceFromFullFillRecord,
  REGISTERED_CATEGORIES,
} from '../src/index.ts'
import { readRegistryRecord } from '../src/records.ts'
import { readReport, within, refreshRun } from '../src/report.ts'
import { fixture, root, a, b, tool } from './support.ts'
function prepared() {
  const f = fixture(),
    built = buildTableContents(f.evaluation, f.order, f.definitions)
  expect(built).toHaveProperty('plans')
  if (!('plans' in built)) throw new Error('fixture table build failed')
  const record = {
    session: unwrap(parseOpaqueIdentifier('session_a', 'SessionRef')),
    seq: 1,
    evaluationRef: unwrap(parseOpaqueIdentifier('given_a', 'EvaluationRef')),
    evaluation: { kind: 'given', ref: 'given_a' },
    tables: Object.fromEntries(
      built.plans.map(plan => [plan.category, { filledAt: 1, composition: plan.composition }]),
    ),
    content: {
      evaluation: f.evaluation,
      compositionOrder: f.order,
      filledBy: { kind: 'assembly' },
    },
  } as unknown as ManifestRecord
  return { ...f, built, record, snapshots: buildSnapshots(record, built.plans) }
}
test('full E and caller order produce six immutable tables; collection order does not change the explicit sequence', () => {
  const f = prepared()
  expect(f.snapshots).toHaveLength(6)
  expect(
    f.snapshots.find(s => s.category === 'loop_extension')?.entries.map(e => e.capability),
  ).toEqual([b, a])
  const reordered = {
    ...f.evaluation,
    assets: [...f.evaluation.assets].reverse(),
    composition: [...f.evaluation.composition].reverse(),
  }
  expect(buildTableContents(reordered, f.order, f.definitions)).toEqual(f.built)
  const content = f.record.content
  if (content === null || typeof content !== 'object' || Array.isArray(content))
    throw new Error('fixture manifest content must be an object')
  expect(Object.keys(content)).toEqual(['evaluation', 'compositionOrder', 'filledBy'])
  expect(extractRootSourceFromFullFillRecord(f.record, 'session_a', 1)).toHaveProperty(
    'rootSource',
    { asset: f.definitions[0]!.id, version: 1 },
  )
})
for (const [label, make] of [
  ['missing', (order: unknown[]) => undefined],
  ['duplicate', (order: unknown[]) => [...order, order[0]]],
  ['omit', (order: unknown[]) => order.slice(1)],
  ['root', (order: unknown[]) => [...order, root]],
  ['extra', (order: unknown[]) => [...order, { category: 'tool', name: 'example:extra' }]],
] as const)
  test(`caller order ${label} is rejected before table construction`, () => {
    const f = fixture()
    expect(buildTableContents(f.evaluation, make([...f.order]), f.definitions)).toEqual({
      failure: 'invalidInput',
    })
  })
for (const [label, mutate] of [
  ['wrong session', (r: any) => ({ ...r, session: 'session_b' })],
  ['past H', (r: any) => ({ ...r, seq: 2 })],
  ['ref mismatch', (r: any) => ({ ...r, evaluationRef: 'other_given' })],
  [
    'not given',
    (r: any) => ({
      ...r,
      evaluation: { kind: 'mint' },
      content: { ...r.content, filledBy: { kind: 'reload', command: 'omne-official:reload-tool' } },
    }),
  ],
  [
    'wrong filledBy',
    (r: any) => ({ ...r, content: { ...r.content, filledBy: { kind: 'asset_change' } } }),
  ],
  [
    'seventh table',
    (r: any) => ({ ...r, tables: { ...r.tables, connector: { filledAt: 1, composition: [] } } }),
  ],
  [
    'missing empty table',
    (r: any) => ({
      ...r,
      tables: Object.fromEntries(Object.entries(r.tables).filter(([key]) => key !== 'plugin')),
    }),
  ],
  [
    'reordered composition',
    (r: any) => ({
      ...r,
      tables: {
        ...r.tables,
        loop_extension: {
          ...r.tables.loop_extension,
          composition: [...r.tables.loop_extension.composition].reverse(),
        },
      },
    }),
  ],
  [
    'extra content slot',
    (r: any) => ({ ...r, content: { ...r.content, rootSource: { asset: 'fake', version: 1 } } }),
  ],
] as const)
  test(`original fill proof rejects ${label}`, () => {
    const f = prepared()
    expect(extractRootSourceFromFullFillRecord(mutate(f.record), 'session_a', 1)).toEqual({
      failure: 'unavailable',
    })
  })
test('exact mathematical version equality retains large numbers and does not equate booleans', () => {
  const f = prepared(),
    e = {
      ...f.evaluation,
      assets: f.evaluation.assets.map(asset =>
        asset.capability.category === 'agent_definition'
          ? { ...asset, version: new LosslessNumber('9007199254740993') }
          : asset,
      ),
    }
  const r = {
    ...f.record,
    content: { evaluation: e, compositionOrder: f.order, filledBy: { kind: 'assembly' } },
  }
  expect(extractRootSourceFromFullFillRecord(r, 'session_a', 1)).toHaveProperty(
    'rootSource.version',
    new LosslessNumber('9007199254740993'),
  )
  expect(
    extractRootSourceFromFullFillRecord(
      {
        ...r,
        content: {
          ...r.content,
          evaluation: { ...e, assets: e.assets.map(asset => ({ ...asset, version: true })) },
        },
      },
      'session_a',
      1,
    ),
  ).toEqual({ failure: 'unavailable' })
})
test('body selection is the exact original version; missing old body never falls forward', () => {
  const f = fixture(),
    defs = f.definitions.map(def =>
      def.capability.category === 'tool'
        ? { ...def, versions: [{ ...def.versions[0]!, number: 2 }] }
        : def,
    )
  expect(buildTableContents(f.evaluation, f.order, defs)).toEqual({ failure: 'unavailable' })
})
test('deep outputs cannot be mutated and tool lookup uses model name only', () => {
  const f = prepared(),
    s = f.snapshots.find(s => s.category === 'tool')!
  expect(() => {
    ;(s.entries as any[]).push({})
  }).toThrow()
  expect(() => {
    ;(s.entries[0]!.capability as any).name = 'mutated'
  }).toThrow()
  expect(findInSnapshot(s, 'example__read')).toHaveProperty('entry')
  expect(findInSnapshot(s, 'example:read')).toEqual({ none: true })
})
test('missing and unreadable dependency reasons are distinct and duplicate observations cannot grant availability', () => {
  const f = prepared(),
    entry = f.snapshots.find(s => s.category === 'tool')!.entries[0]!,
    dep = { kind: 'external_service', name: 'actual_service' }
  expect(computeAvailability(entry, [dep], { dependencies: [] })).toHaveProperty(
    'availability.for.0.state',
    'unreadable',
  )
  expect(
    computeAvailability(entry, [dep], { dependencies: [{ dependency: dep, state: 'missing' }] }),
  ).toHaveProperty('availability.for.0.state', 'missing')
  expect(
    computeAvailability(entry, [dep], {
      dependencies: [
        { dependency: dep, state: 'satisfied' },
        { dependency: dep, state: 'satisfied' },
      ],
    }),
  ).toHaveProperty('availability.kind', 'stand_in')
  expect(
    computeAvailability(entry, [dep], { dependencies: [{ dependency: dep, state: 'satisfied' }] }),
  ).toHaveProperty('availability.kind', 'available')
})
test('reuse accepts only an ordered subsequence with original full E/O', () => {
  const f = prepared(),
    r = {
      ...f.record,
      evaluation: { kind: 'reuse', ref: f.record.evaluationRef },
      tables: { slash_command: { filledAt: 2, composition: [] } },
      content: { ...(f.record.content as object), filledBy: { kind: 'asset_change' } },
    }
  expect(readRegistryRecord(r, 'session_a', 1)).toBeDefined()
  expect(
    readRegistryRecord(
      {
        ...r,
        tables: {
          slash_command: {
            filledAt: 2,
            composition: [
              {
                capability: { category: 'slash_command', name: 'example:new' },
                asset: 'ast_fake',
                version: 1,
                from: 'factory',
              },
            ],
          },
        },
      },
      'session_a',
      1,
    ),
  ).toBeUndefined()
})
test('report binds all six snapshots and exact session/run/attempt; no head slot is invented', () => {
  const f = prepared(),
    report = buildReport(
      'session_a',
      'run_a' as any,
      1 as any,
      unwrap(instantFromEpochMs(2)),
      f.snapshots,
      f.evaluation,
      [],
      [],
    )
  expect(readReport(report, 'session_a')).toEqual(report)
  expect(report).not.toHaveProperty('head')
  expect(Object.keys(report.effectivePermissions)).toEqual(['example__read'])
  expect(within({ kind: 'run', report }, 'session_b')).toBeUndefined()
  expect(refreshRun({ kind: 'continue', runId: 'run_b', report }, 'session_a')).toBeUndefined()
  expect(readReport({ ...report, attempt: true }, 'session_a')).toBeUndefined()
  expect(
    readReport({ ...report, snapshots: report.snapshots.slice(1) }, 'session_a'),
  ).toBeUndefined()
})
