// The closed judgments of the release-specific inputs of releaseDelivery (P08): the consumer
// position and the handoff evidence. A provider runs them before it compares or digests the
// values, so an extra field or a function field is rejected instead of reaching the record.
import type { Outcome } from '@omne-harness/kernel-basis'
import type { ConsumerRef } from './identity.ts'
import type { Handoff } from './operations.ts'
import { judgeUnknown, literal, record, variant, type Check } from './shape.ts'
import { consumerRef, durableEvidence } from './value-shapes.ts'

const handoff: Check<Handoff> = variant('kind', {
  retained: record({ kind: literal('retained'), custody: durableEvidence }),
  processed: record({ kind: literal('processed'), completion: durableEvidence }),
})

/**
 * Judges an untrusted value as a consumer position: exactly `owner`, `work`, `position` and
 * `purpose`, each a non-empty string. The result is a frozen copy.
 */
export function judgeConsumerRef(
  value: unknown,
): Outcome<ConsumerRef, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(consumerRef, value, 'ConsumerRef')
}

/**
 * Judges an untrusted value as a handoff: `retained` with a custody evidence, or `processed`
 * with a completion evidence, each evidence a closed DurableEvidence. It does not check who owns
 * the evidence; the provider compares the owner with the consumer. The result is a frozen copy.
 */
export function judgeHandoff(
  value: unknown,
): Outcome<Handoff, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(handoff, value, 'Handoff')
}
