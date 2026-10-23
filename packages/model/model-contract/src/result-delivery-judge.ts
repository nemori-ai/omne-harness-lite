import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { resolveModelInvocationRef } from './reference.ts'
import type { ModelDelivery } from './result-delivery-values.ts'
import type { ModelCallId } from './root.ts'

export type ModelDeliveryRejection =
  | Readonly<{ field: 'tenant'; reason: 'identity' }>
  | Readonly<{ field: 'key.reference'; reason: 'reference-malformed' | 'foreign-tenant' }>
  | Readonly<{ field: 'key.result'; reason: 'version-mismatch' }>
  | Readonly<{ field: 'key.revision'; reason: 'revision-mismatch' }>
  | Readonly<{ field: 'account.subject'; reason: 'call-mismatch' }>
  | Readonly<{ field: 'accounts'; reason: 'duplicate-dispatch' | 'call-mismatch' }>

export function judgeModelDelivery(
  input: Readonly<{
    tenant: TenantId
    delivery: ModelDelivery
  }>,
): Outcome<ModelDelivery, ModelDeliveryRejection> {
  const { delivery } = input
  const reference = resolveModelInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in reference) {
    switch (reference.failure.kind) {
      case 'invalid-tenant':
        return fail({ field: 'tenant', reason: 'identity' })
      case 'malformed':
        return fail({ field: 'key.reference', reason: 'reference-malformed' })
      case 'foreign-tenant':
        return fail({ field: 'key.reference', reason: 'foreign-tenant' })
    }
  }
  return delivery.kind === 'account'
    ? judgeAccount(delivery, reference.ok.call)
    : judgeResult(delivery, reference.ok.call)
}

function judgeAccount(
  delivery: Extract<ModelDelivery, { kind: 'account' }>,
  call: ModelCallId,
): Outcome<ModelDelivery, ModelDeliveryRejection> {
  if (delivery.key.revision !== delivery.account.revision)
    return fail({ field: 'key.revision', reason: 'revision-mismatch' })
  const subject = delivery.account.subject
  if (subject.kind !== 'model_call' || subject.id !== call)
    return fail({ field: 'account.subject', reason: 'call-mismatch' })
  return succeed(delivery)
}

function judgeResult(
  delivery: Extract<ModelDelivery, { kind: 'result' }>,
  call: ModelCallId,
): Outcome<ModelDelivery, ModelDeliveryRejection> {
  if (delivery.key.result !== delivery.settlement.version)
    return fail({ field: 'key.result', reason: 'version-mismatch' })
  const dispatches = new Set(delivery.accounts.map(item => item.dispatch))
  if (dispatches.size !== delivery.accounts.length)
    return fail({ field: 'accounts', reason: 'duplicate-dispatch' })
  for (const { account } of delivery.accounts) {
    if (account !== null && (account.subject.kind !== 'model_call' || account.subject.id !== call))
      return fail({ field: 'accounts', reason: 'call-mismatch' })
  }
  return succeed(delivery)
}
