import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence } from './result.ts'
import type { ModelDelivery, ModelDeliveryKey } from './result-delivery-values.ts'

export type ModelSavedReceipt = Readonly<{ key: ModelDeliveryKey; evidence: DurableEvidence }>
export type ModelDeliveryFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'backpressured'; resource: 'records' | 'bytes' | 'attachments' | 'in-flight' }>
  | Readonly<{ kind: 'unavailable'; dependency: string }>
  | Readonly<{ kind: 'cancelled-before-accept' }>
  | Readonly<{ kind: 'outcome-unknown' }>

export interface ModelResultReceiver<P> {
  push(
    input: Readonly<{
      access: Access<P>
      delivery: ModelDelivery
      signal: AbortSignal
    }>,
  ): Promise<Outcome<ModelSavedReceipt, ModelDeliveryFailure>>
}
