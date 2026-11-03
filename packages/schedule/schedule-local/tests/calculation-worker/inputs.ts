import { ScheduleRecurrenceSchema } from '@omne-harness/schedule-contract'
import type { ScheduleEnumerationInput } from '@omne-harness/schedule'

export function calculationInput(
  recurrence: unknown = {
    kind: 'once',
    localAt: '2026-11-04T09:00:00',
  },
): ScheduleEnumerationInput {
  return {
    recurrence: ScheduleRecurrenceSchema.parse(recurrence),
    after: null,
    inclusive: true,
    take: 3,
    budget: { maxCandidates: 1000, maxYears: 400 },
  }
}

export function blockingInput(): ScheduleEnumerationInput {
  return calculationInput({
    kind: 'rrule',
    rule: 'FREQ=SECONDLY;INTERVAL=2;BYSECOND=1',
    begin: '2026-01-01T00:00:00',
    until: null,
  })
}
