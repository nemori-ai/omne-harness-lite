import { z } from 'zod'

const encoder = new TextEncoder()
export const HITL_COMMAND_MAX_BYTES = 262_144

function text(maxCodePoints: number) {
  return z
    .string()
    .min(1)
    .refine(
      value =>
        [...value].length <= maxCodePoints && encoder.encode(value).byteLength <= maxCodePoints * 4,
    )
}

export const HitlIdentifierSchema = text(256)
export const HitlTextSchema = text(8192)
const counter = z.string().regex(/^(0|[1-9][0-9]*)$/)
export const RevisionSchema = counter.brand<'HitlRevision'>()
export const ReceiverGenerationSchema = counter.brand<'HitlReceiverGeneration'>()
export const TenantRefSchema = HitlIdentifierSchema.brand<'HitlTenantRef'>()
export const RequestRefSchema = z
  .strictObject({
    tenantRef: TenantRefSchema,
    requestId: HitlIdentifierSchema.brand<'HitlRequestId'>(),
  })
  .readonly()
export const CardIdSchema = HitlIdentifierSchema.brand<'HitlCardId'>()
export const CardRefSchema = z
  .strictObject({
    request: RequestRefSchema,
    cardId: CardIdSchema,
  })
  .readonly()
export const OperationRefSchema = z
  .strictObject({
    tenantRef: TenantRefSchema,
    actorRef: HitlIdentifierSchema.brand<'HitlActorRef'>(),
    operationId: HitlIdentifierSchema.brand<'HitlOperationId'>(),
  })
  .readonly()
export const WaitRefSchema = z
  .strictObject({
    owner: HitlIdentifierSchema,
    waitId: HitlIdentifierSchema,
    incarnation: HitlIdentifierSchema,
    destination: HitlIdentifierSchema,
  })
  .readonly()
export const DecisionRefSchema = z
  .strictObject({
    card: CardRefSchema,
    decisionId: HitlIdentifierSchema.brand<'HitlDecisionId'>(),
    submission: OperationRefSchema,
  })
  .readonly()
export const ReplySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('selection'), optionId: HitlIdentifierSchema }),
    z.strictObject({ kind: z.literal('text'), text: HitlTextSchema }),
    z.strictObject({ kind: z.literal('decline') }),
  ])
  .readonly()
const option = z.strictObject({
  id: HitlIdentifierSchema,
  label: text(256),
  description: text(4096),
})
const effectOption = option.extend({ effectRef: HitlIdentifierSchema.optional() })
const questionFields = {
  cardId: CardIdSchema,
  title: text(256),
  description: text(4096),
}
export const QuestionSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...questionFields,
      kind: z.literal('question'),
      options: z.array(option.readonly()).min(1).max(64).readonly(),
    }),
    z.strictObject({
      ...questionFields,
      kind: z.literal('extension'),
      options: z.array(option.readonly()).max(64).readonly(),
    }),
    z.strictObject({
      ...questionFields,
      kind: z.literal('approval'),
      options: z.array(effectOption.readonly()).max(64).readonly(),
    }),
    z.strictObject({
      ...questionFields,
      kind: z.literal('admission'),
      options: z.array(effectOption.readonly()).max(64).readonly(),
    }),
  ])
  .refine(
    question => new Set(question.options.map(item => item.id)).size === question.options.length,
    { message: 'Option identities must be unique within a card' },
  )
  .readonly()
const originFields = {
  originRef: HitlIdentifierSchema,
  wait: WaitRefSchema,
  positionRef: HitlIdentifierSchema,
  adoptionRef: HitlIdentifierSchema,
  sessionRef: HitlIdentifierSchema.optional(),
  runRef: HitlIdentifierSchema.optional(),
}
export const OriginSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...originFields, kind: z.literal('tool'), toolCallRef: HitlIdentifierSchema }),
    z.strictObject({ ...originFields, kind: z.literal('agent-extension') }),
    z.strictObject({
      ...originFields,
      kind: z.literal('admission'),
      toolCallRef: HitlIdentifierSchema.optional(),
    }),
    z.strictObject({ ...originFields, kind: z.literal('independent') }),
  ])
  .refine(origin => origin.runRef === undefined || origin.sessionRef !== undefined, {
    message: 'A run reference requires its session reference',
  })
  .brand<'HitlOrigin'>()
  .readonly()
export const ActionBasisSchema = z
  .strictObject({
    operation: OperationRefSchema,
    targetRef: HitlIdentifierSchema,
    effectiveArgumentsDigest: HitlIdentifierSchema,
    implementationRef: HitlIdentifierSchema,
    authorizationBasisRef: HitlIdentifierSchema,
  })
  .readonly()
export const InvalidationReasonSchema = z.enum([
  'cancelled',
  'archived',
  'origin-terminal',
  'continuity-lost',
])
export const ConsumerReceiptSchema = z
  .strictObject({
    decision: DecisionRefSchema,
    wait: WaitRefSchema,
    consumeOperationId: HitlIdentifierSchema,
    receiverGeneration: ReceiverGenerationSchema,
    outcome: z.enum(['accepted', 'superseded']),
    evidenceRef: HitlIdentifierSchema,
  })
  .readonly()

export type RequestRef = z.infer<typeof RequestRefSchema>
export type CardRef = z.infer<typeof CardRefSchema>
export type OperationRef = z.infer<typeof OperationRefSchema>
export type WaitRef = z.infer<typeof WaitRefSchema>
export type DecisionRef = z.infer<typeof DecisionRefSchema>
export type Reply = z.infer<typeof ReplySchema>
export type Question = z.infer<typeof QuestionSchema>
export type Origin = z.infer<typeof OriginSchema>
export type ActionBasis = z.infer<typeof ActionBasisSchema>
export type ConsumerReceipt = z.infer<typeof ConsumerReceiptSchema>
export type Revision = z.infer<typeof RevisionSchema>
export type ReceiverGeneration = z.infer<typeof ReceiverGenerationSchema>
export type InvalidationReason = z.infer<typeof InvalidationReasonSchema>

export function sameCard(left: CardRef, right: CardRef): boolean {
  return (
    left.request.tenantRef === right.request.tenantRef &&
    left.request.requestId === right.request.requestId &&
    left.cardId === right.cardId
  )
}

export function nextRevision(revision: Revision): Revision {
  return RevisionSchema.parse((BigInt(revision) + 1n).toString())
}
