import { createHash } from 'node:crypto'
import type { Adoption, DurableEvidence, Modes } from '@omne-harness/session-contract'

/** What the meta-capability host may offer the model in each collaboration mode. */
const interactions = {
  'co-work': Object.freeze({ humanInteraction: true, requestApproval: true }),
  'auto-drive': Object.freeze({ humanInteraction: false, requestApproval: false }),
} as const satisfies Readonly<
  Record<Modes['collaboration'], Readonly<{ humanInteraction: boolean; requestApproval: boolean }>>
>

/** Names this exact translation table, for the evidence of every projection. */
export const SESSION_COLLABORATION_MODE_TRANSLATION: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'collaboration-mode',
  revision: '1',
  digest: `sha256:${createHash('sha256').update(JSON.stringify(interactions)).digest('hex')}`,
})

export type SessionInteraction = Readonly<{
  humanInteraction: boolean
  requestApproval: boolean
  source: DurableEvidence
  translation: Adoption
}>

/** Runs when a committed mode is published or restored, never as a per-call mode interpreter. */
export function projectSessionCollaborationMode(
  mode: Modes['collaboration'],
  source: DurableEvidence,
): SessionInteraction {
  return Object.freeze({
    ...interactions[mode],
    source: Object.freeze({ ...source }),
    translation: SESSION_COLLABORATION_MODE_TRANSLATION,
  })
}
