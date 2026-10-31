import { expectTypeOf, it } from 'vitest'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  judgeModelDelivery,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelDeliveryKey,
  type ModelDeliveryRejection,
  type ModelResultReceiver,
  type ModelSavedReceipt,
  type DurableEvidence,
} from '@omne-harness/model-contract'

declare const tenant: TenantId
declare const delivery: ModelDelivery
declare const key: ModelDeliveryKey
declare const evidence: DurableEvidence
declare const receiver: ModelResultReceiver<{ subject: string }>
declare const access: Access<{ subject: string }>
declare const signal: AbortSignal

it('exposes exactly the adopted object input and public Access with a promise Outcome', () => {
  expectTypeOf<Parameters<typeof receiver.push>>().toEqualTypeOf<
    [
      Readonly<{
        access: Access<{ subject: string }>
        delivery: ModelDelivery
        signal: AbortSignal
      }>,
    ]
  >()
  expectTypeOf(receiver.push({ access, delivery, signal })).toEqualTypeOf<
    Promise<Outcome<ModelSavedReceipt, ModelDeliveryFailure>>
  >()
  expectTypeOf(judgeModelDelivery({ tenant, delivery })).toEqualTypeOf<
    Outcome<ModelDelivery, ModelDeliveryRejection>
  >()
  expectTypeOf<ModelSavedReceipt>().toEqualTypeOf<
    Readonly<{ key: ModelDeliveryKey; evidence: DurableEvidence }>
  >()
  // @ts-expect-error tenant identities require the public mint
  const fakeTenant: TenantId = {}
  // @ts-expect-error signal is required
  void receiver.push({ access, delivery })
  // @ts-expect-error no positional overload
  void receiver.push(access, delivery, signal)
  // @ts-expect-error receipt requires the original evidence
  const noEvidence: ModelSavedReceipt = { key }
  // @ts-expect-error receipt requires the full original key
  const noKey: ModelSavedReceipt = { evidence }
  void [fakeTenant, noEvidence, noKey]
})
it('keeps failures finite and separate from old operation and diagnostic fields', () => {
  const failures: readonly ModelDeliveryFailure[] = [
    { kind: 'denied' },
    { kind: 'invalid', field: 'consumer', reason: 'not-original' },
    { kind: 'conflict' },
    { kind: 'backpressured', resource: 'records' },
    { kind: 'backpressured', resource: 'bytes' },
    { kind: 'backpressured', resource: 'attachments' },
    { kind: 'backpressured', resource: 'in-flight' },
    { kind: 'unavailable', dependency: 'material' },
    { kind: 'cancelled-before-accept' },
    { kind: 'outcome-unknown' },
  ]
  // @ts-expect-error no old operation on new conflict
  const legacy: ModelDeliveryFailure = { kind: 'conflict', operation: 'old' }
  const diagnostic: ModelDeliveryFailure = {
    kind: 'unavailable',
    dependency: 'material',
    // @ts-expect-error unavailable has no old diagnostic field
    diagnostic: 'old',
  }
  // @ts-expect-error capacity must identify a resource
  const incomplete: ModelDeliveryFailure = { kind: 'backpressured' }
  // @ts-expect-error receiver uses in-flight rather than fixture inFlight spelling
  const fixtureSpelling: ModelDeliveryFailure = { kind: 'backpressured', resource: 'inFlight' }
  // @ts-expect-error owner membership is not part of the pure judge
  const owner: ModelDeliveryRejection = { field: 'key.dispatch', reason: 'not-original' }
  // @ts-expect-error finite field/reason pairing
  const mixed: ModelDeliveryRejection = { field: 'tenant', reason: 'version-mismatch' }
  void [failures, legacy, diagnostic, incomplete, fixtureSpelling, owner, mixed]
})
