import type {
  InboxRefusal,
  Outcome as DomainOutcome,
  ParseRefusal,
  SendRefusal,
  SubscriptionRefusal,
} from '@omne-harness/notification-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AuthorSegment, ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { NotificationsCommandName } from './protocol.ts'

export type Segment = Outcome<AuthorSegment<Uint8Array, string>, ToolPrimitiveFailure>

export type Refusal = ParseRefusal | SendRefusal | InboxRefusal | SubscriptionRefusal
type Kind = 'invalid' | 'unsupported' | 'too-large' | 'conflict'

/** Every refusal of the domain is a failed result that names the reason and what to do about it. */
const REFUSALS: Readonly<Record<Refusal, readonly [Kind, string]>> = {
  'invalid-request': ['invalid', 'the notification services refuse a value of this command'],
  'invalid-source-name': ['invalid', 'the source name is not one; see sources'],
  'incomplete-identity': ['invalid', 'the source or the event is missing'],
  'invalid-scope': ['invalid', 'the scope is not one'],
  'invalid-term': ['invalid', 'the term is not one; an until instant is UTC with milliseconds'],
  'content-too-large': ['too-large', 'the title or the body is over the hard limit'],
  'too-large': ['too-large', 'the body is over the limit; shorten it or give a locator'],
  'not-permitted': ['unsupported', 'this call may not do that'],
  conflict: ['conflict', 'this id was used for a post with other content; use a new id'],
  'unknown-event-type': ['invalid', 'the source is not registered now or has no such event type'],
  'standing-type': ['invalid', 'a standing item is published by its source and cannot be sent'],
  'invalid-subject': ['invalid', 'the subject does not fit this event type'],
  'naming-not-allowed': ['unsupported', 'this event type does not take named recipients'],
  'recipient-not-admissible': ['invalid', 'a named recipient is not one of this tenant'],
  'causal-depth-exceeded': [
    'unsupported',
    'this turn was woken by a chain of notifications that is at its limit; a post from it is not accepted',
  ],
  'not-found': ['invalid', 'no such notification in your inbox'],
  'restore-first': ['conflict', 'the notification is already done or dismissed; restore it first'],
  superseded: ['conflict', 'a newer notification replaced this one; read the newer one'],
  'term-in-past': ['invalid', 'the until instant is in the past'],
  'not-subscribable': ['unsupported', 'agents cannot subscribe to this event type'],
  'scope-does-not-fit': ['invalid', 'the scope does not fit the subject this event type takes'],
  'not-own-recipient': ['unsupported', 'you can only change your own subscriptions'],
  'confirmation-mismatch': [
    'conflict',
    'the request is not the one the owner confirmed; nothing was changed',
  ],
}

export const completed = (command: NotificationsCommandName, value: unknown): Segment =>
  succeed({ kind: 'completed', value: `done Notifications ${command}\n${JSON.stringify(value)}` })

export function refused(reason: Refusal): Segment {
  const [kind, hint] = REFUSALS[reason]
  return fail({ kind, reason: `${reason}: ${hint}` })
}

export const tooLarge = (reason: string): Segment => fail({ kind: 'too-large', reason })

const operationOf = (command: NotificationsCommandName) => `Notifications.${command}`

export const unavailable = (command: NotificationsCommandName, why: string): Segment =>
  fail({ kind: 'unavailable', operation: operationOf(command), reason: why })

const NOT_KNOWN =
  'it is not known whether this took effect; send the same command again: what took effect is recalled, not done twice'

export const unknown = (command: NotificationsCommandName): Segment =>
  fail({ kind: 'unknown', operation: operationOf(command), reason: NOT_KNOWN })

const NOW_UNAVAILABLE = 'the notification services cannot answer now; nothing was changed'

/** Runs one domain call. A read that throws has no basis; a write that throws has an unknown result. */
export async function settle<T, R extends Refusal>(
  command: NotificationsCommandName,
  effect: 'read' | 'write',
  call: () => Promise<DomainOutcome<T, R>>,
  done: (value: T, recalled: boolean) => unknown,
): Promise<Segment> {
  let outcome: DomainOutcome<T, R>
  try {
    outcome = await call()
  } catch {
    return effect === 'write' ? unknown(command) : unavailable(command, NOW_UNAVAILABLE)
  }
  switch (outcome.kind) {
    case 'done':
      return completed(command, done(outcome.value, outcome.recalled))
    case 'refused':
      return refused(outcome.reason)
    case 'basis-unavailable':
      return unavailable(command, NOW_UNAVAILABLE)
    case 'unknown':
      return unknown(command)
  }
}
