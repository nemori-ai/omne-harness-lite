import { Temporal } from '@js-temporal/polyfill'
import {
  ScheduleCivilSchema,
  ScheduleInstantSchema,
  ScheduleTimezoneSchema,
} from '@omne-harness/schedule-contract'
import type { ScheduleCivil } from '@omne-harness/schedule-contract'
import type {
  ScheduleMaterializationResult,
  ScheduleTimezone,
  ScheduleRecurrenceInvalid,
} from './types.ts'

export const invalid = (field: string, message: string): ScheduleRecurrenceInvalid => ({
  kind: 'invalid',
  issues: [{ field, message }],
})
export const civilFromDate = (date: Date): ScheduleCivil =>
  ScheduleCivilSchema.parse(date.toISOString().slice(0, 19))
export const civilFromPlain = (date: Temporal.PlainDateTime): ScheduleCivil =>
  ScheduleCivilSchema.parse(date.toString({ smallestUnit: 'second' }))
export const fakeUtc = (civil: string): Date => new Date(`${civil}Z`)

export function materializeScheduleCivil(input: {
  civil: ScheduleCivil
  timezone: ScheduleTimezone
}): ScheduleMaterializationResult {
  const civil = ScheduleCivilSchema.safeParse(input.civil)
  if (!civil.success) return invalid('civil', 'Expected a valid second-precision civil time')
  const timezone = ScheduleTimezoneSchema.safeParse(input.timezone)
  if (!timezone.success) return invalid('timezone', 'Expected an IANA timezone')
  const plain = Temporal.PlainDateTime.from(civil.data)
  const earlier = plain.toZonedDateTime(timezone.data, { disambiguation: 'earlier' })
  const later = plain.toZonedDateTime(timezone.data, { disambiguation: 'later' })
  if (!earlier.toPlainDateTime().equals(plain) && !later.toPlainDateTime().equals(plain))
    return { kind: 'gap', civil: civil.data }
  const chosen = earlier.toPlainDateTime().equals(plain) ? earlier : later
  const instant = ScheduleInstantSchema.safeParse(
    chosen.toInstant().toString({ smallestUnit: 'millisecond' }),
  )
  if (!instant.success)
    return invalid('civil', 'The materialized instant exceeds the supported wire date range')
  return {
    kind: 'instant',
    instant: instant.data,
    utcOffset: chosen.offset,
    dstDisposition: earlier.epochNanoseconds === later.epochNanoseconds ? 'unique' : 'foldEarlier',
  }
}
