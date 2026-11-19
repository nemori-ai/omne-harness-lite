import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CalendarReleaseCheck, CalendarReleaseVerdict } from '@omne-harness/calendar'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { judgeCalendarRelease } from '../../src/entry/calendar-release.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/calendar-release.mjs', import.meta.url))

const checkOf = (
  calendarId: string,
  verdict: CalendarReleaseCheck['verdict'],
): CalendarReleaseCheck => ({
  calendarId,
  verdict,
  horizon: verdict === 'pass' ? 'ok' : verdict === 'warning' ? 'warning' : 'critical',
  remainingCoverageDays: 100,
  reasons: verdict === 'blocked' ? ['Coverage horizon is critical'] : [],
})
const releaseOf = (...checks: CalendarReleaseCheck[]): CalendarReleaseVerdict => ({
  verdict: checks.some(check => check.verdict === 'blocked')
    ? 'blocked'
    : checks.some(check => check.verdict === 'warning')
      ? 'warning'
      : 'pass',
  checks,
})
const accepted = (...calendars: string[]) => ({
  accepted: calendars.map(calendar => ({ calendar, reason: 'supplier publishes in December' })),
})

describe('judgeCalendarRelease', () => {
  it('passes a release whose calendars all pass, with or without declarations', () => {
    const release = releaseOf(checkOf('cn', 'pass'), checkOf('jp', 'pass'))
    expect(judgeCalendarRelease(release, undefined).exitCode).toBe(0)
    const declared = judgeCalendarRelease(release, accepted('jp'))
    expect(declared.exitCode).toBe(0)
    expect(declared.lines.join('\n')).toContain('jp is declared but does not warn')
  })

  it('refuses a blocked release, declared or not', () => {
    const release = releaseOf(checkOf('cn', 'pass'), checkOf('jp', 'blocked'))
    const decision = judgeCalendarRelease(release, undefined)
    expect(decision.exitCode).toBe(1)
    expect(decision.lines.join('\n')).toContain('jp blocked')
    expect(decision.lines.at(-1)).toContain('blocked')
  })

  it('refuses a warning nobody declared, and passes it once declared with a reason', () => {
    const release = releaseOf(checkOf('cn', 'pass'), checkOf('jp', 'warning'))
    const undeclared = judgeCalendarRelease(release, undefined)
    expect(undeclared.exitCode).toBe(1)
    expect(undeclared.lines.at(-1)).toContain('undeclared warning: jp')
    const declared = judgeCalendarRelease(release, accepted('jp'))
    expect(declared.exitCode).toBe(0)
    expect(declared.lines.join('\n')).toContain(
      'jp warning accepted: supplier publishes in December',
    )
  })

  it('rejects a declaration file that accepts a blocked calendar, one the release lacks, a duplicate, or a bad shape', () => {
    const release = releaseOf(checkOf('cn', 'warning'), checkOf('jp', 'blocked'))
    for (const declarations of [
      accepted('jp'),
      accepted('cn', 'us'),
      accepted('cn', 'cn'),
      { accepted: [{ calendar: 'cn', reason: ' ' }] },
      { accepted: [{ calendar: 'cn' }] },
      { accepted: [], extra: true },
      [],
    ]) {
      const decision = judgeCalendarRelease(release, declarations)
      expect(decision.exitCode, JSON.stringify(declarations)).toBe(2)
      expect(decision.lines.at(-1)).toMatch(/^calendar-release: declaration file/)
    }
  })
})

describe('calendar-release.mjs check on the shipped seeds', () => {
  let scratch: string
  beforeAll(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-release-script-')))
  })
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [SCRIPT, 'check', ...args], { encoding: 'utf8' })
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
  }
  const file = (name: string, value: unknown) => {
    const path = join(scratch, name)
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }

  it('passes on a day every calendar has room, also behind the -- of a package script', () => {
    const passed = run('--', '--at', '2026-11-19')
    expect(passed.out).toContain('calendar-release: ok at=2026-11-19 release=calendar-2026-11-06')
    expect(passed.status).toBe(0)
  })

  it('exits 1 on a warning nobody declared and 0 once it is declared', () => {
    // Japan warns from 300 days before the end of its coverage, 2027-12-31.
    expect(run('--at', '2027-03-10')).toMatchObject({ status: 1 })
    const declared = run(
      '--at',
      '2027-03-10',
      '--accept-warnings',
      file('jp.json', accepted('jp-legal-holidays')),
    )
    expect(declared.out).toContain('jp-legal-holidays warning accepted')
    expect(declared.status).toBe(0)
  })

  it('exits 1 when a calendar blocks, and 2 when the declaration accepts the blocked one', () => {
    const blocked = run('--at', '2027-04-15')
    expect(blocked.out).toContain('jp-legal-holidays blocked')
    expect(blocked.status).toBe(1)
    const declared = run(
      '--at',
      '2027-04-15',
      '--accept-warnings',
      file('blocked.json', accepted('jp-legal-holidays')),
    )
    expect(declared.status).toBe(2)
  })

  it('exits 2 on a bad date, an unknown option, an unreadable or non-JSON declaration file', () => {
    expect(run('--at', '2027-02-30').status).toBe(2)
    expect(run('--at').status).toBe(2)
    expect(run('--soon', 'x').status).toBe(2)
    expect(run('--accept-warnings', join(scratch, 'missing.json')).status).toBe(2)
    expect(run('--accept-warnings', file('text.json', 'not json')).status).toBe(2)
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2)
  })
})
