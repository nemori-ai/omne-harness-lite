import {
  inspectCalendarRelease,
  shippedCalendarSupplyPolicies,
  type CalendarReleaseVerdict,
} from '@omne-harness/calendar'
import { calendarSeedPackSchema } from '@omne-harness/calendar-contract'
import {
  createShippedCalendarSeedRegistry,
  shippedCalendarSeedRelease,
} from '@omne-harness/calendar-local'
import { z } from 'zod'

export type CalendarReleaseDecision = Readonly<{ exitCode: 0 | 1 | 2; lines: readonly string[] }>

const declarationsSchema = z.strictObject({
  accepted: z.array(
    z.strictObject({ calendar: z.string().min(1), reason: z.string().trim().min(1) }),
  ),
})

/** The shipped seed pack, read through the digest its registry checks, judged on a day. */
async function inspectShippedCalendarRelease(at: string): Promise<CalendarReleaseVerdict> {
  const source = createShippedCalendarSeedRegistry().get(shippedCalendarSeedRelease.packRef)
  if (source?.kind !== 'bytes') throw new Error('The shipped seed pack is not registered')
  const pack = calendarSeedPackSchema.parse(
    JSON.parse(new TextDecoder().decode(await source.read())),
  )
  const entries = pack.calendars.map(entry => ({
    calendarId: entry.snapshot.calendarId,
    coverageStart: entry.snapshot.coverageStart,
    coverageEnd: entry.snapshot.coverageEnd,
    authorityCoverageEnd: entry.authorityCoverageEnd,
  }))
  return inspectCalendarRelease(entries, shippedCalendarSupplyPolicies, at)
}

type Accepted = Readonly<{ calendars: ReadonlySet<string>; lines: readonly string[] }>

const lineOf = (check: CalendarReleaseVerdict['checks'][number]) =>
  `calendar-release: ${check.calendarId} ${check.verdict} horizon=${check.horizon} remaining=${check.remainingCoverageDays ?? 'unknown'}${check.reasons.length ? ` (${check.reasons.join('; ')})` : ''}`

/** The calendars a declaration file accepts, or why the file is not lawful. */
function acceptedOf(release: CalendarReleaseVerdict, declarations: unknown): Accepted | string {
  const read = declarationsSchema.safeParse(declarations ?? { accepted: [] })
  if (!read.success) return 'is not { accepted: [{ calendar, reason }] }'
  const calendars = new Set<string>()
  const lines: string[] = []
  for (const { calendar, reason } of read.data.accepted) {
    const check = release.checks.find(item => item.calendarId === calendar)
    if (calendars.has(calendar)) return `names ${calendar} twice`
    if (!check) return `names ${calendar}, which the release does not carry`
    if (check.verdict === 'blocked') return `accepts ${calendar}, which blocks`
    lines.push(
      check.verdict === 'pass'
        ? `calendar-release: ${calendar} is declared but does not warn`
        : `calendar-release: ${calendar} warning accepted: ${reason}`,
    )
    calendars.add(calendar)
  }
  return { calendars, lines }
}

/** A release ships when nothing blocks and every warning is accepted by name; no one accepts a block. */
export function judgeCalendarRelease(
  release: CalendarReleaseVerdict,
  declarations: unknown,
): CalendarReleaseDecision {
  const lines = release.checks.map(lineOf)
  const accepted = acceptedOf(release, declarations)
  if (typeof accepted === 'string')
    return { exitCode: 2, lines: [...lines, `calendar-release: declaration file ${accepted}`] }
  const told = [...lines, ...accepted.lines]
  if (release.verdict === 'blocked')
    return { exitCode: 1, lines: [...told, 'calendar-release: blocked'] }
  const undeclared = release.checks
    .filter(check => check.verdict === 'warning' && !accepted.calendars.has(check.calendarId))
    .map(check => check.calendarId)
  return undeclared.length
    ? {
        exitCode: 1,
        lines: [...told, `calendar-release: undeclared warning: ${undeclared.join(', ')}`],
      }
    : { exitCode: 0, lines: told }
}

/** What `check:calendar-release` prints and exits with for the release this build ships. */
export async function checkShippedCalendarRelease(
  at: string,
  declarations: unknown,
): Promise<CalendarReleaseDecision> {
  const decision = judgeCalendarRelease(await inspectShippedCalendarRelease(at), declarations)
  if (decision.exitCode !== 0) return decision
  const ok = `calendar-release: ok at=${at} release=${shippedCalendarSeedRelease.releaseRef}`
  return { exitCode: 0, lines: [...decision.lines, ok] }
}
