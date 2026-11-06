import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseGovCnCalendar } from '@omne-harness/calendar'
import { instantSchema } from '@omne-harness/calendar-contract'
import { source } from './fixtures.ts'

const content = readFileSync(
  new URL('../../data/seeds/raw/gov-cn-2027-bundle.json', import.meta.url),
)
const acquiredAt = instantSchema.parse('2026-11-06T12:00:00.000Z')
const artifact = {
  read: async () => content,
  sha256: createHash('sha256').update(content).digest('hex'),
  knowledgeAsOf: instantSchema.parse('2026-11-05T09:00:00.000Z'),
  reference: 'https://www.gov.cn/zhengce/content/202611/content_7085101.htm',
}
it('acquires and probes the adopted official notice with independent identity and evidence', async () => {
  const adapter = source('gov-cn-annual-notice', { cnOfficialNoticeArtifact: artifact })
  const result = await adapter.acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') throw new Error(JSON.stringify(result))
  const parsed = parseGovCnCalendar({ ...result.material, reference: artifact.reference })
  expect(parsed.kind).toBe('success')
  if (parsed.kind !== 'success') throw new Error(JSON.stringify(parsed))
  expect(parsed.contribution.sourceId).toBe('gov-cn-annual-notice')
  expect(parsed.contribution.days.filter(day => day.category === 'holiday')).toHaveLength(29)
  expect(parsed.contribution.days.filter(day => day.category === 'workingDay')).toHaveLength(5)
  expect(parsed.contribution.checks.map(check => check.status)).toEqual([
    'passed',
    'passed',
    'passed',
  ])
  expect(parsed.contribution.coverageIntervals).toEqual([
    { start: '2027-01-01', end: '2027-12-31' },
  ])
  expect(
    parsed.contribution.days.every(day =>
      day.provenance.every(
        ref => ref.sourceId === 'gov-cn-annual-notice' && ref.authorityRef === artifact.reference,
      ),
    ),
  ).toBe(true)
  const first = await adapter.probe({ previous: null, observedAt: acquiredAt })
  expect(first.kind).toBe('changed')
  expect((await adapter.probe({ previous: first, observedAt: acquiredAt })).kind).toBe('unchanged')
})
it('refuses missing or altered adopted bytes and future knowledge', async () => {
  expect((await source('gov-cn-annual-notice').acquire({ acquiredAt })).kind).toBe('unavailable')
  for (const bad of [
    { ...artifact, sha256: '0'.repeat(64) },
    { ...artifact, knowledgeAsOf: instantSchema.parse('2027-01-01T00:00:00.000Z') },
  ]) {
    expect(
      (
        await source('gov-cn-annual-notice', { cnOfficialNoticeArtifact: bad }).acquire({
          acquiredAt,
        })
      ).kind,
    ).toBe('unavailable')
  }
})
it('does not treat a bare upstream document or 2026 supplement as complete official 2027 evidence', () => {
  const document = JSON.parse(content.toString())
  const parse = (value: unknown) =>
    parseGovCnCalendar({
      content: Buffer.from(JSON.stringify(value)),
      acquiredAt,
      knowledgeAsOf: artifact.knowledgeAsOf,
      reference: artifact.reference,
    })
  expect(parse(JSON.parse(document.primary)).kind).toBe('rejected')
  document.supplement.coverageEnd = '2026-12-31'
  const parsed = parse(document)
  expect(parsed.kind).toBe('success')
  if (parsed.kind !== 'success') throw new Error(JSON.stringify(parsed))
  expect(parsed.contribution.checks.slice(1).map(check => check.status)).toEqual([
    'unknown',
    'unknown',
  ])
})
