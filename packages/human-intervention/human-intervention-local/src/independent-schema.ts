import { WaitControlSchema } from './wait-schema.ts'
import { ReadLimitedSchema } from './pool-schema.ts'
import { z } from 'zod'
import {
  BindReceiverSchema,
  ConsumeDecisionSchema,
  ConsumerReceiptSchema,
  DecisionSchema,
  HitlIdentifierSchema,
  OperationRefSchema,
  RegisterRequestSchema,
  RequestRefSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import { SqlCommandSchema } from './request-schema.ts'

export const WAIT_PROTOCOL = 'independent-wait/2'
export const WAIT_HANDLER = 'hitl.independent-read'
const actors = z.array(HitlIdentifierSchema).min(1).max(64).readonly()
export const IndependentPreparationSchema = z
  .strictObject({
    registration: RegisterRequestSchema,
    readers: actors,
    responders: actors,
    compatibleImplementations: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
  })
  .refine(
    ({ registration: { origin, operation }, readers, responders }) =>
      (origin.kind !== 'independent' ||
        (origin.sessionRef === undefined && origin.runRef === undefined)) &&
      readers.includes(operation.actorRef) &&
      responders.every(actor => readers.includes(actor)),
    {
      message:
        'A preparation owns its audience, and an independent origin has no session lifecycle',
    },
  )
  .readonly()
export const InboxEntrySchema = z
  .strictObject({
    decision: DecisionSchema,
    wait: WaitRefSchema,
    positionRef: HitlIdentifierSchema,
    adoptionRef: HitlIdentifierSchema,
  })
  .readonly()
export const IndependentCommandSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('prepare'),
      operation: OperationRefSchema,
      preparation: IndependentPreparationSchema,
    }),
    z.strictObject({ kind: z.literal('request'), input: SqlCommandSchema, waitRef: WaitRefSchema }),
    z.strictObject({ kind: z.literal('bind'), command: BindReceiverSchema }),
    z.strictObject({ kind: z.literal('consume'), command: ConsumeDecisionSchema }),
  ])
  .readonly()
export type IndependentPreparation = z.infer<typeof IndependentPreparationSchema>
export type InboxEntry = z.infer<typeof InboxEntrySchema>
export type IndependentCommand = z.infer<typeof IndependentCommandSchema>

export const IndependentSnapshotSchema = z.discriminatedUnion('kind', [
  ReadLimitedSchema,
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({
    kind: z.literal('snapshot'),
    state: z.strictObject({
      ...WaitControlSchema.unwrap().shape,
      receipts: z.array(ConsumerReceiptSchema).max(64).readonly(),
    }),
    active: z
      .strictObject({ requestRef: RequestRefSchema, cardCount: z.number().int().min(1).max(64) })
      .nullable(),
    hasDecisions: z.boolean(),
  }),
])
export const IndependentInboxSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('stale-generation') }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.string() }),
  ReadLimitedSchema,
  z.strictObject({
    kind: z.literal('page'),
    decisions: z.array(InboxEntrySchema).max(64).readonly(),
    next: z.number().int().min(0).max(64).nullable(),
  }),
])
