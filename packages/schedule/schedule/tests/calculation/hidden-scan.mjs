import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import { ScheduleCivilSchema } from '@omne-harness/schedule-contract'
const result = enumerateScheduleRecurrence({
  recurrence: {
    kind: 'rrule',
    rule: 'FREQ=SECONDLY',
    begin: ScheduleCivilSchema.parse('1900-01-01T00:00:00'),
    until: null,
  },
  after: ScheduleCivilSchema.parse('2026-01-01T00:00:00'),
  inclusive: false,
  take: 1,
  budget: { maxCandidates: 1, maxYears: 1 },
})
process.stdout.write(JSON.stringify(result))
