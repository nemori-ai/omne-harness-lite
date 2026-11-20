import { createHash } from 'node:crypto'
import type { Adoption, DurableEvidence, Modes } from '@omne-harness/session-contract'

const interactions = {
  'co-work': Object.freeze({ humanInteraction: true }),
  'auto-drive': Object.freeze({ humanInteraction: false }),
} as const satisfies Readonly<
  Record<Modes['collaboration'], Readonly<{ humanInteraction: boolean }>>
>

export const SESSION_COLLABORATION_MODE_TRANSLATION: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'collaboration-mode',
  revision: '2',
  digest: `sha256:${createHash('sha256').update(JSON.stringify(interactions)).digest('hex')}`,
})

export type SessionInteraction = Readonly<{
  humanInteraction: boolean
  source: DurableEvidence
  translation: Adoption
}>

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
