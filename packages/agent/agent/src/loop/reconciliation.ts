import type { ExecutionRevision } from '@omne-harness/agent-contract'

export function reconciliationDelayAt(delaysMs: readonly number[], quietWakes: number): number {
  return delaysMs[Math.min(quietWakes, delaysMs.length - 1)] as number
}

export type ReconciliationPacer = Readonly<{
  delayAt(revision: ExecutionRevision): number
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
