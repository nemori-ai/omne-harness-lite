import type { InputId, RunId, WorkSnapshot } from '@omne-harness/session-contract'
import { sessionKey, type SessionRef } from './scheduling.ts'

export type KnownHandovers = Readonly<{
  note(ref: SessionRef, run: RunId, inputs: readonly InputId[]): void
  of(ref: SessionRef, snapshot: WorkSnapshot): ReadonlySet<InputId>
}>

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

const NONE: ReadonlySet<InputId> = new Set()

export function handedRun(
  snapshot: WorkSnapshot,
  known: ReadonlySet<InputId> = NONE,
): ActiveRun | null {
  const { run } = snapshot
  if (run.kind !== 'active') return null
  const held = run.initial.some(
    input =>
      known.has(input) || snapshot.handed.includes(input) || !snapshot.pending.includes(input),
  )
  return held ? run : null
}

export function createKnownHandovers(): KnownHandovers {
  const known = new Map<string, { run: RunId; inputs: Set<InputId> }>()
  return {
    note: (ref, run, inputs) => {
      const key = sessionKey(ref)
      const entry = known.get(key)
      known.set(key, {
        run,
        inputs: new Set([...(entry?.run === run ? entry.inputs : []), ...inputs]),
      })
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
