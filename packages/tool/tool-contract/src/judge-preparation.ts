import { isDeepStrictEqual } from 'node:util'
import { succeed } from '@omne-harness/operation-result'
import type { DurableEvidence } from './identity.ts'
import type { PreparationRecord } from './records.ts'
import { judgeUnknown, record, reject, type Checked } from './shape.ts'
import { durableEvidence } from './value-shapes.ts'

export function judgePreparationFact(
  value: unknown,
  expected: PreparationRecord,
): Checked<Readonly<{ preparation: PreparationRecord; evidence: DurableEvidence }>> {
  return judgeUnknown(
    record({
      preparation: (actual, at) =>
        isDeepStrictEqual(actual, expected) ? succeed(expected) : reject(at, 'original-mismatch'),
      evidence: durableEvidence,
    }),
    value,
    'PreparationFact',
  )
}
