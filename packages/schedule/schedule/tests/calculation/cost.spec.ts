// @module-tag slow
// Repeated real parser enumeration and a killed child process are CPU-sensitive evidence.
import { createHash } from 'node:crypto'
import oracle from './cost-oracle.json' with { type: 'json' }
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { ScheduleCivilSchema, ScheduleRecurrenceSchema } from '@omne-harness/schedule-contract'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import type { ScheduleRecurrence } from '@omne-harness/schedule-contract'

const definitions = [
  { name: 'daily-times', rule: 'FREQ=DAILY;BYHOUR=9,17' },
  { name: 'monthly-position', rule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1;BYHOUR=9' },
  { name: 'easter-union', rule: 'FREQ=YEARLY;BYEASTER=-2,0,1;BYHOUR=9,17' },
  { name: 'cron-union', expression: '0 9 * * MON#1,FRI#3' },
]
function collect(recurrence: ScheduleRecurrence, count: number, reference: string | null) {
  let after = reference === null ? null : ScheduleCivilSchema.parse(reference)
  const locals: string[] = []
  let scannedCandidates = 0
  let scannedPeriods = 0
  while (locals.length < count) {
    const page = enumerateScheduleRecurrence({
      recurrence,
      after,
      inclusive: after === null,
      take: Math.min(1000, count - locals.length),
      budget: { maxCandidates: 100000 - scannedCandidates, maxYears: 400 },
    })
    expect(page.kind).toBe('ok')
    if (page.kind !== 'ok') throw new Error('Invalid benchmark input')
    expect(page.limitReason).toBeNull()
    expect(page.candidates.length).toBeGreaterThan(0)
    for (const candidate of page.candidates) {
      if (candidate.kind !== 'civil') throw new Error('Expected civil output')
      locals.push(candidate.local)
    }
    scannedCandidates += page.scannedCandidates
    scannedPeriods += page.scannedPeriods
    after = page.resumeAfter
  }
  expect(new Set(locals).size).toBe(count)
  expect(locals).toEqual([...locals].sort())
  return { locals, scannedCandidates, scannedPeriods }
}
function checkSequence(name: string, locals: string[]) {
  for (const [index, local] of locals.entries()) {
    const day = Temporal.PlainDateTime.from(local)
    expect([9, 17]).toContain(day.hour)
    if (name === 'daily-times' && index > 0) {
      const previous = Temporal.PlainDateTime.from(locals[index - 1] ?? '')
      expect(previous.until(day).total('hours')).toBe(previous.hour === 9 ? 8 : 16)
    }
    if (name === 'monthly-position') {
      expect(day.dayOfWeek).toBeLessThanOrEqual(5)
      expect(day.day <= 3 || day.day >= day.daysInMonth - 2).toBe(true)
    }
    if (name === 'easter-union') {
      expect([3, 4]).toContain(day.month)
      expect([5, 7, 1]).toContain(day.dayOfWeek)
    }
    if (name === 'cron-union')
      expect(
        (day.dayOfWeek === 1 && day.day <= 7) ||
          (day.dayOfWeek === 5 && day.day >= 15 && day.day <= 21),
      ).toBe(true)
  }
}

describe('pure calculation cost evidence', () => {
  it(
    'alternates 1000 and 2000 actual outputs over five rounds and 1/10-year references',
    { timeout: 120000 },
    () => {
      const rows = []
      for (const definition of definitions) {
        const recurrence = ScheduleRecurrenceSchema.parse({
          kind: 'rule' in definition ? 'rrule' : 'cron',
          ...('rule' in definition
            ? { rule: definition.rule }
            : { expression: definition.expression }),
          begin: '2026-01-01T00:00:00',
          until: null,
        })
        for (const reference of [null, '2027-01-01T00:00:00', '2036-01-01T00:00:00']) {
          let small: string[] = []
          for (let round = 0; round < 5; round++)
            for (const count of [1000, 2000]) {
              const start = performance.now()
              const result = collect(recurrence, count, reference)
              const elapsedMs = performance.now() - start
              checkSequence(definition.name, result.locals)
              const expected = oracle.rows.find(
                row =>
                  row.name === definition.name &&
                  row.reference === reference &&
                  row.count === count,
              )
              expect(createHash('sha256').update(JSON.stringify(result.locals)).digest('hex')).toBe(
                expected?.sha256,
              )
              if (count === 1000) small = result.locals
              else expect(result.locals.slice(0, 1000)).toEqual(small)
              rows.push({
                name: definition.name,
                reference,
                round,
                count,
                elapsedMs,
                scannedCandidates: result.scannedCandidates,
                scannedPeriods: result.scannedPeriods,
                calendarCalls: 0,
                errors: 0,
                timeouts: 0,
                first: result.locals[0],
                last: result.locals.at(-1),
                cold: round === 0 && reference === null && count === 1000,
              })
            }
        }
      }
      console.info(
        JSON.stringify({
          node: process.versions.node,
          icu: process.versions.icu,
          tz: process.versions.tz,
          scope:
            'Pure enumeration; finite eligibleLimit and worker end-to-end cost belong to C4/C1W',
          rows,
        }),
      )
    },
  )
  it('retains a real no-callback internal-scan counterexample for the worker owner', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./hidden-scan.mjs', import.meta.url))],
      { timeout: 400, encoding: 'utf8' },
    )
    expect(result.error).toMatchObject({ code: 'ETIMEDOUT' })
    expect(result.signal).toBe('SIGTERM')
    expect(result.stdout).toBe('')
  })
})
