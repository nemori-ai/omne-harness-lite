import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  classifyCalendarSupplyHorizon,
  classifyRemainingCoverageDays,
  computeUsFederalCalendar,
  parseLanceliaoCalendar,
  parseOpmCalendar,
  shippedCalendarSupplyPolicies,
  synthesizeCalendarCandidate,
  validateCalendarCandidate,
} from '../../src/supply/index.ts'
import type {
  CalendarSupplyCandidate,
  CalendarSupplyPolicy,
  SourceContribution,
  SourceParseResult,
  SupplyDay,
  SupplyIndependenceRegistration,
} from '../../src/supply/index.ts'

const material = {
  acquiredAt: '2026-08-21T00:00:00Z',
  knowledgeAsOf: '2026-08-20T00:00:00Z',
  reference: 'synthetic validation scenario; not issuance data',
}
const bytes = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
const success = (result: SourceParseResult) => {
  if (result.kind !== 'success') throw new Error(JSON.stringify(result))
  return result.contribution
}
const policy = (id: string): CalendarSupplyPolicy => {
  const found = shippedCalendarSupplyPolicies.find(item => item.calendarId === id)
  if (!found) throw new Error('missing policy')
  return found
}
let us: CalendarSupplyPolicy
let truth: SourceContribution
let oracle: SourceContribution
let emptyFeed: SourceContribution
let registry: SupplyIndependenceRegistration[]
let current: CalendarSupplyCandidate
beforeEach(() => {
  us = policy('us-federal-holidays')
  truth = success(computeUsFederalCalendar({ ...material, start: '2025-01-01', end: '2025-12-31' }))
  oracle = success(
    parseOpmCalendar({
      ...material,
      mediaType: 'text/calendar',
      content: bytes('holidays_capture_20260821.ics'),
    }),
  )
  emptyFeed = {
    ...truth,
    sourceId: 'federal-register-eo-feed',
    role: 'exceptionFeed',
    lineageRef: 'synthetic FR observation',
    days: [],
    checks: [],
  }
  registry = [
    {
      truthSourceId: truth.sourceId,
      oracleSourceId: oracle.sourceId,
      independent: true,
      evidenceRef: 'test registration of fixed OPM publication versus computed rules',
    },
  ]
  current = candidate([truth, emptyFeed])
})
function candidate(contributions: readonly SourceContribution[]): CalendarSupplyCandidate {
  const result = synthesizeCalendarCandidate({ policy: us, contributions })
  if (result.kind !== 'success') throw new Error(JSON.stringify(result))
  return result.candidate
}
function closure(
  date: string,
  authorityRef: string,
  category: 'holiday' | 'workingDay' = 'holiday',
): SupplyDay {
  return {
    date,
    category,
    provenance: [
      {
        sourceId: emptyFeed.sourceId,
        authorityRef,
        note: 'synthetic closure for validation branch',
        rawSha256: emptyFeed.material.rawSha256,
      },
    ],
  }
}
const validate = (
  value: CalendarSupplyCandidate,
  previous?: CalendarSupplyCandidate,
  oracles: readonly SourceContribution[] = [oracle],
) =>
  validateCalendarCandidate({
    policy: us,
    candidate: value,
    oracles,
    independenceRegistry: registry,
    ...(previous ? { current: previous } : {}),
  })

