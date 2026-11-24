import type { SessionRef } from './values.ts'

export type MessageRefusal = 'not-permitted' | 'to-self' | 'no-such-session' | 'archived'

/** `receiver` is null both when the session does not exist and when it is of another tenant: one answer. */
export type MessageFacts = Readonly<{
  permitted: boolean
  sender: SessionRef
  to: SessionRef
  receiver: Readonly<{ archived: boolean }> | null
}>

export type MessageDecision =
  | Readonly<{ kind: 'send' }>
  | Readonly<{ kind: 'refuse'; reason: MessageRefusal }>

const refuse = (reason: MessageRefusal): MessageDecision => ({ kind: 'refuse', reason })

/** No dispatch relation is needed: any two sessions of one tenant may talk while the receiver is open. */
export function decideMessage(facts: MessageFacts): MessageDecision {
  if (!facts.permitted) return refuse('not-permitted')
  if (facts.to === facts.sender) return refuse('to-self')
  if (facts.receiver === null) return refuse('no-such-session')
  return facts.receiver.archived ? refuse('archived') : { kind: 'send' }
}
