import type {
  ScheduleCivil,
  ScheduleInstant,
  ScheduleRecurrence,
  ScheduleLocalDateSchema,
  ScheduleTimezoneSchema,
} from '@omne-harness/schedule-contract'

export type ScheduleLocalDate = ReturnType<typeof ScheduleLocalDateSchema.parse>
export type ScheduleTimezone = ReturnType<typeof ScheduleTimezoneSchema.parse>
export type ScheduleRecurrenceInvalid = {
  kind: 'invalid'
  issues: { field: string; message: string }[]
}
export type ScheduleRawCandidate =
  | { kind: 'civil'; local: ScheduleCivil }
  | {
      kind: 'workingDayPosition'
      periodStart: ScheduleLocalDate
      periodEnd: ScheduleLocalDate
      ordinal: number | 'last'
      times: readonly string[]
    }
export type ScheduleEnumerationInput = {
  recurrence: ScheduleRecurrence
  after: ScheduleCivil | null
  inclusive: boolean
  take: number
  budget: { maxCandidates: number; maxYears: number }
}
export type ScheduleEnumerationPage = {
  kind: 'ok'
  candidates: ScheduleRawCandidate[]
  exhausted: boolean
  observedThrough: ScheduleCivil | null
  resumeAfter: ScheduleCivil | null
  scannedCandidates: number
  scannedPeriods: number
  limitReason: 'candidateBudget' | 'yearBudget' | null
}
export type ScheduleEnumerationResult = ScheduleEnumerationPage | ScheduleRecurrenceInvalid
export type ScheduleMaterializationResult =
  | {
      kind: 'instant'
      instant: ScheduleInstant
      utcOffset: string
      dstDisposition: 'unique' | 'foldEarlier'
    }
  | { kind: 'gap'; civil: ScheduleCivil }
  | ScheduleRecurrenceInvalid
