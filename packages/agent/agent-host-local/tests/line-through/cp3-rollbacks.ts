// The judgment of CP3 on a rolled-back commit that only the Session participant took part in
// (R2-D152). It is pure: CP3 calls it on the commits it saw, and cp3-rollbacks.spec.ts calls it on
// synthetic sequences, the negative controls among them.
import type { SeenCommit } from './world.ts'

/** The Session reason of a lost race for the input: the path that took the input won. */
export const INPUT_NOT_PENDING = 'the input is not pending'

/**
 * The participant that publishes the ordinary commit basis of the Session command in the same
 * transaction (session-storage-sql docs/commit-basis.md). It owns no table and does not judge the
 * facts, so in a rollback it has answered `participated` and the Session reply carries the reason.
 */
export const SESSION_ORDINARY_BASIS = 'session-ordinary-basis'

/**
 * A Session-only commit has the Session participant and, at most, the ordinary basis beside it.
 * A rolled-back Session-only commit is explained in exactly two ways (R2-D152):
 *
 * - its reason is `the input is not pending`: it lost to the path that took the input;
 * - it answered a transient failure (`changed` or `unavailable`), and its logical work went on: a
 *   later commitLog of the same execution and sequence committed, or the execution's saved progress
 *   (`readThrough`) reached the sequence.
 *
 * The second one is the optimistic concurrency of AD-02: the Agent can write the execution again
 * between the AD-02 read of the execution head and its commitLog. session-contract SPEC: an expired
 * same-root basis answers `changed` and the provider prepares again. AD-02 makes the call again
 * after a backoff when it ends in either kind, until it commits (#1216 E1a, the AD-02 part of KL-146);
 * session-adapters tests/journal-interpretation.spec.ts shows the cases. A transient rollback whose
 * work did not go on stays red, and every other reason is not explained.
 */
export function sessionOnlyRollbackExplained(
  commits: readonly SeenCommit[],
  position: number,
  readThroughOf: (execution: string) => string | null,
): boolean {
  const seen = commits[position]
  if (seen === undefined || seen.result.kind !== 'rolled_back') return false
  if (
    seen.participants.some(
      participant => participant !== 'session' && participant !== SESSION_ORDINARY_BASIS,
    )
  )
    return false
  const { responses } = seen.result
  const basis = responses.filter(response => response.participant === SESSION_ORDINARY_BASIS)
  if (!basis.every(response => response.reply.kind === 'participated')) return false
  const session = responses.filter(response => response.participant !== SESSION_ORDINARY_BASIS)
  if (session.length === 0) return false
  if (JSON.stringify(session).includes(INPUT_NOT_PENDING)) return true
  if (!session.every(response => TRANSIENT.has(failureKindOf(response.reply) ?? ''))) return false
  const log = seen.log
  if (log === null || log.sequence === null) return false
  const { execution, sequence } = log
  const committedAgain = commits
    .slice(position + 1)
    .some(
      later =>
        later.result.kind === 'committed' &&
        later.log?.execution === execution &&
        later.log.sequence === sequence,
    )
  if (committedAgain) return true
  const readThrough = readThroughOf(execution)
  return readThrough !== null && BigInt(readThrough) >= BigInt(sequence)
}

/** The Session failures after which AD-02 makes the same call again (#1216 E1a). */
const TRANSIENT = new Set(['changed', 'unavailable'])

/** The kind of the Session failure a conflict reply carries in its basis; null for any other reply. */
function failureKindOf(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) return null
  const { kind, basis } = reply as { kind?: unknown; basis?: unknown }
  if (kind !== 'conflict' || typeof basis !== 'object' || basis === null) return null
  const failure = (basis as { failure?: unknown }).failure
  if (typeof failure !== 'object' || failure === null) return null
  const failureKind = (failure as { kind?: unknown }).kind
  return typeof failureKind === 'string' ? failureKind : null
}
