import type { InputId, RunId, WorkSnapshot } from '@omne-harness/session-contract'
import { sessionKey, type SessionRef } from './scheduling.ts'

/**
 * The inputs of the active Run of each session whose hand-in the Agent answered to this instance.
 * It holds no fact of its own: after a restart the hand-in is sent again and the Agent recognizes it.
 */
export type KnownHandovers = Readonly<{
  note(ref: SessionRef, run: RunId, input: InputId): void
  /** The inputs noted for the active Run of `snapshot`. What was noted for another Run is dropped. */
  of(ref: SessionRef, snapshot: WorkSnapshot): ReadonlySet<InputId>
}>

const NONE: ReadonlySet<InputId> = new Set()

export function createKnownHandovers(): KnownHandovers {
  const known = new Map<string, { run: RunId; inputs: Set<InputId> }>()
  return {
    note: (ref, run, input) => {
      const key = sessionKey(ref)
      const entry = known.get(key)
      if (entry?.run === run) entry.inputs.add(input)
      else known.set(key, { run, inputs: new Set([input]) })
    },
    of: (ref, { run }) => {
      const key = sessionKey(ref)
      const entry = known.get(key)
      if (entry === undefined) return NONE
      if (run.kind === 'active' && run.run === entry.run) return entry.inputs
      known.delete(key)
      return NONE
    },
  }
}
