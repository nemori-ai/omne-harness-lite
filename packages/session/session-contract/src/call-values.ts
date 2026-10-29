import type { AttemptId, ConsumerRef, ConsumptionId, DurableEvidence } from './identity.ts'
import type { CallBinding, ProducerRef } from './values.ts'

export type SessionCallRegistration =
  | Readonly<{
      kind: 'associated'
      binding: CallBinding & Readonly<{ producer: Extract<ProducerRef, { kind: 'model' }> }>
      purpose: 'main' | 'compaction' | 'extension'
    }>
  | Readonly<{
      kind: 'associated'
      binding: CallBinding & Readonly<{ producer: Extract<ProducerRef, { kind: 'tool' }> }>
      purpose: 'action'
    }>
  | Readonly<{
      kind: 'tool-intent'
      action: string
      consumer: ConsumerRef
      request: DurableEvidence
      initiatingAttempt: AttemptId | null
      purpose: 'action'
    }>
export type SessionCallRecord = Readonly<{
  consumption: ConsumptionId
  registration: SessionCallRegistration
  registered: DurableEvidence
  association: DurableEvidence | null
}>
export type SessionCallWait = Readonly<{ consumption: ConsumptionId; position: string }>
