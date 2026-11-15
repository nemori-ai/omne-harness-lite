import { expect, it } from 'vitest'
import { ScheduleCivilSchema } from '@omne-harness/schedule-contract'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'

it('enumerates a once recurrence through the public root', () => {
  const local = ScheduleCivilSchema.parse('2026-04-01T09:00:00')
  expect(
    enumerateScheduleRecurrence({
      recurrence: { kind: 'once', localAt: local },
      after: null,
      inclusive: true,
      take: 1,
      budget: { maxCandidates: 1, maxYears: 1 },
    }),
  ).toMatchObject({ kind: 'ok', candidates: [{ kind: 'civil', local }], exhausted: true })
})
