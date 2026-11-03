import { z } from 'zod'
import { ScheduleLabelSchema, ScheduleReasonSchema } from './values.ts'
import {
  ScheduleRecurrenceSchema,
  ScheduleRuleLimitsSchema,
  ScheduleBindingSchema,
  ScheduleCalendarOverlaySchema,
} from './recurrence.ts'
import { SchedulePurposeSchema } from './work.ts'
export const ScheduleDefinitionSchema = z
  .strictObject({
    label: ScheduleLabelSchema,
    recurrence: ScheduleRecurrenceSchema,
    limits: ScheduleRuleLimitsSchema,
    binding: ScheduleBindingSchema,
    calendarOverlay: ScheduleCalendarOverlaySchema,
    purpose: SchedulePurposeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.recurrence.kind === 'once') {
      if (value.calendarOverlay !== null)
        ctx.addIssue({
          code: 'custom',
          message: 'Once rules do not allow an overlay',
          path: ['calendarOverlay'],
        })
      if (value.limits.eligibleLimit !== null && value.limits.eligibleLimit !== 1)
        ctx.addIssue({
          code: 'custom',
          message: 'Once eligibleLimit must be null or one',
          path: ['limits', 'eligibleLimit'],
        })
    }
    if (
      value.purpose.kind === 'execution' &&
      (value.recurrence.kind === 'once') !== (value.purpose.misfire !== null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Only once execution requires a misfire policy',
        path: ['purpose', 'misfire'],
      })
    const needsCalendar =
      value.calendarOverlay !== null ||
      (value.recurrence.kind === 'position' && value.recurrence.selector.kind === 'workingDay')
    if (needsCalendar && value.binding.kind === 'explicit' && value.binding.calendar === null)
      ctx.addIssue({
        code: 'custom',
        message: 'Calendar-dependent rules require a calendar',
        path: ['binding', 'calendar'],
      })
  })
export type ScheduleDefinition = z.infer<typeof ScheduleDefinitionSchema>
export const ScheduleInitialStateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('active') }),
  z.strictObject({ kind: z.literal('draft'), reason: ScheduleReasonSchema }),
])
export type ScheduleInitialState = z.infer<typeof ScheduleInitialStateSchema>
