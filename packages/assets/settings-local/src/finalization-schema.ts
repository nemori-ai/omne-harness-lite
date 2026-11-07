import { z } from 'zod'
import { checkpointRequestSchema } from './checkpoint-schema.ts'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { sourceUpdateSchema, sourceReferenceSchema } from './source-retention-schema.ts'
import { readySettingsIntentSchema } from './ready-schema.ts'
import { operationSchema, stateRecordSchema } from './schema.ts'
import { businessRefusalSchema } from './commit-current.ts'
import { equal } from './encoding.ts'

export const FINALIZATION_PLAN = {
  key: 'settings.finalization-plan',
  protocol: 'settings-finalization/1',
}
export const TERMINAL_OBSERVATION = {
  key: 'settings.terminal-observation',
  protocol: 'settings-finalization/1',
}
export const FINALIZATION_TERMINAL = {
  key: 'settings.finalization-terminal',
  protocol: 'settings-finalization/1',
}
export const recoveryRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('seal'), binding: settingsAttemptBindingSchema }),
  z.strictObject({
    kind: z.literal('cancel'),
    binding: settingsAttemptBindingSchema.extend({
      attemptId: settingsAttemptBindingSchema.shape.attemptId.nullable(),
    }),
  }),
])
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>
export const readyRequestSchema = z.strictObject({
  kind: z.literal('ready'),
  binding: settingsAttemptBindingSchema,
})
export const commitRequestSchema = z.strictObject({
  kind: z.literal('commit'),
  binding: settingsAttemptBindingSchema,
})
export const finalizationRequestSchema = z.union([
  recoveryRequestSchema,
  readyRequestSchema,
  commitRequestSchema,
  checkpointRequestSchema,
])
export type FinalizationRequest = z.infer<typeof finalizationRequestSchema>
export const PREPARATION_CURRENT = {
  key: 'settings.preparation-current',
  protocol: 'settings-preparation-current/1',
}
export const preparationCurrentSchema = readySettingsIntentSchema.omit({ terminal: true })
export const attemptTerminalSchema = z.strictObject({
  kind: z.literal('attempt'),
  binding: settingsAttemptBindingSchema,
  state: z.enum(['committed', 'aborted']),
})
export type AttemptTerminal = z.infer<typeof attemptTerminalSchema>
export const terminalObservationSchema = z.strictObject({
  request: finalizationRequestSchema,
  observation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('no-attempt') }),
    z.strictObject({ kind: z.literal('absent') }),
    z.strictObject({ kind: z.literal('terminal'), terminal: attemptTerminalSchema }),
  ]),
})
export const sourceFinalizationActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('finish'),
    update: sourceUpdateSchema,
    outcome: z.enum(['committed', 'aborted']),
  }),
])
export const recoveryPlanSchema = z.strictObject({
  request: recoveryRequestSchema,
  terminal: attemptTerminalSchema.nullable(),
  effect: z.enum(['recognize', 'settle']),
  source: sourceFinalizationActionSchema,
})
export type RecoveryPlan = z.infer<typeof recoveryPlanSchema>
export const businessSourceActionSchema = z.union([
  sourceFinalizationActionSchema,
  z.strictObject({ kind: z.literal('check-open'), source: sourceReferenceSchema }),
])
export const businessOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('apply'), record: stateRecordSchema, result: operationSchema }),
  z.strictObject({ kind: z.literal('abort-root'), reason: businessRefusalSchema }),
  z.strictObject({ kind: z.literal('abort-attempt') }),
])
const businessPlanBase = {
  request: commitRequestSchema,
  effect: z.literal('business'),
}
export const businessPlanSchema = z
  .union([
    z.strictObject({
      ...businessPlanBase,
      terminal: attemptTerminalSchema.extend({ state: z.literal('committed') }),
      source: z.union([
        z.strictObject({ kind: z.literal('check-open'), source: sourceReferenceSchema }),
        z.strictObject({
          kind: z.literal('finish'),
          update: sourceUpdateSchema,
          outcome: z.literal('committed'),
        }),
      ]),
      outcome: businessOutcomeSchema.options[0],
    }),
    z.strictObject({
      ...businessPlanBase,
      terminal: attemptTerminalSchema.extend({ state: z.literal('aborted') }),
      source: z.union([
        z.strictObject({ kind: z.literal('none') }),
        z.strictObject({
          kind: z.literal('finish'),
          update: sourceUpdateSchema,
          outcome: z.literal('aborted'),
        }),
      ]),
      outcome: z.union([businessOutcomeSchema.options[1], businessOutcomeSchema.options[2]]),
    }),
  ])
  .refine(
    plan => {
      const { binding } = plan.request
      if (!equal(plan.terminal.binding, binding)) return false
      const source = { domain: binding.identity.domain, target: binding.identity.operation.target }
      if (plan.source.kind === 'check-open') return equal(plan.source.source, source)
      if (plan.source.kind === 'finish')
        return equal(plan.source.update, {
          source,
          identity: binding.identity,
          commandDigest: binding.commandDigest,
        })
      return true
    },
    { message: 'Business terminal and source action must bind the exact requested attempt' },
  )
export type BusinessPlan = z.infer<typeof businessPlanSchema>
export const readyPlanSchema = z.strictObject({
  request: readyRequestSchema,
  terminal: z.null(),
  effect: z.literal('prepare'),
  source: z.strictObject({ kind: z.literal('none') }),
  preparation: readySettingsIntentSchema,
})
export const checkpointPlanSchema = z
  .strictObject({
    request: checkpointRequestSchema,
    terminal: z.null(),
    effect: z.literal('checkpoint'),
    source: z.union([
      z.strictObject({ kind: z.literal('none') }),
      z.strictObject({ kind: z.literal('begin'), update: sourceUpdateSchema }),
    ]),
  })
  .refine(
    plan =>
      plan.source.kind === 'none' ||
      (plan.request.command.kind === 'allocate' &&
        plan.request.command.input.purpose.kind === 'source-update' &&
        equal(plan.source.update, {
          source: {
            domain: plan.request.binding.identity.domain,
            target: plan.request.binding.identity.operation.target,
          },
          identity: plan.request.binding.identity,
          commandDigest: plan.request.binding.commandDigest,
        })),
    { message: 'Only exact source allocation can begin a source update' },
  )
export const finalizationPlanSchema = z.union([
  recoveryPlanSchema,
  readyPlanSchema,
  businessPlanSchema,
  checkpointPlanSchema,
])
export const finalizationTerminalSchema = z.strictObject({
  request: finalizationRequestSchema,
  terminal: attemptTerminalSchema.nullable(),
})
export const sourceFinalizationFactSchema = z.strictObject({
  kind: z.literal('finalization'),
  request: finalizationRequestSchema,
  action: z.union([
    businessSourceActionSchema,
    z.strictObject({ kind: z.literal('begin'), update: sourceUpdateSchema }),
  ]),
})
export const sourceFinalizationResultSchema = z.strictObject({
  kind: z.literal('finalized'),
  request: finalizationRequestSchema,
  result: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({ kind: z.literal('pending'), update: sourceUpdateSchema }),
    z.strictObject({ kind: z.literal('checked-open'), source: sourceReferenceSchema }),
    z.strictObject({
      kind: z.literal('finished'),
      update: sourceUpdateSchema,
      outcome: z.enum(['committed', 'aborted']),
    }),
  ]),
})
