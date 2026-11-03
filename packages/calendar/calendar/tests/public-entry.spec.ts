import { describe, expect, it } from 'vitest'
import { calendarSnapshotSchema } from '@omne-harness/calendar-contract'
import {
  classifyDay,
  countWorkingDays,
  shiftWorkingDays,
  listWorkingDays,
  selectNthWorkingDay,
} from '@omne-harness/calendar'

const snapshot = calendarSnapshotSchema.parse({
  calendarId: 'cn-statutory',
  versionId: '2024-a',
  coverageStart: '2024-01-01',
  coverageEnd: '2024-12-31',
  timezone: 'Asia/Shanghai',
  weeklyDefault: [
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'nonWorkingDay',
    'nonWorkingDay',
  ],
  overrides: [
    {
      date: '2024-02-18',
      classification: 'workingDay',
      provenanceRefs: ['state-council-2024'],
      notes: [],
    },
    {
      date: '2024-02-12',
      classification: 'holiday',
      provenanceRefs: ['state-council-2024'],
      notes: ['Full day'],
    },
  ],
  knowledgeAsOf: '2023-10-25T00:00:00.000Z',
  synthesizedAt: '2023-10-26T00:00:00.000Z',
  contentHash: 'a'.repeat(64),
  provenanceRefs: ['state-council-2024'],
  publicationGeneration: 1,
})

describe('public snapshot calculations', () => {
  it('uses statutory overrides before the weekday template and retains provenance', () => {
    expect(classifyDay({ snapshot, date: '2024-02-18' })).toMatchObject({
      kind: 'ok',
      classification: 'workingDay',
      working: true,
      holiday: false,
      override: true,
      provenanceRefs: ['state-council-2024'],
      basis: {
        calendarId: 'cn-statutory',
        versionId: '2024-a',
        publicationGeneration: 1,
        inspectedRange: { from: '2024-02-18', to: '2024-02-18' },
      },
    })
    expect(classifyDay({ snapshot, date: '2024-02-12' })).toMatchObject({
      kind: 'ok',
      classification: 'holiday',
      holiday: true,
      working: false,
    })
    expect(classifyDay({ snapshot, date: '2024-02-17' })).toMatchObject({
      kind: 'ok',
      classification: 'nonWorkingDay',
      override: false,
    })
  })
  it('counts both endpoints including a leap day and rejects reversed ranges', () => {
    expect(countWorkingDays({ snapshot, from: '2024-02-28', to: '2024-02-29' })).toMatchObject({
      kind: 'ok',
      count: 2,
    })
    expect(countWorkingDays({ snapshot, from: '2024-02-29', to: '2024-02-28' })).toMatchObject({
      kind: 'invalid',
    })
  })
  it('excludes the starting date when shifting in either direction and verifies zero coverage', () => {
    expect(shiftWorkingDays({ snapshot, date: '2024-02-16', offset: 1 })).toMatchObject({
      kind: 'ok',
      date: '2024-02-18',
      basis: { inspectedRange: { from: '2024-02-17', to: '2024-02-18' } },
    })
    expect(shiftWorkingDays({ snapshot, date: '2024-02-19', offset: -1 })).toMatchObject({
      kind: 'ok',
      date: '2024-02-18',
    })
    expect(shiftWorkingDays({ snapshot, date: '2024-02-17', offset: 0 })).toMatchObject({
      kind: 'ok',
      date: '2024-02-17',
    })
    expect(shiftWorkingDays({ snapshot, date: '2025-01-01', offset: 0 })).toMatchObject({
      kind: 'coverageInsufficient',
    })
  })
  it('lists strictly after and refuses partial results at the coverage boundary', () => {
    expect(listWorkingDays({ snapshot, after: '2024-02-16', count: 2 })).toMatchObject({
      kind: 'ok',
      dates: ['2024-02-18', '2024-02-19'],
    })
    expect(listWorkingDays({ snapshot, after: '2024-12-30', count: 2 })).toMatchObject({
      kind: 'coverageInsufficient',
    })
    for (const count of [0, -1, 367, 1.5, Infinity, NaN])
      expect(listWorkingDays({ snapshot, after: '2024-02-16', count })).toMatchObject({
        kind: 'invalid',
      })
  })
  it('selects positive ordinals or last and only reports empty after inspecting the period', () => {
    const period = { snapshot, periodStart: '2024-02-16', periodEnd: '2024-02-19' }
    expect(selectNthWorkingDay({ ...period, ordinal: 2 })).toMatchObject({
      kind: 'ok',
      date: '2024-02-18',
    })
    expect(selectNthWorkingDay({ ...period, ordinal: 'last' })).toMatchObject({
      kind: 'ok',
      date: '2024-02-19',
    })
    expect(selectNthWorkingDay({ ...period, ordinal: 4 })).toMatchObject({
      kind: 'ok',
      date: null,
      basis: { inspectedRange: { from: '2024-02-16', to: '2024-02-19' } },
    })
    expect(
      selectNthWorkingDay({
        snapshot,
        periodStart: '2024-12-31',
        periodEnd: '2025-01-01',
        ordinal: 2,
      }),
    ).toMatchObject({ kind: 'coverageInsufficient' })
  })
  it('distinguishes invalid inputs, missing coverage and exhausted budgets without a success basis', () => {
    const failures = [
      classifyDay({ snapshot, date: '2024-02-30' }),
      classifyDay({ snapshot, date: '2025-01-01' }),
      countWorkingDays({ snapshot, from: '2024-01-01', to: '2024-01-03', scanBudget: 2 }),
      shiftWorkingDays({ snapshot, date: '2024-02-16', offset: 1, scanBudget: 1 }),
      listWorkingDays({ snapshot, after: '2024-02-16', count: 2, scanBudget: 1 }),
      selectNthWorkingDay({
        snapshot,
        periodStart: '2024-02-16',
        periodEnd: '2024-02-19',
        ordinal: 'last',
        scanBudget: 1,
      }),
    ]
    expect(failures.map(result => result.kind)).toEqual([
      'invalid',
      'coverageInsufficient',
      'searchLimit',
      'searchLimit',
      'searchLimit',
      'searchLimit',
    ])
    for (const result of failures) expect(result).not.toHaveProperty('basis')
    for (const offset of [1.2, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(shiftWorkingDays({ snapshot, date: '2024-02-16', offset })).toMatchObject({
        kind: 'invalid',
      })
    expect(
      selectNthWorkingDay({
        snapshot,
        periodStart: '2024-02-19',
        periodEnd: '2024-02-16',
        ordinal: 1,
      }),
    ).toMatchObject({ kind: 'invalid' })
    expect(
      selectNthWorkingDay({
        snapshot,
        periodStart: '2024-02-16',
        periodEnd: '2024-02-19',
        ordinal: 0,
      }),
    ).toMatchObject({ kind: 'invalid' })
  })
  it('is deterministic and leaves the snapshot and nested values immutable', () => {
    const before = JSON.stringify(snapshot)
    const first = listWorkingDays({ snapshot, after: '2024-02-16', count: 2 })
    expect(listWorkingDays({ snapshot, after: '2024-02-16', count: 2 })).toEqual(first)
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.overrides[0])).toBe(true)
    expect(Object.isFrozen(snapshot.weeklyDefault)).toBe(true)
    expect(Object.isFrozen(snapshot.overrides[0]?.provenanceRefs)).toBe(true)
  })
})
