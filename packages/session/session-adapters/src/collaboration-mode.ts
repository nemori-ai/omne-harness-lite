import { createHash } from 'node:crypto'
import type { Adoption, Attendance, DurableEvidence, Modes } from '@omne-harness/session-contract'

// A person can be asked for an answer now only where one attends and the mode is co-work.
const answers = {
  attended: { 'co-work': true, 'auto-drive': false },
  unattended: { 'co-work': false, 'auto-drive': false },
} as const satisfies Readonly<Record<Attendance, Readonly<Record<Modes['collaboration'], boolean>>>>

export const SESSION_COLLABORATION_MODE_TRANSLATION: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'collaboration-mode',
  revision: '3',
  digest: `sha256:${createHash('sha256').update(JSON.stringify(answers)).digest('hex')}`,
})

/** The facts of the session that do not change: whether a person attends, whether it is a child. */
export type SessionStandingFacts = Readonly<{ attendance: Attendance; child: boolean }>

export type SessionInteraction = SessionStandingFacts &
  Readonly<{
    humanInteraction: boolean
    source: DurableEvidence
    translation: Adoption
  }>

export function projectSessionCollaborationMode(
  mode: Modes['collaboration'],
  standing: SessionStandingFacts,
  source: DurableEvidence,
): SessionInteraction {
  return Object.freeze({
    attendance: standing.attendance,
    child: standing.child,
    humanInteraction: answers[standing.attendance][mode],
    source: Object.freeze({ ...source }),
    translation: SESSION_COLLABORATION_MODE_TRANSLATION,
  })
}
