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
  /**
   * The delay of a wait entered at `revision`. The count grows only when the last wait was woken by
   * its check time and the revision is the same; any other wake or a new revision starts it over.
   */
  delayAt(revision: ExecutionRevision): number
  /** The wait just entered was woken by its check time, not by an event. */
  timerWoke(): void
}>

export function reconciliationPacer(delaysMs: readonly number[]): ReconciliationPacer {
  let last: ExecutionRevision | null = null
  let timed = false
  let quietWakes = 0
  return {
    delayAt(revision) {
      quietWakes = timed && revision === last ? quietWakes + 1 : 0
      last = revision
      timed = false
      return reconciliationDelayAt(delaysMs, quietWakes)
    },
    timerWoke() {
      timed = true
    },
  }
}
