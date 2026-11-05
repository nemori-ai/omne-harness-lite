// How a request on an established connection reports that the transport is no longer usable
// (SPEC S7, "传输不再可用"): the lost reason and the catalog mark of each such transport answer.
// The services hand both to `table.lose`, which acts only on the current generation.
import type { ConnectionFailure, LostReason, NoAnswerCause } from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import type { UnavailableMark } from './entry.ts'

export type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

export type Lost = Readonly<{ reason: LostReason; mark: UnavailableMark }>

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
