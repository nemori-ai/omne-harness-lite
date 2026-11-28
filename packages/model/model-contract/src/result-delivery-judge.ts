import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { LiveFrame } from './live-call.ts'
import { resolveModelInvocationRef } from './reference.ts'
import type { ModelDelivery } from './result-delivery-values.ts'
import type { ModelCallId } from './root.ts'

export type ModelDeliveryRejection =
  | Readonly<{ field: 'tenant'; reason: 'identity' }>
  | Readonly<{ field: 'key.reference'; reason: 'reference-malformed' }>
  | Readonly<{ field: 'key.result'; reason: 'version-mismatch' }>
  | Readonly<{ field: 'key.revision'; reason: 'revision-mismatch' }>
  | Readonly<{ field: 'account.subject'; reason: 'call-mismatch' }>
  | Readonly<{ field: 'accounts'; reason: 'duplicate-dispatch' | 'call-mismatch' }>
  | Readonly<{ field: 'frames'; reason: 'range-mismatch' }>

export function judgeModelDelivery(
  input: Readonly<{
    tenant: TenantId
    delivery: ModelDelivery
  }>,
): Outcome<ModelDelivery, ModelDeliveryRejection> {
  const { delivery } = input
  const reference = resolveModelInvocationRef(delivery.key.reference, input.tenant)
  if ('failure' in reference)
    return reference.failure.kind === 'malformed'
      ? fail({ field: 'key.reference', reason: 'reference-malformed' })
      : fail({ field: 'tenant', reason: 'identity' })
  switch (delivery.kind) {
    case 'account':
      return judgeAccount(delivery, reference.ok.call)
    case 'result':
      return judgeResult(delivery, reference.ok.call)
    case 'live':
      return judgeLive(delivery)
    default: {
      const _exhaustive: never = delivery
      return _exhaustive
    }
  }
}

/** The number after the last one the frames cover from `from`, each number once and in order; null when they do not. */
function coveredUntil(frames: readonly LiveFrame[], from: number): number | null {
  let next = from
  for (const frame of frames) {
    const [first, last] = 'gap' in frame ? [frame.gap.from, frame.gap.to] : [frame.seq, frame.seq]
    if (first !== next || !Number.isSafeInteger(last) || last < first) return null
    next = last + 1
  }
  return next
}

/** The frames of a live delivery cover its key exactly, from a first number of one or more. */
function judgeLive(
  delivery: Extract<ModelDelivery, { kind: 'live' }>,
): Outcome<ModelDelivery, ModelDeliveryRejection> {
  const { from, to } = delivery.key
  const valid = Number.isSafeInteger(from) && from >= 1 && to >= from
  return valid && coveredUntil(delivery.frames, from) === to + 1
    ? succeed(delivery)
    : fail({ field: 'frames', reason: 'range-mismatch' })
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
