import { z } from 'zod'
import { SettingsTargetSchema, type SettingsChange } from './commands.ts'
import { SettingsIdSchema } from './schema.ts'
import type { SettingsChangePage, SettingsFailure, SettingsOperation } from './ports.ts'

export const SettingsOperationRefSchema = z.strictObject({
  target: SettingsTargetSchema,
  operationId: SettingsIdSchema,
})
export const SettingsPreparationRefSchema = z.strictObject({
  protocol: z.literal('settings-preparation/1'),
  operation: SettingsOperationRefSchema,
  attemptId: SettingsIdSchema,
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const SettingsPreparedCommitSchema = z.strictObject({
  requestId: SettingsIdSchema,
  preparation: SettingsPreparationRefSchema,
})
export const SettingsCancelChangeSchema = z.strictObject({
  requestId: SettingsIdSchema,
  operation: SettingsOperationRefSchema,
})
export const SettingsAbortedOperationSchema = z.strictObject({
  kind: z.literal('aborted'),
  operation: SettingsOperationRefSchema,
  reason: z.enum([
    'cancelled',
    'sealed',
    'forbidden',
    'revision_conflict',
    'definition_changed',
    'locked',
    'incompatible',
  ]),
})
export type SettingsOperationRef = z.infer<typeof SettingsOperationRefSchema>
export type SettingsPreparationRef = z.infer<typeof SettingsPreparationRefSchema>
export type SettingsPreparedCommit = z.infer<typeof SettingsPreparedCommitSchema>
export type SettingsCancelChange = z.infer<typeof SettingsCancelChangeSchema>
export type SettingsAbortedOperation = z.infer<typeof SettingsAbortedOperationSchema>
export type SettingsCommittedOperation = Omit<SettingsOperation, 'operationId'> &
  Readonly<{ operation: SettingsOperationRef }>
export type SettingsPreparedCommitResult =
  | SettingsCommittedOperation
  | SettingsAbortedOperation
  | SettingsFailure
  | Readonly<{ kind: 'unknown'; operation: SettingsOperationRef }>
export type SettingsPrepareResult =
  | Readonly<{ kind: 'prepared'; preparation: SettingsPreparationRef }>
  | SettingsPreparedCommitResult
export type SettingsPreparedOperationResult =
  | SettingsPreparedCommitResult
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'pending'
      operation: SettingsOperationRef
      attempt: SettingsPreparationRef | null
    }>
export type SettingsCancelResult = SettingsPreparedCommitResult | Readonly<{ kind: 'not_found' }>

/** A preparation reference identifies persisted work; it does not grant authority to commit it. */
export interface SettingsPreparationPort<Context> {
  prepareChange(context: Context, command: SettingsChange): Promise<SettingsPrepareResult>
  commitChange(
    context: Context,
    input: SettingsPreparedCommit,
  ): Promise<SettingsPreparedCommitResult>
  cancelChange(context: Context, input: SettingsCancelChange): Promise<SettingsCancelResult>
  getOperation(
    context: Context,
    input: SettingsOperationRef,
  ): Promise<SettingsPreparedOperationResult>
  readChanges(
    context: Context,
    input: Readonly<{
      target: SettingsOperationRef['target']
      afterRevision: number
      limit: number
    }>,
  ): Promise<SettingsChangePage | SettingsFailure>
}
