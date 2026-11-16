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

export function readerOf<T, W extends AnswerMalformed['what']>(
  read: (result: JsonValue) => Outcome<T, W>,
): (result: JsonValue) => Outcome<T, TransportFailure> {
  return result => {
    const outcome = read(result)
    return 'ok' in outcome ? outcome : { failure: malformed(outcome.failure) }
  }
}

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

export function listingPageOf(
  wire: WireAnswer,
  checkHeaders: boolean,
): Outcome<ListingPage, TransportFailure> {
  return interpretAnswer(
    wire,
    readerOf(result => readListingPage(result, checkHeaders)),
  )
}

function expired(wire: WireAnswer): boolean {
  return wire.kind === 'error' && wire.errorClass === '-32602'
}

export function taskReportOf(wire: WireAnswer): Outcome<TaskReport | 'expired', TransportFailure> {
  return expired(wire) ? { ok: 'expired' } : interpretAnswer(wire, readerOf(readTaskReport))
}

export function taskAnswerOf(wire: WireAnswer): Outcome<TaskAnswer, TransportFailure> {
  return expired(wire)
    ? { ok: { kind: 'expired' } }
    : interpretAnswer(wire, readerOf(readTaskAnswer))
}

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
