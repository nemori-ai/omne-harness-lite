import {
  digestSessionEntries,
  type SessionEntriesObservation,
  type SessionEntriesReceipt,
  type SessionEntriesStart,
  type SessionFailure,
  prepareEntriesTerms,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { encodeValue } from './codec.ts'
import { commitFacts, withCommitTime } from './commit.ts'
import { SESSION_PARTICIPANT } from './participants.ts'
import { domainOf, failure, type Context } from './context.ts'

export async function commitEntries<P>(
  context: Context<P>,
  input: Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }>,
): Promise<Outcome<SessionEntriesReceipt, SessionFailure>> {
  const { observation, start } = input
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
        derived: encodeValue(prepareEntriesTerms(context.options.derived ?? null)),
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
    observation.session,
    { operation: observation.operation, digest: digestSessionEntries(observation) },
    await withCommitTime(context, facts),
  )
  return settled as Outcome<SessionEntriesReceipt, SessionFailure>
}
