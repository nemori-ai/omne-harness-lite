import { expect, it } from 'vitest'
import {
  ScheduleAdoptedBasisSchema,
  ScheduleCandidateSchema,
} from '@omne-harness/schedule-contract'
const basis = {
  timezone: 'Asia/Tokyo',
  tzdbVersion: '2026a',
  calendarId: null,
  calendarVersionId: null,
  publicationGeneration: null,
  environmentRevision: null,
  ruleEngineVersion: '1',
  definitionRevision: 0,
}
it('requires one complete calendar basis without conflating inline and saved revisions', () => {
  expect(ScheduleAdoptedBasisSchema.parse(basis)).toEqual(basis)
  expect(
    ScheduleAdoptedBasisSchema.safeParse({ ...basis, calendarId: 'cn-legal-holidays' }).success,
  ).toBe(false)
  expect(ScheduleAdoptedBasisSchema.safeParse({ ...basis, definitionRevision: -1 }).success).toBe(
    false,
  )
})
it('retains candidate provenance, offset and DST choice through JSON', () => {
  const candidate = {
    sourceKeys: ['source:1'],
    originalLocals: ['2026-11-04T10:00:00'],
    adjustedLocal: '2026-11-04T10:00:00',
    scheduledAt: '2026-11-04T01:00:00.000Z',
    utcOffset: '+09:00',
    dstDisposition: 'unique',
    dateExplanation: [],
    basis,
    eligibleOrdinal: 1,
  }
  expect(ScheduleCandidateSchema.parse(JSON.parse(JSON.stringify(candidate)))).toEqual(candidate)
  expect(ScheduleCandidateSchema.safeParse({ ...candidate, dstDisposition: 'gap' }).success).toBe(
    false,
  )
  expect(ScheduleCandidateSchema.safeParse({ ...candidate, utcOffset: '+99:00' }).success).toBe(
    false,
  )
  expect(ScheduleCandidateSchema.safeParse({ ...candidate, utcOffset: '+00:19:32' }).success).toBe(
    true,
  )
})
