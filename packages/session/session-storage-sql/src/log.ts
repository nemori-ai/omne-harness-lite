// The event channel interpretation commit (session-contract docs/same-log-pure.md「事件通道的解释提交」)
// on the port side. It is not a face method: the caller is the trusted interpreter, so it asks no
// access check. The participant judges the observation with the shared pure projection inside the
// write transaction, over the history index it reads there; this side encodes the facts and settles
// the storage answer through the same attempt generations as `commit`. An outcome that stayed
// unknown is recalled by retrying `commitLog` with the same operation, never by `queryOperation`.
import {
  digestSessionLog,
  type SessionFailure,
  type SessionLogCommitObservation,
  type SessionLogReceipt,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { encodeValue } from './codec.ts'
import { commitFacts } from './commit.ts'
import { SESSION_PARTICIPANT } from './participants.ts'
import { domainOf, failure, type Context } from './context.ts'

/** A recalled log receipt says so in its own member. */
const recalled = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? { ...value, recovered: true } : value

export async function commitLog<P>(
  context: Context<P>,
  input: Readonly<{ observation: SessionLogCommitObservation }>,
): Promise<Outcome<SessionLogReceipt, SessionFailure>> {
  const { observation } = input
  // An unminted tenant is refused here, before any storage call and before the digest needs it.
  const domain = await domainOf(context, observation.tenant)
  if ('failure' in domain) return domain
  let facts: FactCommandV2
  try {
    facts = {
      participant: SESSION_PARTICIPANT,
      facts: { intent: 'log', observation: encodeValue(observation) },
    }
  } catch (error) {
    return failure({
      kind: 'invalid',
      field: 'observation',
      reason: error instanceof Error ? error.message : 'not JSON data',
    })
  }
  const settled = await commitFacts(
    context,
    domain.ok,
    observation.session,
    { operation: observation.operation, digest: digestSessionLog(observation) },
    facts,
    recalled,
  )
  return settled as Outcome<SessionLogReceipt, SessionFailure>
}
