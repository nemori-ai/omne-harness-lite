import { calculationBasisSchema } from '@omne-harness/calendar-contract'
import { z } from 'zod'
import {
  ScheduleCivilSchema,
  ScheduleInstantSchema,
  ScheduleLocalDateSchema,
  ScheduleRefSchema as ref,
  ScheduleTimezoneSchema,
} from './values.ts'

export const ScheduleAdoptedBasisSchema = z
  .strictObject({
    timezone: ScheduleTimezoneSchema,
    tzdbVersion: ref,
    calendarId: ref.nullable(),
    calendarVersionId: ref.nullable(),
    publicationGeneration: z.int().nonnegative().nullable(),
    environmentRevision: ref.nullable(),
    ruleEngineVersion: ref,
    definitionRevision: z.int().nonnegative(),
  })
  .refine(
    value =>
      value.calendarId === null
        ? value.calendarVersionId === null && value.publicationGeneration === null
        : value.calendarVersionId !== null && value.publicationGeneration !== null,
    'Calendar identity, version and generation must be present together',
  )
export type ScheduleAdoptedBasis = z.infer<typeof ScheduleAdoptedBasisSchema>
export const ScheduleDateExplanationSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('calendarCondition'),
      originalLocal: ScheduleCivilSchema,
      resultLocal: ScheduleCivilSchema.nullable(),
      predicate: z.enum(['workingDay', 'nonWorkingDay', 'holiday']),
      action: z.enum(['kept', 'skipped', 'previousWorkingDay', 'nextWorkingDay']),
      matched: z.boolean(),
      basis: calculationBasisSchema,
    })
    .refine(
      value =>
        (value.action === 'skipped') === (value.resultLocal === null) &&
        (value.action === 'kept') === value.matched,
      'Calendar condition explanation must match its disposition',
    ),
  z
    .strictObject({
      kind: z.literal('workingDayPosition'),
      periodStart: ScheduleLocalDateSchema,
      periodEnd: ScheduleLocalDateSchema,
      ordinal: z.union([z.int().positive(), z.literal('last')]),
      selectedDate: ScheduleLocalDateSchema.nullable(),
      basis: calculationBasisSchema,
    })
    .refine(value => value.periodStart <= value.periodEnd, 'Period must be ordered'),
])
export type ScheduleDateExplanation = z.infer<typeof ScheduleDateExplanationSchema>
const sources = {
  sourceKeys: z.array(ref).min(1),
  originalLocals: z.array(ScheduleCivilSchema).min(1),
}
export const ScheduleCandidateSchema = z
  .strictObject({
    ...sources,
    adjustedLocal: ScheduleCivilSchema,
    scheduledAt: ScheduleInstantSchema,
    utcOffset: z.string().regex(/^[+-](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
    dstDisposition: z.enum(['unique', 'foldEarlier']),
    dateExplanation: z.array(ScheduleDateExplanationSchema),
    basis: ScheduleAdoptedBasisSchema,
    eligibleOrdinal: z.int().positive(),
  })
  .refine(
    value =>
      value.dateExplanation.every(item =>
        item.kind === 'workingDayPosition' ? item.selectedDate !== null : item.resultLocal !== null,
      ),
    'Excluded dates cannot produce a candidate',
  )
export type ScheduleCandidate = z.infer<typeof ScheduleCandidateSchema>
export const ScheduleExcludedCandidateSchema = z.strictObject({
  ...sources,
  adjustedLocal: ScheduleCivilSchema.nullable(),
  reason: z.enum([
    'beforeBegin',
    'afterUntil',
    'beforeActivation',
    'excludedOriginalDate',
    'excludedAdjustedDate',
    'calendarPredicate',
    'dstGap',
    'positionAbsent',
    'beforeReference',
    'eligibleLimit',
    'jobLimit',
  ]),
  dateExplanation: z.array(ScheduleDateExplanationSchema),
})
export type ScheduleExcludedCandidate = z.infer<typeof ScheduleExcludedCandidateSchema>
