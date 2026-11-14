import type { Outcome } from '@omne-harness/operation-result'
import type { ConsumerRef } from './identity.ts'
import type { Handoff } from './operations.ts'
import { judgeUnknown, literal, record, variant, type Check } from './shape.ts'
import { consumerRef, durableEvidence } from './value-shapes.ts'

const handoff: Check<Handoff> = variant('kind', {
  retained: record({ kind: literal('retained'), custody: durableEvidence }),
  processed: record({ kind: literal('processed'), completion: durableEvidence }),
})

export function judgeConsumerRef(
  value: unknown,
): Outcome<ConsumerRef, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(consumerRef, value, 'ConsumerRef')
}

export function judgeHandoff(
  value: unknown,
): Outcome<Handoff, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(handoff, value, 'Handoff')
}
