import { z } from 'zod'
import {
  BindReceiverSchema,
  ConsumeDecisionSchema,
  ConsumerReceiptSchema,
  DecisionSchema,
  HitlIdentifierSchema,
  OperationRefSchema,
  ReceiverGenerationSchema,
  RegisterRequestSchema,
  RequestRefSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import { SqlCommandSchema } from './request-schema.ts'

export const WAIT_CONTROL = 'hitl.independent-control'
export const WAIT_ACCEPT = 'hitl.independent-inbox'
export const WAIT_PROTOCOL = 'independent-wait/1'
export const WAIT_HANDLER = 'hitl.independent-read'
export const CONTROL_MIGRATION = { owner: WAIT_CONTROL, id: 'independent-control-1' }
export const INBOX_MIGRATION = { owner: WAIT_ACCEPT, id: 'independent-inbox-1' }
const actors = z.array(HitlIdentifierSchema).min(1).max(64).readonly()
export const IndependentPreparationSchema = z
  .strictObject({
    registration: RegisterRequestSchema,
    readers: actors,
    responders: actors,
    compatibleImplementations: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
  })
  .refine(
    input =>
      input.registration.origin.kind === 'independent' &&
      input.registration.origin.sessionRef === undefined &&
      input.registration.origin.runRef === undefined &&
      input.readers.includes(input.registration.operation.actorRef) &&
      input.responders.every(actor => input.readers.includes(actor)),
    { message: 'Independent preparation owns its audience and has no session lifecycle' },
  )
  .readonly()
export const IndependentControlSchema = z
  .strictObject({
    preparation: IndependentPreparationSchema,
    receiver: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('unbound'), generation: ReceiverGenerationSchema }),
      z.strictObject({
        kind: z.literal('bound'),
        generation: ReceiverGenerationSchema,
        instanceId: HitlIdentifierSchema,
        implementationRef: HitlIdentifierSchema,
      }),
    ]),
    lifecycle: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('live') }),
      z.strictObject({ kind: z.literal('terminal'), evidenceRef: HitlIdentifierSchema }),
    ]),
    receipts: z.array(ConsumerReceiptSchema).max(64).readonly(),
    checkpoint: z.enum(['waiting', 'resume-ready', 'terminal']),
  })
  .readonly()
export const ActiveWaitSchema = z
  .strictObject({
    requestRef: RequestRefSchema,
    cardIds: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
  })
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
export type IndependentControl = z.infer<typeof IndependentControlSchema>
export type ActiveWait = z.infer<typeof ActiveWaitSchema>
export type InboxEntry = z.infer<typeof InboxEntrySchema>
export type IndependentCommand = z.infer<typeof IndependentCommandSchema>

export const IndependentSnapshotSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({
    kind: z.literal('snapshot'),
    state: IndependentControlSchema,
    active: ActiveWaitSchema.nullable(),
    decisions: z.array(InboxEntrySchema).max(64).readonly(),
  }),
])
export const IndependentInboxSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('stale-generation') }),
  z.strictObject({
    kind: z.literal('page'),
    decisions: z.array(InboxEntrySchema).max(64).readonly(),
    next: z.null(),
  }),
])