describe('candidate authority and coverage', () => {
  it.each(['toString', 'constructor', '__proto__'])(
    'does not resolve inherited properties as declared invariant %s',
    invariantId => {
      const result = validateCalendarCandidate({
        policy: {
          ...us,
          validation: {
            ...us.validation,
            invariants: [
              { invariantId, severity: 'blocker', description: 'Unknown invariant', params: {} },
            ],
          },
        },
        candidate: current,
        oracles: [oracle],
        independenceRegistry: registry,
      })
      expect(result.kind).toBe('unknown')
      expect(result.findings).toContainEqual(
        expect.objectContaining({ code: invariantId, status: 'unknown', severity: 'blocker' }),
      )
    },
  )
  it.each([NaN, Infinity, -Infinity])(
    'does not report health for an invalid threshold %s',
    threshold => {
      for (const field of ['criticalFloorDays', 'warningFloorDays'] as const) {
        expect(
          classifyCalendarSupplyHorizon({
            policy: { ...us, horizon: { ...us.horizon, [field]: threshold } },
            remainingCoverageDays: 400,
          }),
        ).toBe('unknown')
      }
    },
  )
  it('validates full-year statutory truth against registered captured oracle', () => {
    expect(validate(current).kind).toBe('success')
  })
  it('rejects same-lineage oracle even when sourceIds differ', () => {
    const result = validate(current, undefined, [{ ...oracle, lineageRef: truth.lineageRef }])
    expect(result.kind).toBe('rejected')
    expect(result.findings.find(finding => finding.code === 'oracle.independence')?.status).toBe(
      'failed',
    )
  })
  it('requires engineering registration instead of treating different strings as independence', () => {
    const result = validateCalendarCandidate({
      policy: us,
      candidate: current,
      oracles: [oracle],
      independenceRegistry: [],
    })
    expect(result.kind).toBe('unknown')
  })
  it('requires nonblank evidence for an independence registration', () => {
    const result = validateCalendarCandidate({
      policy: us,
      candidate: current,
      oracles: [oracle],
      independenceRegistry: registry.map(entry => ({ ...entry, evidenceRef: ' \t\n ' })),
    })
    expect(result.kind).toBe('unknown')
    expect(result.findings.find(finding => finding.code === 'oracle.independence')?.status).toBe(
      'unknown',
    )
  })
  it('retains unknown for a missing required exception observation', () => {
    expect(
      validate(candidate([truth])).findings.find(
        finding => finding.code === 'exception.unavailable',
      )?.status,
    ).toBe('unknown')
  })
  it('does not claim agreement outside oracle coverage', () => {
    const result = validate(current, undefined, [
      {
        ...oracle,
        coverageIntervals: [{ start: '2025-01-01', end: '2025-06-30' }],
        days: oracle.days.filter(day => day.date <= '2025-06-30' && day.date >= '2025-01-01'),
      },
    ])
    expect(result.kind).toBe('unknown')
    expect(result.findings.find(finding => finding.code === 'oracle.coverage')?.dates).toContain(
      '2025-12-31',
    )
    expect(result.findings.find(finding => finding.code === 'oracle.diff')?.status).toBe('unknown')
  })
  it('withholds an explicit oracle difference and carries references and dates', () => {
    const different = { ...oracle, days: oracle.days.filter(day => day.date !== '2025-02-17') }
    const result = validate(current, undefined, [different])
    expect(result.kind).toBe('withheld')
    expect(result.findings.find(finding => finding.code === 'oracle.diff')?.dates).toContain(
      '2025-02-17',
    )
    expect(result.materials).toContain(oracle.material)
  })
  it.each(['2025-02-17', '2025-12-25'])(
    'rejects missing statutory holiday %s even when total is still ten',
    holiday => {
      const incomplete = { ...truth, days: truth.days.filter(day => day.date !== holiday) }
      const result = validate(candidate([incomplete, emptyFeed]))
      expect(result.kind).toBe('rejected')
      if (holiday === '2025-12-25')
        expect(
          result.findings.find(finding => finding.code === 'us.christmas_observed')?.status,
        ).toBe('failed')
      expect(
        result.findings.find(finding => finding.code === 'us.statutory_holidays_present')?.dates,
      ).toEqual([holiday])
    },
  )
  it('rejects coverage shrink at either edge', () => {
    const narrower = {
      ...truth,
      coverageIntervals: [{ start: '2025-01-02', end: '2025-12-30' }],
      days: truth.days.filter(day => day.date > '2025-01-01' && day.date < '2025-12-31'),
    }
    expect(
      validate(candidate([narrower, emptyFeed]), current).findings.find(
        finding => finding.code === 'coverage.shrink',
      )?.dates,
    ).toEqual(['2025-01-01', '2025-12-31'])
  })
  it('rejects an exception trying to extend truth coverage', () => {
    expect(
      synthesizeCalendarCandidate({
        policy: us,
        contributions: [
          truth,
          {
            ...emptyFeed,
            coverageIntervals: [{ start: '2025-01-01', end: '2026-12-31' }],
            days: [closure('2026-01-02', 'test-new-eo')],
          },
        ],
      }).kind,
    ).toBe('rejected')
  })
  it('rejects provenance whose source/material does not match its contribution', () => {
    const day = truth.days[0]
    if (!day) throw new Error('empty truth')
    expect(
      synthesizeCalendarCandidate({
        policy: us,
        contributions: [
          {
            ...truth,
            days: [
              {
                ...day,
                provenance: [
                  {
                    sourceId: 'other',
                    authorityRef: 'test-ref',
                    rawSha256: truth.material.rawSha256,
                    note: '',
                  },
                ],
              },
            ],
          },
        ],
      }).kind,
    ).toBe('rejected')
  })
})

describe('overlap decisions preserve the previous version', () => {
  let before: CalendarSupplyCandidate
  beforeEach(() => {
    before = candidate([truth, { ...emptyFeed, days: [closure('2025-12-26', 'test-eo-original')] }])
  })
  it('withholds a silent overlapping change with its exact difference', () => {
    const changed = candidate([
      truth,
      { ...emptyFeed, days: [closure('2025-12-26', 'test-eo-original', 'workingDay')] },
    ])
    const report = validate(changed, before)
    expect(report.kind).toBe('withheld')
    expect(report.overlapChanges).toEqual([
      {
        date: '2025-12-26',
        previousCategory: 'holiday',
        candidateCategory: 'workingDay',
        newAuthorityRefs: [],
      },
    ])
    expect(
      report.findings.find(finding => finding.code === 'overlap.unsourced')?.references,
    ).toContain(material.reference)
  })
  it('treats deleting an override as a real overlapping change', () => {
    expect(validate(current, before).kind).toBe('withheld')
  })
  it('allows a new cited authority revision on a day already covered', () => {
    const changed = candidate([
      truth,
      { ...emptyFeed, days: [closure('2025-12-26', 'test-eo-new')] },
    ])
    const report = validate(changed, current)
    expect(report.kind).toBe('success')
    expect(report.overlapChanges[0]?.newAuthorityRefs).toEqual(['test-eo-new'])
  })
  it('rejects excessive exception closure injection', () => {
    const changed = candidate([
      truth,
      {
        ...emptyFeed,
        days: ['02', '03', '06', '07', '08'].map(day =>
          closure(`2025-01-${day}`, `test-eo-${day}`),
        ),
      },
    ])
    expect(
      validate(changed).findings.find(finding => finding.code === 'us.annual_exception_days_band')
        ?.status,
    ).toBe('failed')
  })
})

