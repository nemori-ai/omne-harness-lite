import { z } from 'zod'
import {
  AcknowledgeDeliverySchema,
  ActionBasisSchema,
  CardSchema,
  ConsumerReceiptSchema,
  DecisionSchema,
  HitlIdentifierSchema,
  InvalidateWaitSchema,
  OriginSchema,
  RegisterRequestSchema,
  RequestRefSchema,
  RevisionSchema,
  SubmitReplySchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import { SqlCommandResultSchema } from './operation-schema.ts'
export { SqlCommandResultSchema } from './operation-schema.ts'
import { equal } from './encoding.ts'
import { HitlSqlBindingSchema } from './terminal-schema.ts'

export const REQUEST_PLANNER = 'hitl.plan'
export const REQUEST_WRITER = 'hitl.requests'
export const REQUEST_PROTOCOL = 'hitl-sql/1'
export const REQUEST_HANDLER = 'hitl.request-read'
export const REQUEST_MIGRATION = { owner: REQUEST_WRITER, id: 'hitl-requests-1' }
export const WAIT_BASIS_FACT = { key: 'hitl.wait-basis', protocol: REQUEST_PROTOCOL }
export const PLAN_FACT = { key: 'hitl.request-plan', protocol: REQUEST_PROTOCOL }
export const WAIT_ACCEPTED_FACT = { key: 'hitl.wait-accepted', protocol: REQUEST_PROTOCOL }
const methodSchema = z.enum([
  'registerRequest',
  'submitReply',
  'invalidateWait',
  'acknowledgeDelivery',
])
export const RequestRecordSchema = z
  .strictObject({
    ref: RequestRefSchema,
    revision: RevisionSchema,
    origin: OriginSchema,
    displayContext: z.string(),
    actionBasis: ActionBasisSchema.optional(),
    cards: z.array(CardSchema).min(1).max(64).readonly(),
  })
  .refine(record => record.cards.every(card => equal(card.ref.request, record.ref)), {
    message: 'Cards must belong to their request',
  })
  .refine(
    record => new Set(record.cards.map(card => card.ref.cardId)).size === record.cards.length,
    { message: 'Card identities must be unique within a request' },
  )
  .readonly()
export const SqlCommandSchema = z
  .discriminatedUnion('method', [
    z.strictObject({ method: z.literal('registerRequest'), command: RegisterRequestSchema }),
    z.strictObject({ method: z.literal('submitReply'), command: SubmitReplySchema }),
    z.strictObject({ method: z.literal('invalidateWait'), command: InvalidateWaitSchema }),
    z.strictObject({
      method: z.literal('acknowledgeDelivery'),
      command: AcknowledgeDeliverySchema,
    }),
  ])
  .readonly()
export const WaitBasisSchema = z
  .strictObject({
    binding: HitlSqlBindingSchema,
    method: methodSchema,
    origin: OriginSchema,
    preparationRef: HitlIdentifierSchema,
    registrationDigest: z.string(),
    requestRef: RequestRefSchema.nullable(),
    state: z.enum(['prepared', 'active', 'terminal']),
    receipt: ConsumerReceiptSchema.optional(),
  })
  .readonly()
export const WaitEffectSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({
      kind: z.literal('register'),
      requestRef: RequestRefSchema,
      cardIds: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
    }),
    z.strictObject({ kind: z.literal('deliver'), decision: DecisionSchema }),
  ])
  .readonly()
export const RequestPlanSchema = z
  .strictObject({
    binding: HitlSqlBindingSchema,
    method: methodSchema,
    waitRef: WaitRefSchema,
    result: SqlCommandResultSchema,
    update: RequestRecordSchema.nullable(),
    effect: WaitEffectSchema,
  })
  .readonly()
export const WaitAcceptedSchema = z
  .strictObject({ binding: HitlSqlBindingSchema, planDigest: z.string() })
  .readonly()
export type SqlCommand = z.infer<typeof SqlCommandSchema>
export type RequestRecord = z.infer<typeof RequestRecordSchema>
export type RequestPlan = z.infer<typeof RequestPlanSchema>
export type WaitBasis = z.infer<typeof WaitBasisSchema>
