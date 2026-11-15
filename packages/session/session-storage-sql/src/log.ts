import {
  digestSessionLog,
  type SessionFailure,
  type SessionLogCommitObservation,
  type SessionLogReceipt,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import { encodeValue } from './codec.ts'
import { commitFacts, withCommitTime } from './commit.ts'
import { SESSION_PARTICIPANT } from './participants.ts'
import { domainOf, failure, type Context } from './context.ts'

const recalled = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? { ...value, recovered: true } : value

export async function commitLog<P>(
  context: Context<P>,
  input: Readonly<{ observation: SessionLogCommitObservation }>,
): Promise<Outcome<SessionLogReceipt, SessionFailure>> {
  const { observation } = input
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
    await withCommitTime(context, facts),
    recalled,
  )
  return settled as Outcome<SessionLogReceipt, SessionFailure>
}
