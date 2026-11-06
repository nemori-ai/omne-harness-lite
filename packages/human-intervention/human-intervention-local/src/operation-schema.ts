import { z } from 'zod'
import {
  CardRefSchema,
  ConsumerReceiptSchema,
  DecisionSchema,
  DecisionRefSchema,
  OperationRefSchema,
  ReceiverGenerationSchema,
  RequestRefSchema,
  RevisionSchema,
  WaitRefSchema,
  type CommittedOperation,
  type CommittedRecoveryOperation,
} from '@omne-harness/human-intervention'
import { equal, operationKey } from './encoding.ts'
import { HitlSqlBindingSchema } from './terminal-schema.ts'

const operation = { operationRef: OperationRefSchema }
const failure = z.union([
  z.strictObject({
    ...operation,
    kind: z.enum(['denied', 'conflict', 'invalid-input', 'unavailable']),
    reason: z.string(),
  }),
  z.strictObject({
    ...operation,
    kind: z.literal('limited'),
    resource: z.string(),
    limit: z.number().int().nonnegative(),
  }),
])
const registered = z.strictObject({
  ...operation,
  kind: z.literal('registered'),
  requestRef: RequestRefSchema,
  revision: RevisionSchema,
  cards: z.array(CardRefSchema).readonly(),
})
const replied = z.union([
  z.strictObject({
    ...operation,
    kind: z.literal('decided'),
    decisionRef: DecisionRefSchema,
    revision: RevisionSchema,
    delivery: z.enum(['pending', 'accepted']),
  }),
  z.strictObject({ ...operation, kind: z.literal('already-decided'), decision: DecisionSchema }),
  z.strictObject({ ...operation, kind: z.literal('invalidated'), reason: z.string() }),
])
const invalidated = z.strictObject({
  ...operation,
  kind: z.literal('invalidated'),
  affected: z.number().int().nonnegative(),
  revision: RevisionSchema,
})
const acknowledged = z.strictObject({
  ...operation,
  kind: z.literal('acknowledged'),
  decisionRef: DecisionRefSchema,
  outcome: z.enum(['accepted', 'superseded']),
})
export const SqlCommandResultSchema = z
  .union([registered, replied, invalidated, acknowledged, failure])
  .readonly()
const binding = {
  ...HitlSqlBindingSchema.unwrap().shape,
  kind: z.literal('committed'),
  commitReceipt: z.string(),
}
const requestOperation = z.discriminatedUnion('method', [
  z.strictObject({
    ...binding,
    method: z.literal('registerRequest'),
    result: z.union([registered, failure]),
  }),
  z.strictObject({
    ...binding,
    method: z.literal('submitReply'),
    result: z.union([replied, failure]),
  }),
  z.strictObject({
    ...binding,
    method: z.literal('invalidateWait'),
    result: z.union([invalidated, failure]),
  }),
  z.strictObject({
    ...binding,
    method: z.literal('acknowledgeDelivery'),
    result: z.union([acknowledged, failure]),
  }),
])
const bound = z.union([
  z.strictObject({
    ...operation,
    kind: z.literal('bound'),
    waitRef: WaitRefSchema,
    receiverGeneration: ReceiverGenerationSchema,
  }),
  z.strictObject({ ...operation, kind: z.literal('terminal'), terminalEvidenceRef: z.string() }),
  z.strictObject({ ...operation, kind: z.literal('incompatible'), reason: z.string() }),
  failure,
])
const consumed = z.union([
  z.strictObject({
    ...operation,
    kind: z.literal('accepted'),
    receipt: ConsumerReceiptSchema.and(z.object({ outcome: z.literal('accepted') })),
  }),
  z.strictObject({
    ...operation,
    kind: z.literal('superseded'),
    receipt: ConsumerReceiptSchema.and(z.object({ outcome: z.literal('superseded') })),
  }),
  z.strictObject({ ...operation, kind: z.literal('stale-generation') }),
  z.strictObject({ ...operation, kind: z.literal('incompatible'), reason: z.string() }),
  failure,
])
const recoveryOperation = z.discriminatedUnion('method', [
  z.strictObject({ ...binding, method: z.literal('bindReceiver'), result: bound }),
  z.strictObject({ ...binding, method: z.literal('consumeDecision'), result: consumed }),
])
export const StoredOperationSchema: z.ZodType<CommittedOperation | CommittedRecoveryOperation> = z
  .union([requestOperation, recoveryOperation])
  .refine(value => equal(value.operationRef, value.result.operationRef), {
    message: 'Result must belong to the original operation',
  })
  .refine(value => value.commitReceipt === `hitl-${operationKey(value.operationRef)}`, {
    message: 'Receipt must belong to the original operation',
  })
  .readonly()
