// The judgment of CP3 on a rolled-back commit that only the Session participant took part in
// (R2-D152). It is pure: CP3 calls it on the commits it saw, and cp3-rollbacks.spec.ts calls it on
// synthetic sequences, the negative controls among them.
import type { SeenCommit } from './world.ts'

/** The Session reason of a lost race for the input: the path that took the input won. */
export const INPUT_NOT_PENDING = 'the input is not pending'

/**
 * A rolled-back Session-only commit is explained in exactly two ways (R2-D152):
 *
 * - its reason is `the input is not pending`: it lost to the path that took the input;
 * - it answered `changed`, and its logical work went on: a later commitLog of the same execution
 *   and sequence committed, or the execution's saved progress (`readThrough`) reached the sequence.
 *
 * The second one is the optimistic concurrency of AD-02: the Agent can write the execution again
 * between the AD-02 read of the execution head and its commitLog. session-contract SPEC: an expired
 * same-root basis answers `changed` and the provider prepares again; session-adapters
 * tests/journal-interpretation.spec.ts, `AD-02: the execution head moves between the read and the
 * commit`, shows the two cases (the call reads the new head and commits; a head that keeps moving
 * stops the call with `changed`, and the next call commits).
 *
 * Every other reason is not explained. An `unavailable` rollback is the known limitation KL-146
 * (tests/README.md), and it stays red here.
 */
export function sessionOnlyRollbackExplained(
  commits: readonly SeenCommit[],
  position: number,
  readThroughOf: (execution: string) => string | null,
): boolean {
  const seen = commits[position]
  if (seen === undefined || seen.result.kind !== 'rolled_back') return false
  if (seen.participants.some(participant => participant !== 'session')) return false
  const { responses } = seen.result
  if (JSON.stringify(responses).includes(INPUT_NOT_PENDING)) return true
  if (!responses.every(response => failureKindOf(response.reply) === 'changed')) return false
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
