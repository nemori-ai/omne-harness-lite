import { z } from 'zod'
import {
  ConsumerReceiptSchema,
  HitlIdentifierSchema,
  OperationRefSchema,
  OriginSchema,
  ReceiverGenerationSchema,
  TenantRefSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import { HitlSqlBindingSchema } from './terminal-schema.ts'
import { WaitBasisSchema } from './request-schema.ts'
import { digestSchema, ordinalSchema } from './relational-values.ts'
import { StoredOperationSchema } from './operation-schema.ts'

export const WAIT_PLANNER = 'hitl.wait-plan'
export const WAIT_WRITER = 'hitl.independent-state'
export const WAIT_STATE_MIGRATION = { owner: WAIT_WRITER, id: 'independent-state-2' }
export const WAIT_FINAL_MIGRATION = { owner: WAIT_WRITER, id: 'independent-state-finalize-2' }
export const PreparationRecordSchema = z
  .strictObject({
    tenantRef: TenantRefSchema,
    waitRef: WaitRefSchema,
    ownerActor: HitlIdentifierSchema,
    preparationRef: HitlIdentifierSchema,
    preparationDigest: digestSchema,
    registrationDigest: digestSchema,
    registrationOperation: OperationRefSchema,
    origin: OriginSchema,
  })
  .readonly()
export const ReceiverSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unbound'), generation: ReceiverGenerationSchema }),
  z.strictObject({
    kind: z.literal('bound'),
    generation: ReceiverGenerationSchema,
    instanceId: HitlIdentifierSchema,
    implementationRef: HitlIdentifierSchema,
  }),
])
export const LifecycleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('live') }),
  z.strictObject({ kind: z.literal('terminal'), evidenceRef: HitlIdentifierSchema }),
])
export const WaitControlSchema = z
  .strictObject({
    preparation: PreparationRecordSchema,
    receiver: ReceiverSchema,
    lifecycle: LifecycleSchema,
    receiptCount: z.number().int().min(0).max(64),
    checkpoint: z.enum(['waiting', 'resume-ready', 'terminal']),
  })
  .readonly()
export const WaitDeltaSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('prepare'),
    preparation: PreparationRecordSchema,
    audience: z
      .array(z.strictObject({ actorRef: HitlIdentifierSchema, canRespond: z.boolean() }))
      .min(1)
      .max(64)
      .readonly(),
    implementations: z.array(HitlIdentifierSchema).min(1).max(64).readonly(),
  }),
  z.strictObject({ kind: z.literal('terminal'), evidenceRef: HitlIdentifierSchema }),
  z.strictObject({
    kind: z.literal('bind'),
    expectedGeneration: ReceiverGenerationSchema,
    receiver: ReceiverSchema,
  }),
  z.strictObject({
    kind: z.literal('consume'),
    ordinal: ordinalSchema,
    expectedCount: z.number().int().min(0).max(63),
    receipt: ConsumerReceiptSchema,
    checkpoint: z.enum(['waiting', 'resume-ready', 'terminal']),
  }),
])
const common = { binding: HitlSqlBindingSchema, waitRef: WaitRefSchema, delta: WaitDeltaSchema }
export const WaitPlanSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...common,
      kind: z.literal('request-basis'),
      ownerActor: HitlIdentifierSchema,
      basis: WaitBasisSchema,
    }),
    z.strictObject({
      ...common,
      kind: z.literal('wait-operation'),
      response: z.union([
        z.strictObject({ kind: z.literal('prepared'), preparationRef: HitlIdentifierSchema }),
        StoredOperationSchema,
      ]),
    }),
  ])
  .readonly()
export type WaitControl = z.infer<typeof WaitControlSchema>
export type PreparationRecord = z.infer<typeof PreparationRecordSchema>
export type WaitDelta = z.infer<typeof WaitDeltaSchema>
export type WaitPlan = z.infer<typeof WaitPlanSchema>
