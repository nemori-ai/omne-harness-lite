// The readings of a settled answer (SPEC T2, T6, T7), once for every transport: how the
// `WireAnswer` a request settled with reads for each request, with the reader of that request.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  NOT_SENT_FAILURE,
  errorFailureOf,
  malformed,
  noAnswerFailureOf,
  type WireAnswer,
} from './decisions.ts'
import type { AnswerMalformed, PeerAnswer, TaskReport } from './outcomes.ts'
import {
  peerIdentityOf,
  readInitializeResult,
  readListingPage,
  readTaskAnswer,
  readTaskReport,
  type IdentityBound,
} from './readers.ts'
import type { ListingPage, TaskAnswer, TransportFailure } from './transport.ts'
import type { PeerIdentity } from './values.ts'

const ABANDONED_ANSWER: PeerAnswer = { kind: 'no-answer', cause: 'abandoned' }

/** A reader of the contract as a reader of the transport: its defect is the `what` of T7. */
export function readerOf<T, W extends AnswerMalformed['what']>(
  read: (result: JsonValue) => Outcome<T, W>,
): (result: JsonValue) => Outcome<T, TransportFailure> {
  return result => {
    const outcome = read(result)
    return 'ok' in outcome ? outcome : { failure: malformed(outcome.failure) }
  }
}

/** Reads the answer to a request other than `tools/call` with the reader of that request. */
export function interpretAnswer<T>(
  wire: WireAnswer,
  read: (result: JsonValue) => Outcome<T, TransportFailure>,
): Outcome<T, TransportFailure> {
  switch (wire.kind) {
    case 'result':
      return read(wire.result)
    case 'error':
      return { failure: errorFailureOf(wire) }
    case 'no-answer':
      return { failure: noAnswerFailureOf(wire) }
    case 'not-sent':
      return { failure: wire.failure }
    case 'legacy-http':
      return { failure: NOT_SENT_FAILURE }
    case 'legacy-peer':
      return { failure: malformed('discover-shape') }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

/**
 * The answer of a sent call (T8 C01–C05, S03, S04). A `no-answer` keeps the mark that the
 * transport is not usable any more (T1); so does a `not-sent` that settles a call after it left.
 */
export function callAnswerOf(wire: WireAnswer): PeerAnswer {
  switch (wire.kind) {
    case 'result':
      return { kind: 'result', result: wire.result }
    case 'error':
      return { kind: 'error', error: wire.error }
    case 'no-answer':
      return noAnswerFailureOf(wire)
    case 'not-sent': {
      const failure = wire.failure
      return failure.cause === 'authorization-required' || failure.unusable === undefined
        ? ABANDONED_ANSWER
        : { kind: 'no-answer', cause: 'abandoned', unusable: failure.unusable }
    }
    case 'legacy-peer':
    case 'legacy-http':
      return ABANDONED_ANSWER
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

/** The page of `tools/list` (T2, L01–L03); `checkHeaders` applies the `x-mcp-header` rule. */
export function listingPageOf(
  wire: WireAnswer,
  checkHeaders: boolean,
): Outcome<ListingPage, TransportFailure> {
  return interpretAnswer(
    wire,
    readerOf(result => readListingPage(result, checkHeaders)),
  )
}

/** G06: the `-32602` of a task operation that reads a task says the task expired. */
function expired(wire: WireAnswer): boolean {
  return wire.kind === 'error' && wire.errorClass === '-32602'
}

/** The report of `tasks/get` for `getTask` (T6, G01–G06). */
export function taskReportOf(wire: WireAnswer): Outcome<TaskReport | 'expired', TransportFailure> {
  return expired(wire) ? { ok: 'expired' } : interpretAnswer(wire, readerOf(readTaskReport))
}

/** The answer of `tasks/get` for `getTaskResult` (T6, G01–G06). */
export function taskAnswerOf(wire: WireAnswer): Outcome<TaskAnswer, TransportFailure> {
  return expired(wire)
    ? { ok: { kind: 'expired' } }
    : interpretAnswer(wire, readerOf(readTaskAnswer))
}

/** The peer identity the legacy path reads from the answer to `initialize` (T3, T8 I01–I07). */
export function legacyIdentityOf(
  wire: WireAnswer,
  bound: IdentityBound,
): Outcome<PeerIdentity, TransportFailure> {
  return interpretAnswer(wire, result => {
    const read = readInitializeResult(result)
    return 'failure' in read
      ? { failure: malformed('discover-shape') }
      : { ok: peerIdentityOf(read.ok, bound) }
  })
}
