import { expect, it } from 'vitest'
import {
  calendarSnapshotSchema,
  localDateSchema,
  calculationBasisSchema,
} from '@omne-harness/calendar-contract'

const rawSnapshot = {
  calendarId: 'jp-national',
  versionId: '2024-a',
  coverageStart: '2024-01-01',
  coverageEnd: '2024-12-31',
  timezone: 'Asia/Tokyo',
  weeklyDefault: [
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'workingDay',
    'nonWorkingDay',
    'nonWorkingDay',
  ],
  overrides: [
    { date: '2024-01-01', classification: 'holiday', provenanceRefs: ['cabinet'], notes: ['元日'] },
  ],
  knowledgeAsOf: '2023-12-01T00:00:00.000Z',
  synthesizedAt: '2023-12-02T00:00:00.000Z',
  contentHash: 'a'.repeat(64),
  provenanceRefs: ['cabinet'],
  publicationGeneration: 2,
}

it('validates real four digit ISO dates including leap days without coercion', () => {
  expect(localDateSchema.parse('2024-02-29')).toBe('2024-02-29')
  for (const date of [
    '2023-02-29',
    '2024-02-30',
    '2024-2-01',
    '+010000-01-01',
    '2024-01-01T00:00:00',
  ])
    expect(localDateSchema.safeParse(date).success).toBe(false)
})
it('rejects unknown fields, incomplete weeks, duplicate overrides, invalid ranges and missing evidence', () => {
  for (const input of [
    { ...rawSnapshot, unexpected: true },
    { ...rawSnapshot, weeklyDefault: ['workingDay'] },
    { ...rawSnapshot, overrides: [...rawSnapshot.overrides, ...rawSnapshot.overrides] },
    { ...rawSnapshot, overrides: [{ ...rawSnapshot.overrides[0], unknown: true }] },
    { ...rawSnapshot, coverageEnd: '2023-01-01' },
    { ...rawSnapshot, coverageStart: '2024-02-30' },
    { ...rawSnapshot, provenanceRefs: [] },
    { ...rawSnapshot, contentHash: 'not-a-hash' },
    { ...rawSnapshot, timezone: 'Invalid/Zone' },
    { ...rawSnapshot, publicationGeneration: 1.5 },
  ])
    expect(calendarSnapshotSchema.safeParse(input).success).toBe(false)
})
it('round trips version knowledge and basis as JSON values and freezes nested collections', () => {
  const snapshot = calendarSnapshotSchema.parse(rawSnapshot)
  expect(calendarSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  const basis = calculationBasisSchema.parse({
    calendarId: snapshot.calendarId,
    versionId: snapshot.versionId,
    publicationGeneration: snapshot.publicationGeneration,
    coverage: { from: snapshot.coverageStart, to: snapshot.coverageEnd },
    inspectedRange: { from: '2024-02-01', to: '2024-02-29' },
    knowledgeAsOf: snapshot.knowledgeAsOf,
    contentHash: snapshot.contentHash,
    provenanceRefs: snapshot.provenanceRefs,
  })
  expect(calculationBasisSchema.parse(JSON.parse(JSON.stringify(basis)))).toEqual(basis)
  expect(Object.isFrozen(snapshot.overrides)).toBe(true)
  expect(Object.isFrozen(snapshot.overrides[0]?.notes)).toBe(true)
})