it('does not turn missing in-lieu data or delegated text into a passed blocker', () => {
  const cn = policy('cn-legal-holidays')
  const contribution = success(
    parseLanceliaoCalendar({ ...material, content: bytes('holiday_api_capture_20260821.json') }),
  )
  const built = synthesizeCalendarCandidate({ policy: cn, contributions: [contribution] })
  if (built.kind !== 'success') throw new Error('CN synthesis failed')
  const report = validateCalendarCandidate({
    policy: cn,
    candidate: built.candidate,
    oracles: [],
    independenceRegistry: [],
  })
  expect(report.kind).toBe('unknown')
  expect(
    report.findings.find(finding => finding.code === 'cn.in_lieu_subset_of_holidays')?.status,
  ).toBe('unknown')
})

describe('one target horizon policy for health and release consumers', () => {
  let cn: CalendarSupplyPolicy
  beforeEach(() => {
    cn = policy('cn-legal-holidays')
  })
  it.each([
    [12, 'ok'],
    [11, 'warning'],
    [0, 'warning'],
    [-1, 'critical'],
  ])('classifies CN remaining days %s as %s under A1-D3', (remainingCoverageDays, expected) => {
    expect(
      classifyCalendarSupplyHorizon({
        policy: cn,
        remainingCoverageDays: Number(remainingCoverageDays),
      }),
    ).toBe(expected)
  })
  it('preserves the source floor and the generic inclusive function for comparison', () => {
    expect(cn.horizon.criticalFloorDays).toBe(0)
    expect(
      classifyRemainingCoverageDays({
        remainingCoverageDays: 0,
        criticalFloorDays: 0,
        warningFloorDays: 11,
      }),
    ).toBe('critical')
  })
  it('keeps JP and US floors inclusive', () => {
    expect(
      classifyCalendarSupplyHorizon({
        policy: policy('jp-legal-holidays'),
        remainingCoverageDays: 270,
      }),
    ).toBe('critical')
    expect(classifyCalendarSupplyHorizon({ policy: us, remainingCoverageDays: 180 })).toBe(
      'critical',
    )
  })
})

it('permits a changed first-party authority material to revise an unchanged URL', () => {
  const jp = policy('jp-legal-holidays')
  const sourceId = 'cao-syukujitsu-csv'
  const jpDay = (day: string, rawSha256: string): SupplyDay => ({
    date: day,
    category: 'holiday',
    provenance: [
      {
        sourceId,
        authorityRef: 'test-cabinet-office-url',
        note: 'synthetic first-party revision',
        rawSha256,
      },
    ],
  })
  const jpSource = (rawSha256: string, extraDay: boolean): SourceContribution => ({
    ...truth,
    sourceId,
    lineageRef: 'Cabinet Office',
    material: { ...truth.material, rawSha256 },
    coverageIntervals: [{ start: '2026-11-23', end: '2026-11-24' }],
    days: [jpDay('2026-11-23', rawSha256), ...(extraDay ? [jpDay('2026-11-24', rawSha256)] : [])],
  })
  const build = (source: SourceContribution) => {
    const result = synthesizeCalendarCandidate({ policy: jp, contributions: [source] })
    if (result.kind !== 'success') throw new Error(JSON.stringify(result))
    return result.candidate
  }
  const previous = build(jpSource('a'.repeat(64), true))
  const next = build(jpSource('b'.repeat(64), false))
  const jpOracle: SourceContribution = {
    ...jpSource('c'.repeat(64), false),
    sourceId: 'vacanza-holidays-library',
    role: 'oracle',
    lineageRef: 'synthetic independent oracle for branch verification',
  }
  const report = validateCalendarCandidate({
    policy: jp,
    candidate: next,
    current: previous,
    oracles: [jpOracle],
    independenceRegistry: [
      {
        truthSourceId: sourceId,
        oracleSourceId: jpOracle.sourceId,
        independent: true,
        evidenceRef: 'test registration',
      },
    ],
  })
  expect(report.kind).toBe('success')
  expect(report.overlapChanges[0]?.date).toBe('2026-11-24')
})
