import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  SESSION_COMMIT_BASIS,
  SessionCommitBasisSchema,
  ordinarySessionFacts,
  permissionAssignmentFacts,
  sessionCommitDigest,
  type SessionCommitBasis,
} from '../commit-basis.ts'

export function readSessionBasis(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
): SessionCommitBasis | null {
  const parsed = SessionCommitBasisSchema.safeParse(port.requireFact(SESSION_COMMIT_BASIS))
  if (
    !parsed.success ||
    parsed.data.commandsDigest !== sessionCommitDigest([{ participant: 'session', facts }])
  )
    return null
  const basis = parsed.data
  const accepted =
    basis.kind === 'ordinary' ? ordinarySessionFacts(facts) : permissionAssignmentFacts(facts)
  return accepted ? basis : null
}
