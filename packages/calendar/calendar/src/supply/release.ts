import { Temporal } from '@js-temporal/polyfill'
import { classifyCalendarSupplyHorizon } from './us-rules.ts'
import type { CalendarSupplyPolicy } from './types.ts'

/** What a release carries for one calendar: the span of its seed and the furthest span its authority has published. */
export type CalendarReleaseEntry = Readonly<{
  calendarId: string
  coverageStart: string
  coverageEnd: string
  authorityCoverageEnd: string
}>
export type CalendarReleaseStanding = 'pass' | 'warning' | 'blocked'
export type CalendarReleaseCheck = Readonly<{
  calendarId: string
  verdict: CalendarReleaseStanding
  horizon: 'ok' | 'warning' | 'critical' | 'unknown'
  remainingCoverageDays: number | null
  reasons: readonly string[]
}>
export type CalendarReleaseVerdict = Readonly<{
  verdict: CalendarReleaseStanding
  checks: readonly CalendarReleaseCheck[]
}>

const RANK: Record<CalendarReleaseStanding, number> = { pass: 0, warning: 1, blocked: 2 }

function check(entry: CalendarReleaseEntry, policy: CalendarSupplyPolicy, at: string) {
  const year = at.slice(0, 4)
  const reasons: string[] = []
  if (
    entry.coverageStart > `${year}-01-01` ||
    entry.coverageEnd < `${year}-12-31` ||
    entry.coverageEnd < entry.authorityCoverageEnd
  )
    reasons.push('Coverage must hold the whole release year and the known authority horizon')
  const remainingCoverageDays = Temporal.PlainDate.from(entry.coverageEnd).since(
    Temporal.PlainDate.from(at),
  ).days
  const horizon = classifyCalendarSupplyHorizon({ policy, remainingCoverageDays })
  if (horizon === 'critical' || horizon === 'unknown')
    reasons.push(`Coverage horizon is ${horizon}`)
  const verdict: CalendarReleaseStanding = reasons.length
    ? 'blocked'
    : horizon === 'warning'
      ? 'warning'
      : 'pass'
  return { calendarId: entry.calendarId, verdict, horizon, remainingCoverageDays, reasons }
}

// Whether a release may ship on a date: one check per calendar carried or declared; what cannot
// be judged blocks; the release takes the worst check.
export function inspectCalendarRelease(
  entries: readonly CalendarReleaseEntry[],
  policies: readonly CalendarSupplyPolicy[],
  at: string,
): CalendarReleaseVerdict {
  const checks: CalendarReleaseCheck[] = entries.map(entry => {
    const policy = policies.find(item => item.calendarId === entry.calendarId)
    return policy
      ? check(entry, policy, at)
      : {
          calendarId: entry.calendarId,
          verdict: 'blocked',
          horizon: 'unknown',
          remainingCoverageDays: null,
          reasons: ['No supply policy declares this calendar'],
        }
  })
  for (const policy of policies)
    if (!entries.some(entry => entry.calendarId === policy.calendarId))
      checks.push({
        calendarId: policy.calendarId,
        verdict: 'blocked',
        horizon: 'unknown',
        remainingCoverageDays: null,
        reasons: ['The release does not carry this calendar'],
      })
  const verdict = checks.reduce<CalendarReleaseStanding>(
    (worst, item) => (RANK[item.verdict] > RANK[worst] ? item.verdict : worst),
    'pass',
  )
  return { verdict, checks }
}
