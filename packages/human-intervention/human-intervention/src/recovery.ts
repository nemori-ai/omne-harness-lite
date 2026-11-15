import { z } from 'zod'
import { decodeCommand, type CommandDecodeFailure } from './decode-command.ts'
import { GetOperationSchema } from './queries.ts'
import {
  DecisionRefSchema,
  HitlIdentifierSchema,
  OperationRefSchema,
  ReceiverGenerationSchema,
  WaitRefSchema,
} from './values.ts'

const query = { protocol: z.literal('hitl/1'), waitRef: WaitRefSchema }
export const GetWaitSchema = z.strictObject(query).readonly()
export const BindReceiverSchema = z
  .strictObject({
    ...query,
    operation: OperationRefSchema,
    expectedGeneration: ReceiverGenerationSchema,
    instanceId: HitlIdentifierSchema,
    implementationRef: HitlIdentifierSchema,
  })
  .readonly()
export const ReadInboxSchema = z
  .strictObject({
    ...query,
    receiverGeneration: ReceiverGenerationSchema,
    cursor: HitlIdentifierSchema.optional(),
    limit: z.number().int().min(1).max(100),
  })
  .readonly()
export const ConsumeDecisionSchema = z
  .strictObject({
    ...query,
    operation: OperationRefSchema,
    receiverGeneration: ReceiverGenerationSchema,
    decisionRef: DecisionRefSchema,
    consumeOperationId: HitlIdentifierSchema,
  })
  .refine(
    command =>
      command.consumeOperationId === command.operation.operationId &&
      command.operation.tenantRef === command.decisionRef.card.request.tenantRef &&
      command.operation.tenantRef === command.decisionRef.submission.tenantRef,
    { message: 'Consumption must bind the original operation and decision tenant' },
  )
  .readonly()
export const GetRecoveryOperationSchema = GetOperationSchema

export type GetWait = z.infer<typeof GetWaitSchema>
export type BindReceiver = z.infer<typeof BindReceiverSchema>
export type ReadInbox = z.infer<typeof ReadInboxSchema>
export type ConsumeDecision = z.infer<typeof ConsumeDecisionSchema>
export type GetRecoveryOperation = z.infer<typeof GetRecoveryOperationSchema>
export type RecoveryWrites = { bindReceiver: BindReceiver; consumeDecision: ConsumeDecision }
export type RecoveryMethod = keyof RecoveryWrites
export const RecoveryCommandSchemas: {
  readonly [Method in RecoveryMethod]: z.ZodType<RecoveryWrites[Method]>
} = { bindReceiver: BindReceiverSchema, consumeDecision: ConsumeDecisionSchema }

export function decodeRecoveryCommand<Method extends RecoveryMethod>(
  method: Method,
  json: string,
): Readonly<{ kind: 'decoded'; command: RecoveryWrites[Method] }> | CommandDecodeFailure {
  return decodeCommand(RecoveryCommandSchemas[method], json)
}
