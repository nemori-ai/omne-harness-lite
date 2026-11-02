// The entries interpretation commit (session-contract docs/same-log-pure.md「entries 通道的解释提交」)
// on the port side. It is not a face method: the caller is the trusted interpreter, so it asks no
// access check. The participant judges the range with the shared pure check inside the write
// transaction; this side encodes the facts and settles the storage answer through the same attempt
// generations as `commit`.
import {
  digestSessionEntries,
  type SessionEntriesObservation,
  type SessionEntriesReceipt,
  type SessionEntriesStart,
  type SessionFailure,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { encodeValue } from './codec.ts'
import { commitFacts } from './commit.ts'
import { SESSION_PARTICIPANT } from './participants.ts'
import { domainOf, failure, type Context } from './context.ts'

export async function commitEntries<P>(
  context: Context<P>,
  input: Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }>,
): Promise<Outcome<SessionEntriesReceipt, SessionFailure>> {
  const { observation, start } = input
  // An unminted tenant is refused here, before any storage call and before the digest needs it.
  const domain = await domainOf(context, observation.tenant)
  if ('failure' in domain) return domain
  let facts: FactCommandV2
  try {
    facts = {
      participant: SESSION_PARTICIPANT,
      facts: {
        intent: 'entries',
        observation: encodeValue(observation),
        start: encodeValue(start),
      },
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
    { operation: observation.operation, digest: digestSessionEntries(observation) },
    facts,
  )
  return settled as Outcome<SessionEntriesReceipt, SessionFailure>
}
