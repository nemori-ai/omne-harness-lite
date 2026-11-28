import { z } from 'zod'
import {
  ScheduleRefSchema as ref,
  ScheduleInstructionSchema,
  ScheduleJsonValueSchema,
  ScheduleUuidSchema,
  scheduleUtf8TextSchema,
} from './values.ts'
export const ScheduleTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('owner') }),
  z.strictObject({ kind: z.literal('authorizedTarget'), targetRef: ref }),
])
export const SchedulePublicationPlanSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('master') }),
  z.strictObject({ kind: z.literal('provider'), providerRef: ref }),
])
export const ScheduleResultPolicySchema = z
  .strictObject({
    audience: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('masterInternal') }),
      z.strictObject({ kind: z.literal('userDeliverable'), target: ScheduleTargetSchema }),
    ]),
    publication: SchedulePublicationPlanSchema,
    resultSeriesId: ScheduleUuidSchema.brand<'ScheduleResultSeriesId'>().nullable(),
    attention: z.enum(['silent', 'inbox', 'notify']),
    archive: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('none') }),
      z.strictObject({ kind: z.literal('provider'), providerRef: ref, targetRef: ref }),
    ]),
  })
  .superRefine((value, ctx) => {
    if (
      value.audience.kind === 'masterInternal' &&
      (value.publication.kind !== 'none' || value.attention !== 'silent')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Internal results require no publication and silent attention',
      })
    if (value.audience.kind === 'userDeliverable' && value.publication.kind === 'none')
      ctx.addIssue({
        code: 'custom',
        message: 'Deliverable results require a publication provider',
      })
  })
export const ScheduleAgentModesSchema = z.strictObject({
  permission: z.enum(['never', 'auto_permission', 'bypass-permissions']),
  environmentAdoptionRef: ref,
  collaboration: z.enum(['co-work', 'auto-drive']),
})
export const ScheduleWorkspaceInputSchema = z.strictObject({
  workspaceRef: ref,
  instanceRef: ref,
  basisRef: ref,
})
export const ScheduleMaterialInputSchema = z.strictObject({ resourceRef: ref, versionRef: ref })
export const ScheduleAgentSessionPlanSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('new'),
    agentDefinitionRef: ref,
    modes: ScheduleAgentModesSchema,
    workspace: ScheduleWorkspaceInputSchema.nullable(),
  }),
  z.strictObject({ mode: z.literal('existing'), sessionRef: ref }),
])
export const ScheduleWorkSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('program'), programRef: ref, input: ScheduleJsonValueSchema }),
  z
    .strictObject({
      kind: z.literal('agent'),
      instruction: ScheduleInstructionSchema,
      session: ScheduleAgentSessionPlanSchema,
      materials: z.array(ScheduleMaterialInputSchema),
      returnTo: z.strictObject({ kind: z.literal('external'), targetRef: ref }).nullable(),
      resultPolicy: ScheduleResultPolicySchema,
    })
    .refine(
      value =>
        value.returnTo !== null ||
        (value.resultPolicy.audience.kind !== 'masterInternal' &&
          value.resultPolicy.publication.kind !== 'master'),
      'Master results require an explicit return target',
    ),
])
export const ScheduleReminderContentSchema = z.strictObject({
  title: z
    .string()
    .refine(value => Array.from(value).length <= 200, 'Code point limit exceeded')
    .nullable(),
  body: scheduleUtf8TextSchema(16_384),
})
export const ScheduleExecutionNotificationSchema = z.strictObject({
  event: z.enum(['started', 'succeeded', 'failed', 'cancelled']),
  content: ScheduleReminderContentSchema,
  target: ScheduleTargetSchema,
})
export const ScheduleScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fleet') }),
  z.strictObject({ kind: z.literal('device'), deviceRef: ref }),
])
export const ScheduleCatchUpSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('latest'), maximum: z.int().positive() }),
])
export const ScheduleOverlapSchema = z.enum(['skip', 'wait', 'replace', 'parallel'])
export const ScheduleMisfireSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lapse') }),
  z.strictObject({ kind: z.literal('awaitRecovery') }),
])
const execution = {
  kind: z.literal('execution'),
  scope: ScheduleScopeSchema,
  catchUp: ScheduleCatchUpSchema,
  overlap: ScheduleOverlapSchema,
  misfire: ScheduleMisfireSchema.nullable(),
  notifications: z
    .array(ScheduleExecutionNotificationSchema)
    .max(4)
    .refine(
      items => new Set(items.map(item => item.event)).size === items.length,
      'Each notification event occurs at most once',
    ),
}
const reminder = z.strictObject({
  kind: z.literal('reminder'),
  content: ScheduleReminderContentSchema,
  admissionPolicy: z.literal('reminder-window-v1'),
  overlap: ScheduleOverlapSchema,
})
export const SchedulePurposeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...execution, work: ScheduleWorkSchema }),
  reminder,
])

const program = z.strictObject({
  kind: z.literal('program'),
  programRef: ref,
  input: ScheduleJsonValueSchema,
})
/** Work as its caller writes it: a session of a new one may leave out its definition, modes and workspace, and agent work its materials, return target and result policy. `completeAgentWork` fills them in before the work is read as `ScheduleWork`. */
export const ScheduleWorkAsWrittenSchema = z.discriminatedUnion('kind', [
  program,
  z.strictObject({
    kind: z.literal('agent'),
    instruction: ScheduleInstructionSchema,
    session: z.discriminatedUnion('mode', [
      z.strictObject({
        mode: z.literal('new'),
        agentDefinitionRef: ref.optional(),
        modes: ScheduleAgentModesSchema.optional(),
        workspace: ScheduleWorkspaceInputSchema.nullable().optional(),
      }),
      z.strictObject({ mode: z.literal('existing'), sessionRef: ref }),
    ]),
    materials: z.array(ScheduleMaterialInputSchema).optional(),
    returnTo: z
      .strictObject({ kind: z.literal('external'), targetRef: ref })
      .nullable()
      .optional(),
    resultPolicy: ScheduleResultPolicySchema.optional(),
  }),
])
export const SchedulePurposeAsWrittenSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...execution, work: ScheduleWorkAsWrittenSchema }),
  reminder,
])
export type SchedulePurpose = z.infer<typeof SchedulePurposeSchema>
export type ScheduleOverlap = z.infer<typeof ScheduleOverlapSchema>
export type ScheduleWork = z.infer<typeof ScheduleWorkSchema>
export type ScheduleResultPolicy = z.infer<typeof ScheduleResultPolicySchema>
export type ScheduleAgentSessionPlan = z.infer<typeof ScheduleAgentSessionPlanSchema>
