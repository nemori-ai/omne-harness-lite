import { z } from 'zod'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { sourceUpdateSchema } from './source-retention-schema.ts'

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
export const attemptTerminalSchema = z.strictObject({
  kind: z.literal('attempt'),
  binding: settingsAttemptBindingSchema,
  state: z.enum(['committed', 'aborted']),
})
export type AttemptTerminal = z.infer<typeof attemptTerminalSchema>
export const terminalObservationSchema = z.strictObject({
  request: recoveryRequestSchema,
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
export const finalizationTerminalSchema = z.strictObject({
  request: recoveryRequestSchema,
  terminal: attemptTerminalSchema.nullable(),
})
export const sourceFinalizationFactSchema = z.strictObject({
  kind: z.literal('finalization'),
  request: recoveryRequestSchema,
  action: sourceFinalizationActionSchema,
})
export const sourceFinalizationResultSchema = z.strictObject({
  kind: z.literal('finalized'),
  request: recoveryRequestSchema,
  result: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({
      kind: z.literal('finished'),
      update: sourceUpdateSchema,
      outcome: z.enum(['committed', 'aborted']),
    }),
  ]),
})
