import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseLanceliaoCalendar } from '../../src/supply/index.ts'

const primary = readFileSync(
  new URL('./fixtures/holiday_api_capture_20260821.json', import.meta.url),
  'utf8',
)
const content = readFileSync(
  new URL('../../../calendar-local/data/cn-in-lieu/chinese-days-1.5.9.json', import.meta.url),
  'utf8',
)
const supplement = {
  sourceId: 'chinese-days',
  version: '1.5.9',
  coverageStart: '2004-01-01',
  coverageEnd: '2026-12-31',
  reference: 'https://registry.npmjs.org/chinese-days/1.5.9',
  sha256: createHash('sha256').update(content).digest('hex'),
  content,
}
function checks(evidence = supplement) {
  const result = parseLanceliaoCalendar({
    acquiredAt: '2026-11-03T00:00:00Z',
    knowledgeAsOf: '2026-08-21T00:00:00Z',
    reference: 'captured-primary',
    content: new TextEncoder().encode(
      JSON.stringify({ format: 'lanceliao_evidence_bundle/v1', primary, supplement: evidence }),
    ),
  })
  expect(result.kind).toBe('success')
  if (result.kind !== 'success') throw new Error(JSON.stringify(result))
  expect(result.contribution.days).toHaveLength(142)
  return result.contribution.checks
}
it('checks actual captured CN truth against pinned supplementary evidence over its complete coverage', () => {
  expect(supplement.sha256).toBe('f3fa629113ef1e3118a12f411ae1307e6dd7d7142dbf39ac6b98ad35091afc54')
  expect(checks().map(check => check.status)).toEqual(['passed', 'passed', 'passed'])
  expect(checks()[1]?.references).toContain(supplement.reference)
})
it.each([
  { ...supplement, sha256: '0'.repeat(64) },
  { ...supplement, coverageEnd: '2025-12-31' },
  { ...supplement, coverageStart: '2023-01-01' },
])('does not treat invalid or incomplete evidence as proof', evidence => {
  expect(
    checks(evidence)
      .slice(1)
      .map(check => check.status),
  ).toEqual(['unknown', 'unknown'])
})
function changed(
  change: (data: {
    holidays: Record<string, string>
    workdays: Record<string, string>
    inLieuDays: Record<string, string>
  }) => void,
) {
  const data = JSON.parse(content)
  change(data)
  const updated = JSON.stringify(data)
  return {
    ...supplement,
    content: updated,
    sha256: createHash('sha256').update(updated).digest('hex'),
  }
}
it('requires full holiday and working-day agreement before adopting supplemental classification', () => {
  const evidence = changed(data => {
    delete data.workdays['2026-02-14']
  })
  expect(
    checks(evidence)
      .slice(1)
      .map(check => check.status),
  ).toEqual(['unknown', 'unknown'])
})
it('rejects an in-lieu date that is not a primary holiday', () => {
  const evidence = changed(data => {
    data.inLieuDays['2026-02-02'] = 'fault injection'
  })
  expect(checks(evidence)[1]).toMatchObject({ status: 'failed', dates: ['2026-02-02'] })
})
it('executes the existing annual balance threshold instead of assuming it follows from set inclusion', () => {
  const evidence = changed(data => {
    for (const day of Object.keys(data.inLieuDays))
      if (day.startsWith('2026-')) delete data.inLieuDays[day]
  })
  expect(checks(evidence)[1]?.status).toBe('passed')
  expect(checks(evidence)[2]).toMatchObject({
    status: 'failed',
    dates: ['2026-01-01'],
    severity: 'warning',
  })
})
