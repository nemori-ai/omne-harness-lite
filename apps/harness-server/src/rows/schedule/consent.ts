import type { CallConsent, ConsentBasis } from '../tool-bindings/call-consent.ts'

/** Who acts: the tenant's person, an agent in one of its sessions, or neither. */
export type ConsentActor = 'owner' | 'agent' | 'other'
/** What the act is about: a new schedule, one this agent created, or someone else's. */
export type ConsentSubject = 'new' | 'agentOwn' | 'others'
/** What the act does: read, change a draft only, or bring a schedule into effect or change one in effect. */
export type ConsentCommand = 'read' | 'draftLocal' | 'consent'
export type ConsentInput = Readonly<{
  actor: ConsentActor
  subject: ConsentSubject
  command: ConsentCommand
  consent: CallConsent
}>
export type ConsentDecision =
  | Readonly<{ kind: 'allow'; basis: ConsentBasis | null }>
  | Readonly<{ kind: 'refused' | 'forbidden' | 'unavailable' }>

const NOT_REQUIRED: ConsentDecision = { kind: 'allow', basis: null }

/** The owner's own act needs no consent; an agent's change in effect takes the consent its call was
 * released on, and none is a refusal. */
export function decideScheduleConsent(input: ConsentInput): ConsentDecision {
  const { actor, subject, command, consent } = input
  if (actor === 'other') return { kind: 'forbidden' }
  if (actor === 'owner' || command === 'read') return NOT_REQUIRED
  if (subject === 'others') return { kind: 'forbidden' }
  if (command === 'draftLocal') return NOT_REQUIRED
  switch (consent.kind) {
    case 'consented':
      return { kind: 'allow', basis: consent.basis }
    case 'none':
      return { kind: 'refused' }
    case 'unavailable':
      return { kind: 'unavailable' }
  }
}

/** Whether the decision reads the call's consent at all: only an agent's change in effect does. */
export function needsConsent(input: Pick<ConsentInput, 'actor' | 'subject' | 'command'>): boolean {
  return input.actor === 'agent' && input.command === 'consent' && input.subject !== 'others'
}
