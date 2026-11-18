import {
  findEventType,
  subjectAccepted,
  type EventTypeDeclaration,
  type SourceLookup,
} from './declarations.ts'
import {
  recipientKey,
  sameRecipient,
  type EventFacts,
  type RecipientRef,
  type SendRequest,
} from './values.ts'

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

/** The parts of an event that make two sends under one identity the same send. */
function sendFingerprint(event: EventFacts): string {
  const { type, subject, content, named, replaceKey } = event
  return JSON.stringify([
    type,
    subject,
    content.title,
    content.body,
    content.locator === null ? null : [content.locator.kind, content.locator.ref],
    named.map(recipientKey),
    replaceKey,
  ])
}

/** Two sends under one identity are the same send when these five parts agree. */
export function sameSend(a: EventFacts, b: EventFacts): boolean {
  return sendFingerprint(a) === sendFingerprint(b)
}

type Refusal = Readonly<{ kind: 'refused'; reason: SendRefusal }>
type Unavailable = Readonly<{ kind: 'basis-unavailable' }>
const refuse = (reason: SendRefusal): Refusal => ({ kind: 'refused', reason })

/** Step four: the type is declared, happens once, and the subject fits its notation. */
function checkDeclared(
  source: SourceLookup,
  event: EventFacts,
): Readonly<{ kind: 'declared'; declared: EventTypeDeclaration }> | Refusal | Unavailable {
  if (source.kind !== 'registered') return { kind: 'basis-unavailable' }
  const declared = findEventType(source.declaration, event.type)
  if (declared === null) return refuse('unknown-event-type')
  if (declared.kind.kind === 'standing') return refuse('standing-type')
  if (!subjectAccepted(declared.subject, event.subject)) return refuse('invalid-subject')
  return { kind: 'declared', declared }
}

/** Step five: every named recipient is of an allowed kind and admissible in this tenant. */
function checkNamed(
  event: EventFacts,
  declared: EventTypeDeclaration,
  named: readonly NamedCheck[],
): Refusal | Unavailable | null {
  for (const recipient of event.named) {
    if (!declared.nameable.includes(recipient.kind)) return refuse('naming-not-allowed')
    const check = named.find(entry => sameRecipient(entry.recipient, recipient))
    if (check === undefined || check.admissible === 'denied')
      return refuse('recipient-not-admissible')
    if (check.admissible === 'unavailable') return { kind: 'basis-unavailable' }
  }
  return null
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
    return sameSend(known.event, event) ? { kind: 'recalled' } : refuse('conflict')
  const type = checkDeclared(source, event)
  if (type.kind !== 'declared') return type
  const naming = checkNamed(event, type.declared, named)
  if (naming !== null) return naming
  if (event.origin !== null && event.origin.depth > limits.causalDepth)
    return refuse('causal-depth-exceeded')
  return { kind: 'proceed', declared: type.declared }
}
