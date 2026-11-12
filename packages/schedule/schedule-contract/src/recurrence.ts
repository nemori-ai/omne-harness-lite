import { z } from 'zod'
import {
  ScheduleCivilSchema,
  ScheduleLocalDateSchema,
  ScheduleTimeSchema,
  ScheduleTimezoneSchema,
  ScheduleRefSchema,
  scheduleUtf8TextSchema,
} from './values.ts'

const source = scheduleUtf8TextSchema(65_536).refine(
  value => !/[\r\n]/.test(value),
  'Rule must be a single line',
)
const bounded = { begin: ScheduleCivilSchema, until: ScheduleCivilSchema.nullable() }
const cron = source.refine(value => {
  const count = value.trim().split(/\s+/).length
  return count >= 5 && count <= 7
}, 'Expected five to seven cron fields')
const rrule = source.refine(value => {
  const parts = value.replace(/^RRULE:/i, '').split(';')
  const names = parts.map(part => part.split('=')[0]?.toUpperCase())
  return (
    parts.every(part => /^[A-Z]+=[^=;\s]+$/i.test(part)) &&
    new Set(names).size === names.length &&
    !names.some(name => name === 'DTSTART' || name === 'COUNT' || name === 'UNTIL')
  )
}, 'RRULE must have unique parameters and no DTSTART, COUNT, or UNTIL')
export const ScheduleRecurrenceSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('once'), localAt: ScheduleCivilSchema }),
    z.strictObject({ kind: z.literal('cron'), expression: cron, ...bounded }),
    z.strictObject({ kind: z.literal('rrule'), rule: rrule, ...bounded }),
    z.strictObject({
      kind: z.literal('position'),
      period: z.enum(['month', 'quarter', 'year']),
      interval: z.int().positive(),
      ...bounded,
      ordinal: z.union([z.int().positive(), z.literal('last')]),
      selector: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('weekday'), weekday: z.int().min(1).max(7) }),
        z.strictObject({ kind: z.literal('workingDay') }),
      ]),
      times: z
        .array(ScheduleTimeSchema)
        .min(1)
        .max(100)
        .refine(
          values =>
            values.every((value, index) => index === 0 || value > (values[index - 1] ?? '')),
          'Times must be distinct and ascending',
        ),
    }),
  ])
  .refine(
    value => value.kind === 'once' || value.until === null || value.until >= value.begin,
    'Until must not precede begin',
  )
export type ScheduleRecurrence = z.infer<typeof ScheduleRecurrenceSchema>
export const ScheduleRuleLimitsSchema = z.strictObject({
  eligibleLimit: z.int().positive().nullable(),
  jobLimit: z.int().positive().nullable(),
  excludeDates: z.array(ScheduleLocalDateSchema).max(366),
})
export const ScheduleCalendarSelectionSchema = z.strictObject({
  calendarId: ScheduleRefSchema,
  version: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('latest') }),
    z.strictObject({ kind: z.literal('pinned'), versionId: ScheduleRefSchema }),
  ]),
})
export const ScheduleBindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('followUserEnvironment') }),
  z.strictObject({
    kind: z.literal('explicit'),
    timezone: ScheduleTimezoneSchema,
    calendar: ScheduleCalendarSelectionSchema.nullable(),
  }),
])
export type ScheduleBinding = z.infer<typeof ScheduleBindingSchema>
export const ScheduleCalendarOverlaySchema = z
  .strictObject({
    predicate: z.enum(['workingDay', 'nonWorkingDay', 'holiday']),
    adjust: z.enum(['skip', 'previousWorkingDay', 'nextWorkingDay']),
  })
  .nullable()
export type ScheduleRuleLimits = z.infer<typeof ScheduleRuleLimitsSchema>
export type ScheduleCalendarSelection = z.infer<typeof ScheduleCalendarSelectionSchema>
