import { z } from 'zod'
import {
  ScheduleOperationKeySchema,
  ScheduleRevisionSchema,
  ScheduleRefSchema,
  ScheduleIdSchema,
  ScheduleLabelSchema,
  ScheduleInstructionSchema,
  ScheduleReasonSchema,
} from './values.ts'
import { ScheduleDefinitionSchema, ScheduleInitialStateSchema } from './definition.ts'
import { ScheduleReminderContentSchema } from './work.ts'
export const ScheduleCommandMetaSchema = z.strictObject({
  operationKey: ScheduleOperationKeySchema,
  expectedRevision: ScheduleRevisionSchema.nullable(),
  consentRef: ScheduleRefSchema.nullable(),
})
export type ScheduleCommandMeta = z.infer<typeof ScheduleCommandMetaSchema>
export const ScheduleCreateRequestSchema = z.strictObject({
  definition: ScheduleDefinitionSchema,
  initial: ScheduleInitialStateSchema,
  meta: ScheduleCommandMetaSchema.extend({ expectedRevision: z.null() }),
})
export type ScheduleCreateRequest = z.infer<typeof ScheduleCreateRequestSchema>
export const SchedulePatchSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('label'), label: ScheduleLabelSchema }),
  z.strictObject({
    kind: z.literal('executionText'),
    instruction: ScheduleInstructionSchema,
    label: ScheduleLabelSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('reminderContent'),
    content: ScheduleReminderContentSchema,
    label: ScheduleLabelSchema.nullable(),
  }),
])
const common = {
  scheduleId: ScheduleIdSchema,
  meta: ScheduleCommandMetaSchema.extend({ expectedRevision: ScheduleRevisionSchema }),
}
export const ScheduleCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...common, action: z.literal('update'), patch: SchedulePatchSchema }),
  z.strictObject({
    ...common,
    action: z.literal('reviseDraft'),
    definition: ScheduleDefinitionSchema,
    reason: ScheduleReasonSchema,
  }),
  z.strictObject({
    ...common,
    action: z.literal('reconfirmConsent'),
    newConsentRef: ScheduleRefSchema,
    reason: ScheduleReasonSchema,
  }),
  z.strictObject({
    ...common,
    action: z.enum(['pause', 'resume', 'stop', 'promote', 'discard']),
    reason: ScheduleReasonSchema.nullable(),
  }),
  z.strictObject({
    ...common,
    action: z.literal('replace'),
    successor: ScheduleDefinitionSchema,
    reason: ScheduleReasonSchema,
  }),
])
export type ScheduleCommand = z.infer<typeof ScheduleCommandSchema>
export type SchedulePatch = z.infer<typeof SchedulePatchSchema>
