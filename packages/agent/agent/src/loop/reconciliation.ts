import type { ExecutionRevision } from '@omne-harness/agent-contract'

/**
 * The check delay after `quietWakes` wakes in a row that found the execution unchanged: the
 * `quietWakes`-th item of `delaysMs`, and the last item once the sequence is used up.
 */
export function reconciliationDelayAt(delaysMs: readonly number[], quietWakes: number): number {
  return delaysMs[Math.min(quietWakes, delaysMs.length - 1)] as number
}

/** The check delays of one execution's waits; it counts in memory only. */
export type ReconciliationPacer = Readonly<{
  /** The delay of a wait entered at `revision`: the count grows on the same revision, else restarts. */
  delayAt(revision: ExecutionRevision): number
}>

export function reconciliationPacer(delaysMs: readonly number[]): ReconciliationPacer {
  let last: ExecutionRevision | null = null
  let quietWakes = 0
  return {
    delayAt(revision) {
      quietWakes = revision === last ? quietWakes + 1 : 0
      last = revision
      return reconciliationDelayAt(delaysMs, quietWakes)
    },
  }
}
