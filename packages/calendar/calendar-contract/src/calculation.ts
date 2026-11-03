import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    try {
      return Temporal.PlainDate.from(value, { overflow: 'reject' }).toString() === value
    } catch {
      return false
    }
  }, 'Expected a valid ISO calendar date')
  .brand<'LocalDate'>()
export type LocalDate = z.infer<typeof localDateSchema>

export const calendarIdSchema = z.string().min(1).brand<'CalendarId'>()
export type CalendarId = z.infer<typeof calendarIdSchema>
export const calendarVersionIdSchema = z.string().min(1).brand<'CalendarVersionId'>()
export type CalendarVersionId = z.infer<typeof calendarVersionIdSchema>
export const instantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => {
    try {
      return Temporal.Instant.from(value).toString({ fractionalSecondDigits: 3 }) === value
    } catch {
      return false
    }
  })
  .brand<'Instant'>()
export type Instant = z.infer<typeof instantSchema>
export const timezoneSchema = z
  .string()
  .min(1)
  .refine(value => {
    if (/^[+-]/.test(value)) return false
    try {
      Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value)
      return true
    } catch {
      return false
    }
  })
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const provenanceRefsSchema = z.array(z.string().min(1)).min(1).readonly()
export const dayClassificationSchema = z.enum(['workingDay', 'holiday', 'nonWorkingDay'])
export type DayClassification = z.infer<typeof dayClassificationSchema>
export const weeklyDefaultSchema = z
  .tuple([
    dayClassificationSchema,
    dayClassificationSchema,
    dayClassificationSchema,
    dayClassificationSchema,
    dayClassificationSchema,
    dayClassificationSchema,
    dayClassificationSchema,
  ])
  .readonly()
export const calendarOverrideSchema = z
  .strictObject({
    date: localDateSchema,
    classification: dayClassificationSchema,
    provenanceRefs: provenanceRefsSchema,
    notes: z.array(z.string()).readonly(),
  })
  .readonly()
export type CalendarOverride = z.infer<typeof calendarOverrideSchema>
export const dateRangeSchema = z
  .strictObject({ from: localDateSchema, to: localDateSchema })
  .refine(value => value.from <= value.to, 'Range endpoints must be ordered')
  .readonly()
export type DateRange = z.infer<typeof dateRangeSchema>
export const calendarSnapshotSchema = z
  .strictObject({
    calendarId: calendarIdSchema,
    versionId: calendarVersionIdSchema,
    coverageStart: localDateSchema,
    coverageEnd: localDateSchema,
    timezone: timezoneSchema,
    weeklyDefault: weeklyDefaultSchema,
    overrides: z.array(calendarOverrideSchema).readonly(),
    knowledgeAsOf: instantSchema,
    synthesizedAt: instantSchema,
    contentHash: contentHashSchema,
    provenanceRefs: provenanceRefsSchema,
    publicationGeneration: z.int().nonnegative(),
  })
  .superRefine((value, context) => {
    if (value.coverageStart > value.coverageEnd)
      context.addIssue({ code: 'custom', message: 'Coverage endpoints must be ordered' })
    const dates = new Set<string>()
    for (const override of value.overrides) {
      if (dates.has(override.date))
        context.addIssue({ code: 'custom', message: 'Override dates must be unique' })
      if (override.date < value.coverageStart || override.date > value.coverageEnd)
        context.addIssue({ code: 'custom', message: 'Override must be inside coverage' })
      dates.add(override.date)
    }
  })
  .readonly()
export type CalendarSnapshot = z.infer<typeof calendarSnapshotSchema>

export const calculationBasisSchema = z
  .strictObject({
    calendarId: calendarIdSchema,
    versionId: calendarVersionIdSchema,
    publicationGeneration: z.int().nonnegative(),
    coverage: dateRangeSchema,
    inspectedRange: dateRangeSchema,
    knowledgeAsOf: instantSchema,
    contentHash: contentHashSchema,
    provenanceRefs: provenanceRefsSchema,
  })
  .refine(
    value =>
      value.inspectedRange.from >= value.coverage.from &&
      value.inspectedRange.to <= value.coverage.to,
    'Inspected range must be inside coverage',
  )
  .readonly()
export type CalculationBasis = z.infer<typeof calculationBasisSchema>

