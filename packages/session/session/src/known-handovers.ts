import type { InputId, RunId, WorkSnapshot } from '@omne-harness/session-contract'
import { sessionKey, type SessionRef } from './scheduling.ts'

export type KnownHandovers = Readonly<{
  note(ref: SessionRef, run: RunId, input: InputId): void
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
