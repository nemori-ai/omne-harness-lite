import type { DurableEvidence } from './identity.ts'
import type { CommittedBatch } from './judgments.ts'
import { digestOf } from './operations.ts'

export function batchEvidence(batch: CommittedBatch, session: string): DurableEvidence {
  return {
    owner: '@omne-harness/session-contract',
    record: `${session}@${batch.revision}`,
    revision: batch.revision,
    digest: `sha256:${digestOf(batch.entries)}`,
  }
}
