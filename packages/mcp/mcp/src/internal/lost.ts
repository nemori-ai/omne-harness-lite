// How a request on an established connection reports that the transport is no longer usable
// (SPEC S7, "传输不再可用"): the lost reason and the catalog mark of each such transport answer.
// The transport's answer does not carry the "no longer usable" mark of contract T8, so this
// module judges by the cause, on the safe side: a `not-sent` of any cause and a `no-answer` of
// a broken stream or an exited process take the connection down, which can cost one connection
// more than needed, never a dead transport kept as usable (member SPEC, deviations). The services
// hand the judgment to `table.lose` through `loseOn` (discovery, which reports the mark) or
// `loseInScope` (calls and task operations, which do not wait for the teardown). Both act only
// on the current generation.
import type { ConnectionFailure, LostReason, NoAnswerCause } from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import type { CatalogMark, Ensured, UnavailableMark } from './entry.ts'
import type { ConnectionTable } from './table.ts'

export type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

export type Lost = Readonly<{ reason: LostReason; mark: UnavailableMark }>

/**
 * The one report of a lost connection: `ensured` is gone, as `lost` says (S7). The promise ends
 * when the teardown and the catalog mark end; only a caller whose answer reports the mark waits
 * for it (discovery).
 */
export function loseOn(
  table: Pick<ConnectionTable<unknown>, 'lose'>,
  ensured: Ensured,
  lost: Lost,
): Promise<CatalogMark | 'not-current'> {
  return table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
}

/**
 * The report of a lost connection by a request that answers from the transport's answer alone
 * (calls and task operations). The connection refuses requests before this returns: `markLost`
 * does that before its first wait. The teardown and the catalog mark go on in the table's scope,
 * so a teardown port that does not answer does not hold the request's answer (P14).
 */
export function loseInScope(
  table: Pick<ConnectionTable<unknown>, 'lose' | 'runtime'>,
  ensured: Ensured,
  lost: Lost,
): void {
  table.runtime.scope.spawn(loseOn(table, ensured, lost))
}

const CONNECTION_UNAVAILABLE: ConnectionFailure = { kind: 'connection-unavailable' }

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

/** A request the transport could not send: the connection is gone (S7). */
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
 * A sent request without an answer: the channel broke or the process exited, so the transport is
 * no longer usable (S7). `abandoned` is this side's decision, not a fact about the transport.
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
