import type { BatchToHand, GoalExamining } from '@omne-harness/goal'
import type { GoalChecking } from '@omne-harness/goal-contract'
import { rerunIn, type RerunPorts, type ToRun } from './rerun.ts'

export type ExaminingPorts = Readonly<{
  rerun: RerunPorts
  /** The system principal of goals: what the program ran again is handed in as it. */
  system: unknown
  checking(): GoalChecking | undefined
  report(error: unknown): void
}>

const toRun = (batch: BatchToHand): readonly ToRun[] =>
  batch.criteria.flatMap(({ id, evidence }) =>
    evidence.kind === 'rerun' ? [{ criterion: id, command: evidence.command }] : [],
  )

/** The examining side as this release has it. The commands of a batch are run again by a program, with no model; the batch is taken once while that goes on, and stays owed by its goal until the exit codes are handed in. */
export function createExamining(
  ports: ExaminingPorts,
): GoalExamining & Readonly<{ idle(): Promise<void> }> {
  const going = new Map<string, Promise<void>>()

  async function work(tenant: string, batch: BatchToHand, runs: readonly ToRun[]): Promise<void> {
    const results = await rerunIn(ports.rerun, batch.where, runs)
    const checking = ports.checking()
    if (checking === undefined)
      throw new Error('the goal services are absent: nothing was handed in')
    const caller = { tenant, subject: ports.system }
    const { session, request } = batch
    const answer = await checking.reran(caller, { session, request, results })
    const left = answer.kind === 'done' ? answer.value.examine : []
    if (left.length > 0) await checking.unexamined(caller, { session, request })
  }

  return {
    async hand(tenant, batch) {
      const key = JSON.stringify([tenant, batch.session, batch.request])
      if (going.has(key)) return { kind: 'taking' }
      const runs = toRun(batch)
      if (runs.length === 0) return { kind: 'refused' }
      const done = work(tenant, batch, runs)
        .catch(ports.report)
        .finally(() => void going.delete(key))
      going.set(key, done)
      return { kind: 'taking' }
    },
    async cited() {
      return { kind: 'unavailable' }
    },
    async idle() {
      while (going.size > 0) await Promise.all(going.values())
    },
  }
}
