/** Who acts: the tenant's person, an agent in one of its sessions, or neither. */
export type ConsentActor = 'owner' | 'agent' | 'other'
/** What the act is about: a new schedule, one this agent created, or someone else's. */
export type ConsentSubject = 'new' | 'agentOwn' | 'others'
/** What the act does: read, change a draft only, or bring a schedule into effect or change one in effect. */
export type ConsentCommand = 'read' | 'draftLocal' | 'consent'
export type ConsentMode =
  | Readonly<{ kind: 'auto'; generation: number }>
  | Readonly<{ kind: 'draft' }>
  | Readonly<{ kind: 'unreadable' }>
/** The owner's answer the act names, as human intervention keeps it. */
export type ConsentConfirmation =
  | Readonly<{ kind: 'none' | 'mismatch' | 'foreign' | 'unreadable' }>
  | Readonly<{ kind: 'valid'; decision: string }>
export type ConsentInput = Readonly<{
  actor: ConsentActor
  subject: ConsentSubject
  command: ConsentCommand
  mode: ConsentMode
  confirmation: ConsentConfirmation
}>
export type ConsentBasis =
  | Readonly<{ kind: 'notRequired' }>
  | Readonly<{ kind: 'blanket'; generation: number }>
  | Readonly<{ kind: 'granular'; decision: string }>
export type ConsentDecision =
  | Readonly<{ kind: 'allow'; basis: ConsentBasis }>
  | Readonly<{ kind: 'confirm' | 'forbidden' | 'unavailable' }>

const NOT_REQUIRED: ConsentDecision = { kind: 'allow', basis: { kind: 'notRequired' } }

/** The owner's own act needs no consent; an agent's change in effect takes the standing consent the
 * setting gives, or else the owner's answer to the same content. */
export function decideScheduleConsent(input: ConsentInput): ConsentDecision {
  const { actor, subject, command, mode, confirmation } = input
  if (actor === 'other') return { kind: 'forbidden' }
  if (actor === 'owner' || command === 'read') return NOT_REQUIRED
  if (subject === 'others') return { kind: 'forbidden' }
  if (command === 'draftLocal') return NOT_REQUIRED
  if (mode.kind === 'auto')
    return { kind: 'allow', basis: { kind: 'blanket', generation: mode.generation } }
  if (mode.kind === 'unreadable') return { kind: 'unavailable' }
  if (confirmation.kind === 'valid')
    return { kind: 'allow', basis: { kind: 'granular', decision: confirmation.decision } }
  return confirmation.kind === 'unreadable' ? { kind: 'unavailable' } : { kind: 'confirm' }
}
