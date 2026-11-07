// How a request reports that it did not reach the peer, or that the transport is no longer usable
// (SPEC S7, "传输不再可用", R6): the connection failure of a request that was not sent, what one
// answer of the transport means for its ready connection (`lostOf`), and the report of the loss
// to the table. The transport marks an answer it hands over once it is not usable any more
// (contract T1, `unusable`); `lostOf` reads that mark and the refused authorization, never the
// cause of a failure. The services hand the loss to `table.lose` through `loseOn` (discovery,
// which reports the mark) or `loseIfLost` (calls and task operations: `lostOf`, then `loseInScope`,
// which does not wait for the teardown). Both act only on the current generation.
import type {
  ConnectionFailure,
  LostReason,
  PeerAnswer,
  UnusableCause,
} from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import {
  CONNECTION_UNAVAILABLE,
  type CatalogMark,
  type Ensured,
  type EnsureFailure,
  type NotSent,
  type UnavailableMark,
} from './entry.ts'
import type { ConnectionTable } from './table.ts'

export type { NotSent } from './entry.ts'

export type Lost = Readonly<{ reason: LostReason; mark: UnavailableMark }>

/**
 * The one report of a lost connection: `ensured` is gone, as `lost` says (S7). The connection
 * refuses requests before this returns; the promise ends when the teardown and the catalog mark
 * end. Only a caller whose answer reports the mark waits for it (discovery).
 */
export function loseOn(
  table: Pick<ConnectionTable<unknown>, 'lose'>,
  ensured: Ensured,
  lost: Lost,
): Promise<CatalogMark | 'not-current'> {
  const losing = table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  return losing === 'not-current' ? Promise.resolve(losing) : losing.done
}

/**
 * The report of a lost connection by a request that answers from the transport's answer alone
 * (calls and task operations). The connection refuses requests before this returns: `table.lose`
 * does that synchronously. The teardown and the catalog mark go on in the table's scope, so a
 * teardown port that does not answer does not hold the request's answer (P14).
 */
export function loseInScope(
  table: Pick<ConnectionTable<unknown>, 'lose' | 'runtime'>,
  ensured: Ensured,
  lost: Lost,
): void {
  const losing = table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  if (losing !== 'not-current') table.runtime.scope.spawn(losing.done)
}

/**
 * What a request on a ready connection does with one answer of the transport (S7; member SPEC
 * MC-16 steps 9 and 12, MC-17 step 4): when `lostOf` says the connection is lost, the loss goes to
 * the table, its teardown in the table's scope (`loseInScope`); any other answer leaves the
 * connection as it is.
 */
export function loseIfLost(
  table: Pick<ConnectionTable<unknown>, 'lose' | 'runtime'>,
  ensured: Ensured,
  answer: TransportFailure | PeerAnswer,
): void {
  const lost = lostOf(answer)
  if (lost !== undefined) loseInScope(table, ensured, lost)
}

/**
 * The connection failure a request that was not sent is reported as (R6): the authorization
 * discovery as the transport found it; an ended legacy session or an unusable transport is
 * `connection-unavailable`.
 */
export function connectionFailureOf(failure: NotSent): ConnectionFailure {
  return failure.cause === 'authorization-required'
    ? { kind: 'authorization-required', discovery: failure.discovery }
    : CONNECTION_UNAVAILABLE
}

/**
 * The connection failure of a request whose build gave no connection (SPEC MC-16 table, MC-17
 * step 3): the failure as the build reported it, except that `discover` without an answer is
 * `connection-unavailable`: an unknown effect of `discover` is not an unknown effect of the
 * request, which never left.
 */
export function connectionFailureOfBuild(
  failure: Extract<EnsureFailure, { stage: 'connect' }>,
): ConnectionFailure {
  return failure.reason.kind === 'effect-unknown' ? CONNECTION_UNAVAILABLE : failure.reason
}

const AUTHORIZATION_REQUIRED: Lost = {
  reason: 'authorization-required',
  mark: 'authorization-required',
}

/**
 * What one answer of the transport says about the transport and the connection (S5, S7; member
 * SPEC MC-5, MC-16, MC-17, MC-7), the first rule that holds:
 * 1. the answer carries `unusable`: the transport is not usable any more; the connection is lost
 *    for that cause, the catalog is marked `connection-unavailable`;
 * 2. the answer is `not-sent` (`authorization-required`): the connection is lost for it, the
 *    catalog is marked `authorization-required`;
 * 3. otherwise the connection stays as it is: one request failed and the transport is still
 *    usable, or the peer answered.
 * The two rules do not overlap: the contract gives a refused authorization no mark. Undefined is
 * rule 3. On a ready connection it decides whether the connection is lost. When a build fails, it
 * gives the reason when the transport is not usable any more or the authorization was refused;
 * the build rule of MC-5 gives every other reason.
 */
export function lostOf(answer: TransportFailure | PeerAnswer): Lost | undefined {
  switch (answer.kind) {
    case 'not-sent':
      if (answer.cause === 'authorization-required') return AUTHORIZATION_REQUIRED
      return unusableOf(answer.unusable)
    case 'no-answer':
      return unusableOf(answer.unusable)
    case 'error-answer':
    case 'answer-malformed':
    case 'result':
    case 'error':
      return undefined
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

function unusableOf(unusable: UnusableCause | undefined): Lost | undefined {
  return unusable === undefined ? undefined : { reason: unusable, mark: 'connection-unavailable' }
}
