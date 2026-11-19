import { describe, expect, it } from 'vitest'
import { inspectCalendarRelease, shippedCalendarSupplyPolicies } from '../../src/index.ts'
import type { CalendarReleaseEntry } from '../../src/index.ts'

const [cn, jp, us] = ['cn-legal-holidays', 'jp-legal-holidays', 'us-federal-holidays'].map(id => {
  const policy = shippedCalendarSupplyPolicies.find(item => item.calendarId === id)
  if (!policy) throw new Error(`no shipped policy ${id}`)
  return policy
})

function entry(calendarId: string, coverageEnd: string, authorityCoverageEnd = coverageEnd) {
  return { calendarId, coverageStart: '2022-01-01', coverageEnd, authorityCoverageEnd }
}

const shipped: CalendarReleaseEntry[] = [
  entry('cn-legal-holidays', '2027-12-31'),
  entry('jp-legal-holidays', '2027-12-31'),
  entry('us-federal-holidays', '2030-12-25'),
]
const policies = [cn!, jp!, us!]

describe('inspectCalendarRelease', () => {
  it('passes a release whose every calendar covers the year and is above its warning floor', () => {
    const result = inspectCalendarRelease(shipped, policies, '2026-11-19')
    expect(result.verdict).toBe('pass')
    expect(result.checks.map(check => [check.calendarId, check.verdict])).toEqual([
      ['cn-legal-holidays', 'pass'],
      ['jp-legal-holidays', 'pass'],
      ['us-federal-holidays', 'pass'],
    ])
    expect(result.checks[0]).toMatchObject({ horizon: 'ok', remainingCoverageDays: 407 })
  })

  it('warns, per the policy of each calendar, when coverage reaches the warning floor', () => {
    // Japan warns at 300 days and is critical at 270 (inclusive): 2027-02-28 leaves 306, 2027-03-08 leaves 298.
    expect(inspectCalendarRelease(shipped, policies, '2027-02-28').verdict).toBe('pass')
    const warned = inspectCalendarRelease(shipped, policies, '2027-03-08')
    expect(warned.verdict).toBe('warning')
    expect(warned.checks.find(check => check.verdict !== 'pass')).toMatchObject({
      calendarId: 'jp-legal-holidays',
      verdict: 'warning',
      horizon: 'warning',
      remainingCoverageDays: 298,
    })
  })

  it('blocks a calendar at its critical floor, and the whole release with it', () => {
    // 2027-04-05 leaves Japan 270 days: critical, inclusive.
    const result = inspectCalendarRelease(shipped, policies, '2027-04-05')
    expect(result.verdict).toBe('blocked')
    expect(result.checks.find(check => check.calendarId === 'jp-legal-holidays')).toMatchObject({
      verdict: 'blocked',
      horizon: 'critical',
    })
  })

  it('blocks coverage that does not hold the release year or the known authority horizon', () => {
    const short = [entry('cn-legal-holidays', '2027-12-31', '2028-12-31')]
    expect(inspectCalendarRelease(short, [cn!], '2026-11-19').checks[0]).toMatchObject({
      verdict: 'blocked',
      reasons: [expect.stringMatching(/coverage/i)],
    })
    const late = [{ ...entry('cn-legal-holidays', '2027-12-31'), coverageStart: '2026-03-01' }]
    expect(inspectCalendarRelease(late, [cn!], '2026-11-19').verdict).toBe('blocked')
  })

  it('blocks what it cannot judge: a calendar without a policy, a policy without the calendar', () => {
    const noPolicy = inspectCalendarRelease([entry('xx-unknown', '2030-12-31')], [], '2026-11-19')
    expect(noPolicy).toMatchObject({
      verdict: 'blocked',
      checks: [{ calendarId: 'xx-unknown', verdict: 'blocked', horizon: 'unknown' }],
    })
    const missing = inspectCalendarRelease([], [cn!], '2026-11-19')
    expect(missing).toMatchObject({
      verdict: 'blocked',
      checks: [
        { calendarId: 'cn-legal-holidays', verdict: 'blocked', remainingCoverageDays: null },
      ],
    })
  })

  it('treats an inconsistent policy (critical floor above warning floor) as unknown and blocks', () => {
    const broken = { ...jp!, horizon: { ...jp!.horizon, criticalFloorDays: 400 } }
    expect(
      inspectCalendarRelease([entry('jp-legal-holidays', '2027-12-31')], [broken], '2026-11-19')
        .checks[0],
    ).toMatchObject({ verdict: 'blocked', horizon: 'unknown' })
  })
})
