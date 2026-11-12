import { expect, it } from 'vitest'
import { calendarSnapshotSchema } from '@omne-harness/calendar-contract'
import { countWorkingDays } from '@omne-harness/calendar'

it('does the same civil-day work per query after 100 and 200 calls', () => {
  const snapshot = calendarSnapshotSchema.parse({
    calendarId: 'fixed-workload',
    versionId: 'v1',
    coverageStart: '2024-01-01',
    coverageEnd: '2024-12-31',
    timezone: 'UTC',
    weeklyDefault: [
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'nonWorkingDay',
      'nonWorkingDay',
    ],
    overrides: [],
    knowledgeAsOf: '2023-12-01T00:00:00.000Z',
    synthesizedAt: '2023-12-01T00:00:00.000Z',
    contentHash: 'b'.repeat(64),
    provenanceRefs: ['test-source'],
    publicationGeneration: 1,
  })
  let civilDayReads = 0
  let indexBuilds = 0
  const observed = new Proxy(snapshot, {
    get(target, key, receiver) {
      if (key === 'weeklyDefault') civilDayReads += 1
      if (key === 'overrides') indexBuilds += 1
      return Reflect.get(target, key, receiver)
    },
  })
  const run = () => countWorkingDays({ snapshot: observed, from: '2024-01-01', to: '2024-12-31' })
  for (let call = 0; call < 100; call += 1) expect(run()).toMatchObject({ kind: 'ok', count: 262 })
  expect({ civilDayReads, indexBuilds }).toEqual({ civilDayReads: 36600, indexBuilds: 100 })
  for (let call = 100; call < 200; call += 1)
    expect(run()).toMatchObject({ kind: 'ok', count: 262 })
  expect({ civilDayReads, indexBuilds }).toEqual({ civilDayReads: 73200, indexBuilds: 200 })
})
