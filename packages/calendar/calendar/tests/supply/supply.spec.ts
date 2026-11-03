import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseLanceliaoCalendar,
  computeUsFederalCalendar,
  synthesizeCalendarCandidate,
  validateCalendarCandidate,
  shippedCalendarSupplyPolicies,
} from '../../src/supply/index.ts'

const material = {
  acquiredAt: '2026-08-21T00:00:00Z',
  knowledgeAsOf: '2026-08-20T00:00:00Z',
  reference: 'fixture from fixed source a7dbd98f',
}
const bytes = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))

describe('source facts are carried rather than inferred', () => {
  it('retains Saturday CompDays from the lanceliao source sample', () => {
    const parsed = parseLanceliaoCalendar({
      content: bytes('holiday_api_sample.json'),
      ...material,
    })
    expect(parsed.kind).toBe('success')
    if (parsed.kind === 'success')
      expect(parsed.contribution.days.find(day => day.date === '2026-05-09')?.category).toBe(
        'workingDay',
      )
  })
  it('carries next-year New Year observed on December 31', () => {
    const parsed = computeUsFederalCalendar({ start: '2021-01-01', end: '2021-12-31', ...material })
    expect(parsed.kind).toBe('success')
    if (parsed.kind === 'success')
      expect(parsed.contribution.days.some(day => day.date === '2021-12-31')).toBe(true)
  })
  it('ships only the three accepted calendars', () => {
    expect(shippedCalendarSupplyPolicies.map(policy => policy.calendarId)).toEqual([
      'cn-legal-holidays',
      'jp-legal-holidays',
      'us-federal-holidays',
    ])
  })
})

it('refuses to fill a gap between two truth intervals', () => {
  const parsed = computeUsFederalCalendar({ start: '2025-01-01', end: '2025-03-31', ...material })
  if (parsed.kind !== 'success') throw new Error('computed sample failed')
  const contribution = {
    ...parsed.contribution,
    days: [],
    coverageIntervals: [
      { start: '2025-01-01', end: '2025-01-31' },
      { start: '2025-03-01', end: '2025-03-31' },
    ],
  }
  const policy = shippedCalendarSupplyPolicies[2]
  if (!policy) throw new Error('missing US policy')
  expect(synthesizeCalendarCandidate({ policy, contributions: [contribution] }).kind).toBe(
    'rejected',
  )
})

it('retains an explicit unknown when independent lineage is unregistered', () => {
  const parsed = computeUsFederalCalendar({ start: '2025-01-01', end: '2025-12-31', ...material })
  const policy = shippedCalendarSupplyPolicies[2]
  if (parsed.kind !== 'success' || !policy) throw new Error('computed sample failed')
  const synthesized = synthesizeCalendarCandidate({ policy, contributions: [parsed.contribution] })
  if (synthesized.kind !== 'success') throw new Error('synthesis failed')
  const report = validateCalendarCandidate({
    policy,
    candidate: synthesized.candidate,
    oracles: [],
    independenceRegistry: [],
  })
  expect(
    report.findings.some(
      finding => finding.code === 'oracle.unavailable' && finding.status === 'unknown',
    ),
  ).toBe(true)
})
