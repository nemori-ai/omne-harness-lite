// How a request reports that it did not reach the peer, or that the transport is no longer usable
// (SPEC S7, "传输不再可用", R6): the connection failure of a request that was not sent, the lost
// reason and the catalog mark of each such transport answer, and the report of the loss to the
// table. The transport's answer does not carry the "no longer usable" mark of contract T8, so
// this module judges by the cause, on the safe side: a `not-sent` of any cause and a `no-answer`
// of a broken stream or an exited process take the connection down, which can cost one
// connection more than needed, never a dead transport kept as usable (member SPEC, deviations).
// The services hand the judgment to `table.lose` through `loseOn` (discovery, which reports the
// mark) or `loseInScope` (calls and task operations, which do not wait for the teardown). Both
// act only on the current generation.
import type {
  CallOutcome,
  ConnectionFailure,
  LostReason,
  NoAnswerCause,
} from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import {
  CONNECTION_UNAVAILABLE,
  type CatalogMark,
  type Ensured,
  type EnsureFailure,
  type UnavailableMark,
} from './entry.ts'
import type { ConnectionTable } from './table.ts'

export type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

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

/** A request the transport could not send: the connection is gone, judged by the cause (S7, deviations). */
export function lostOfNotSent(failure: NotSent): Lost {
  switch (failure.cause) {
    case 'authorization-required':
      return { reason: 'authorization-required', mark: 'authorization-required' }
    case 'session-ended':
      return { reason: 'session-ended', mark: 'connection-unavailable' }
    case 'connection-unavailable':
      return { reason: 'stream-broken', mark: 'connection-unavailable' }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

/**
 * A sent request without an answer: a broken channel or an exited process is judged as the
 * transport no longer usable (S7, deviations). `abandoned` is this side's decision, not a fact
 * about the transport.
 */
export function lostOfNoAnswer(cause: NoAnswerCause): Lost | undefined {
  switch (cause) {
    case 'stream-broken':
    case 'process-exited':
      return { reason: cause, mark: 'connection-unavailable' }
    case 'abandoned':
      return undefined
    default: {
      const exhaustive: never = cause
      return exhaustive
    }
  }
}

/**
 * What the outcome of a call says about its connection (MC-16 step 12): an `unknown` outcome is
 * a sent request without an answer; every answered outcome leaves the connection as it is.
 */
export function lostOfOutcome(outcome: CallOutcome): Lost | undefined {
  switch (outcome.kind) {
    case 'unknown':
      return lostOfNoAnswer(outcome.cause)
    default:
      return undefined
  }
}
