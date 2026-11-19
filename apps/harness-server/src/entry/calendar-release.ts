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

function refused(lines: string[], why: string): CalendarReleaseDecision {
  return { exitCode: 2, lines: [...lines, `calendar-release: declaration file ${why}`] }
}

/** A release ships when nothing blocks and every warning is accepted by name; no one accepts a block. */
export function judgeCalendarRelease(
  release: CalendarReleaseVerdict,
  declarations: unknown,
): CalendarReleaseDecision {
  const lines = release.checks.map(
    check =>
      `calendar-release: ${check.calendarId} ${check.verdict} horizon=${check.horizon} remaining=${check.remainingCoverageDays ?? 'unknown'}${check.reasons.length ? ` (${check.reasons.join('; ')})` : ''}`,
  )
  const read = declarationsSchema.safeParse(declarations ?? { accepted: [] })
  if (!read.success) return refused(lines, 'is not { accepted: [{ calendar, reason }] }')
  const accepted = new Map<string, string>()
  for (const { calendar, reason } of read.data.accepted) {
    if (accepted.has(calendar)) return refused(lines, `names ${calendar} twice`)
    const check = release.checks.find(item => item.calendarId === calendar)
    if (!check) return refused(lines, `names ${calendar}, which the release does not carry`)
    if (check.verdict === 'blocked') return refused(lines, `accepts ${calendar}, which blocks`)
    if (check.verdict === 'pass')
      lines.push(`calendar-release: ${calendar} is declared but does not warn`)
    else lines.push(`calendar-release: ${calendar} warning accepted: ${reason}`)
    accepted.set(calendar, reason)
  }
  if (release.verdict === 'blocked')
    return { exitCode: 1, lines: [...lines, 'calendar-release: blocked'] }
  const undeclared = release.checks
    .filter(check => check.verdict === 'warning' && !accepted.has(check.calendarId))
    .map(check => check.calendarId)
  if (undeclared.length)
    return {
      exitCode: 1,
      lines: [...lines, `calendar-release: undeclared warning: ${undeclared.join(', ')}`],
    }
  return { exitCode: 0, lines }
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