export const calculationFailureSchema = z.union([
  z.strictObject({ kind: z.literal('invalid'), message: z.string() }),
  z.strictObject({
    kind: z.literal('coverageInsufficient'),
    date: localDateSchema,
    coverage: dateRangeSchema,
  }),
  z.strictObject({
    kind: z.literal('coverageInsufficient'),
    date: z.null(),
    boundary: z.enum(['beforeMinimum', 'afterMaximum']),
    coverage: dateRangeSchema,
  }),
  z.strictObject({
    kind: z.literal('searchLimit'),
    scanBudget: z.int().positive(),
    inspectedDays: z.int().nonnegative(),
  }),
])
export type CalculationFailure = z.infer<typeof calculationFailureSchema>

export const classifyDayInputSchema = z.strictObject({
  snapshot: calendarSnapshotSchema,
  date: localDateSchema,
})
export const countWorkingDaysInputSchema = z
  .strictObject({ snapshot: calendarSnapshotSchema, from: localDateSchema, to: localDateSchema })
  .refine(value => value.from <= value.to, 'Range endpoints must be ordered')
export const shiftWorkingDaysInputSchema = z.strictObject({
  snapshot: calendarSnapshotSchema,
  date: localDateSchema,
  offset: z.int(),
})
export const listWorkingDaysInputSchema = z.strictObject({
  snapshot: calendarSnapshotSchema,
  after: localDateSchema,
  count: z.int().min(1).max(366),
})
export const selectNthWorkingDayInputSchema = z
  .strictObject({
    snapshot: calendarSnapshotSchema,
    periodStart: localDateSchema,
    periodEnd: localDateSchema,
    ordinal: z.union([z.int().positive(), z.literal('last')]),
  })
  .refine(value => value.periodStart <= value.periodEnd, 'Period endpoints must be ordered')

export const classifyDayResultSchema = z.union([
  calculationFailureSchema,
  z.strictObject({
    kind: z.literal('ok'),
    date: localDateSchema,
    classification: dayClassificationSchema,
    working: z.boolean(),
    holiday: z.boolean(),
    override: z.boolean(),
    provenanceRefs: provenanceRefsSchema,
    basis: calculationBasisSchema,
  }),
])
export type ClassifyDayResult = z.infer<typeof classifyDayResultSchema>
export const countWorkingDaysResultSchema = z.union([
  calculationFailureSchema,
  z.strictObject({
    kind: z.literal('ok'),
    from: localDateSchema,
    to: localDateSchema,
    count: z.int().nonnegative(),
    basis: calculationBasisSchema,
  }),
])
export type CountWorkingDaysResult = z.infer<typeof countWorkingDaysResultSchema>
export const shiftWorkingDaysResultSchema = z.union([
  calculationFailureSchema,
  z.strictObject({
    kind: z.literal('ok'),
    date: localDateSchema,
    basis: calculationBasisSchema,
  }),
])
export type ShiftWorkingDaysResult = z.infer<typeof shiftWorkingDaysResultSchema>
export const listWorkingDaysResultSchema = z.union([
  calculationFailureSchema,
  z.strictObject({
    kind: z.literal('ok'),
    after: localDateSchema,
    dates: z.array(localDateSchema).readonly(),
    basis: calculationBasisSchema,
  }),
])
export type ListWorkingDaysResult = z.infer<typeof listWorkingDaysResultSchema>
export const selectNthWorkingDayResultSchema = z.union([
  calculationFailureSchema,
  z.strictObject({
    kind: z.literal('ok'),
    date: localDateSchema.nullable(),
    basis: calculationBasisSchema,
  }),
])
export type SelectNthWorkingDayResult = z.infer<typeof selectNthWorkingDayResultSchema>

export type CalculationOptions = { readonly scanBudget?: number }
type CalculationInput<Schema extends z.ZodType> = Readonly<Omit<z.input<Schema>, 'snapshot'>> & {
  readonly snapshot: CalendarSnapshot
} & CalculationOptions
export type ClassifyDayInput = CalculationInput<typeof classifyDayInputSchema>
export type CountWorkingDaysInput = CalculationInput<typeof countWorkingDaysInputSchema>
export type ShiftWorkingDaysInput = CalculationInput<typeof shiftWorkingDaysInputSchema>
export type ListWorkingDaysInput = CalculationInput<typeof listWorkingDaysInputSchema>
export type SelectNthWorkingDayInput = CalculationInput<typeof selectNthWorkingDayInputSchema>
