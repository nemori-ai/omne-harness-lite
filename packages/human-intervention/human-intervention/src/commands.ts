import { z } from 'zod'
import {
  ActionBasisSchema,
  CardRefSchema,
  ConsumerReceiptSchema,
  HITL_COMMAND_MAX_BYTES,
  HitlIdentifierSchema,
  HitlTextSchema,
  InvalidationReasonSchema,
  OperationRefSchema,
  OriginSchema,
  QuestionSchema,
  ReplySchema,
  RevisionSchema,
  WaitRefSchema,
} from './values.ts'

const envelope = { protocol: z.literal('hitl/1'), operation: OperationRefSchema }
export const RegisterRequestSchema = z
  .strictObject({
    ...envelope,
    origin: OriginSchema,
    questions: z.array(QuestionSchema).min(1).max(64).readonly(),
    displayContext: HitlTextSchema,
    actionBasis: ActionBasisSchema.optional(),
    preparationRef: HitlIdentifierSchema,
  })
  .refine(
    command =>
      new Set(command.questions.map(question => question.cardId)).size === command.questions.length,
    { message: 'Card identities must be unique within a request' },
  )
  .readonly()
export const SubmitReplySchema = z
  .strictObject({
    ...envelope,
    cardRef: CardRefSchema,
    expectedRevision: RevisionSchema,
    reply: ReplySchema,
  })
  .readonly()
export const InvalidateWaitSchema = z
  .strictObject({
    ...envelope,
    waitRef: WaitRefSchema,
    terminalEvidenceRef: HitlIdentifierSchema,
    reason: InvalidationReasonSchema,
  })
  .readonly()
export const AcknowledgeDeliverySchema = z
  .strictObject({
    ...envelope,
    consumerReceipt: ConsumerReceiptSchema,
  })
  .readonly()
export const HitlCommandSchemas: {
  readonly [Method in HitlMethod]: z.ZodType<HitlCommands[Method]>
} = {
  registerRequest: RegisterRequestSchema,
  submitReply: SubmitReplySchema,
  invalidateWait: InvalidateWaitSchema,
  acknowledgeDelivery: AcknowledgeDeliverySchema,
}
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>
export type SubmitReply = z.infer<typeof SubmitReplySchema>
export type InvalidateWait = z.infer<typeof InvalidateWaitSchema>
export type AcknowledgeDelivery = z.infer<typeof AcknowledgeDeliverySchema>
export type HitlCommands = {
  registerRequest: RegisterRequest
  submitReply: SubmitReply
  invalidateWait: InvalidateWait
  acknowledgeDelivery: AcknowledgeDelivery
}
export type HitlMethod = keyof HitlCommands
export type CommandDecodeFailure =
  | Readonly<{ kind: 'invalid-input'; reason: 'json' | 'shape' }>
  | Readonly<{ kind: 'limited'; resource: 'command-bytes'; limit: number }>

export function decodeHitlCommand<Method extends HitlMethod>(
  method: Method,
  json: string,
): Readonly<{ kind: 'decoded'; command: HitlCommands[Method] }> | CommandDecodeFailure {
  if (new TextEncoder().encode(json).byteLength > HITL_COMMAND_MAX_BYTES) {
    return { kind: 'limited', resource: 'command-bytes', limit: HITL_COMMAND_MAX_BYTES }
  }
  let input: unknown
  try {
    input = JSON.parse(json)
  } catch {
    return { kind: 'invalid-input', reason: 'json' }
  }
  const result = HitlCommandSchemas[method].safeParse(input)
  if (!result.success) return { kind: 'invalid-input', reason: 'shape' }
  return { kind: 'decoded', command: result.data }
}
