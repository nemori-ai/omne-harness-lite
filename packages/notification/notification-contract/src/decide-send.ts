import {
  findEventType,
  subjectAccepted,
  type EventTypeDeclaration,
  type SourceLookup,
} from './declarations.ts'
import { sameRecipient, type EventFacts, type RecipientRef, type SendRequest } from './values.ts'

export type SendLimits = Readonly<{ bodyLength: number; causalDepth: number }>
export type AuthorityAnswer = 'allowed' | 'denied' | 'unavailable'

/** Whether a named recipient may be a recipient in this tenant, as the authority answered. */
export type NamedCheck = Readonly<{ recipient: RecipientRef; admissible: AuthorityAnswer }>

/** The event of a send that was accepted under this identity. */
export type SendFacts = Readonly<{ event: EventFacts }>

export type SendRefusal =
  | 'too-large'
  | 'not-permitted'
  | 'conflict'
  | 'unknown-event-type'
  | 'standing-type'
  | 'invalid-subject'
  | 'naming-not-allowed'
  | 'recipient-not-admissible'
  | 'causal-depth-exceeded'

export type SendPrecheck =
  | Readonly<{ kind: 'proceed' }>
  | Readonly<{ kind: 'refused'; reason: SendRefusal }>
  | Readonly<{ kind: 'basis-unavailable' }>

export type SendDecision =
  | Readonly<{ kind: 'proceed'; declared: EventTypeDeclaration }>
  | Readonly<{ kind: 'recalled' }>
  | Readonly<{ kind: 'refused'; reason: SendRefusal }>
  | Readonly<{ kind: 'basis-unavailable' }>

/** Steps one and two: the request fits, and the subject may send as this source. */
export function precheckSend(
  request: SendRequest,
  authority: AuthorityAnswer,
  limits: SendLimits,
): SendPrecheck {
  if (request.event.content.body.length > limits.bodyLength)
    return { kind: 'refused', reason: 'too-large' }
  if (authority === 'denied') return { kind: 'refused', reason: 'not-permitted' }
  if (authority === 'unavailable') return { kind: 'basis-unavailable' }
  return { kind: 'proceed' }
}

function sameRecipients(a: readonly RecipientRef[], b: readonly RecipientRef[]): boolean {
  return a.length === b.length && a.every((entry, index) => sameRecipient(entry, b[index]!))
}

/** Two sends under one identity are the same send when these five parts agree. */
export function sameSend(a: EventFacts, b: EventFacts): boolean {
  return (
    a.type === b.type &&
    a.subject === b.subject &&
    a.content.title === b.content.title &&
    a.content.body === b.content.body &&
    a.content.locator?.kind === b.content.locator?.kind &&
    a.content.locator?.ref === b.content.locator?.ref &&
    sameRecipients(a.named, b.named) &&
    a.replaceKey === b.replaceKey
  )
}

/**
 * Steps three to six. Recall comes before the source lookup: a send that was accepted
 * is still recalled after its source is gone.
 */
export function decideSend(
  known: SendFacts | null,
  request: SendRequest,
  source: SourceLookup,
  named: readonly NamedCheck[],
  limits: SendLimits,
): SendDecision {
  const { event } = request
  if (known !== null)
    return sameSend(known.event, event)
      ? { kind: 'recalled' }
      : { kind: 'refused', reason: 'conflict' }
  if (source.kind !== 'registered') return { kind: 'basis-unavailable' }
  const declared = findEventType(source.declaration, event.type)
  if (declared === null) return { kind: 'refused', reason: 'unknown-event-type' }
  if (declared.kind.kind === 'standing') return { kind: 'refused', reason: 'standing-type' }
  if (!subjectAccepted(declared.subject, event.subject))
    return { kind: 'refused', reason: 'invalid-subject' }
  for (const recipient of event.named) {
    if (!declared.nameable.includes(recipient.kind))
      return { kind: 'refused', reason: 'naming-not-allowed' }
    const check = named.find(entry => sameRecipient(entry.recipient, recipient))
    if (check === undefined || check.admissible === 'denied')
      return { kind: 'refused', reason: 'recipient-not-admissible' }
    if (check.admissible === 'unavailable') return { kind: 'basis-unavailable' }
  }
  if (event.origin !== null && event.origin.depth > limits.causalDepth)
    return { kind: 'refused', reason: 'causal-depth-exceeded' }
  return { kind: 'proceed', declared }
}
