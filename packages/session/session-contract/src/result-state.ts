import type { AttemptId, RunId } from './identity.ts'
import type { CallBinding, Participation, WorkSnapshot } from './values.ts'
import { completeEvidence } from './decision-support.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }

export function attemptBelongsToRun(attempt: AttemptId | null, run: RunId): boolean {
  if (attempt === null || !attempt.startsWith(`${run}#`)) return false
  return /^[1-9]\d*$/u.test(attempt.slice(run.length + 1))
}

export function bindingRun(snapshot: WorkSnapshot, binding: CallBinding): RunId | null {
  const historical = snapshot.executions?.find(item =>
    attemptBelongsToRun(binding.initiatingAttempt, item.run),
  )
  if (historical !== undefined) return historical.run
  return snapshot.run.kind === 'active' &&
    attemptBelongsToRun(binding.initiatingAttempt, snapshot.run.run)
    ? snapshot.run.run
    : null
}

export function resultParticipationError(
  snapshot: WorkSnapshot,
  binding: CallBinding,
  participation: Participation,
): string | null {
  if (
    !participation.operation ||
    !/^\d+$/u.test(participation.written) ||
    !completeEvidence(participation.handover)
  )
    return 'incomplete participation material'
  const run = bindingRun(snapshot, binding)
  const execution =
    snapshot.run.kind === 'active' && snapshot.run.run === run
      ? snapshot.run.execution
      : snapshot.executions?.find(item => item.run === run)?.execution
  return execution?.execution === participation.execution
    ? null
    : 'participation is not for the original consumption execution'
}

export function applyParticipation(draft: Draft, participation: Participation): string | null {
  if (!/^\d+$/u.test(participation.written)) return 'invalid participation revision'
  const historical = draft.executions?.find(
    item => item.execution.execution === participation.execution,
  )?.execution
  const current = draft.run.kind === 'active' ? draft.run.execution : undefined
  if (
    [historical, current].some(
      execution =>
        execution?.execution === participation.execution &&
        execution.revision !== null &&
        BigInt(participation.written) < BigInt(execution.revision),
    )
  )
    return 'participation revision moved backwards'
  const update = (execution: import('./values.ts').ExecutionRef) => ({
    ...execution,
    revision: participation.written,
    evidence: participation.handover,
  })
  if (draft.executions !== undefined)
    draft.executions = draft.executions.map(item =>
      item.execution.execution === participation.execution
        ? { ...item, execution: update(item.execution) }
        : item,
    )
  if (draft.run.kind === 'active' && draft.run.execution.execution === participation.execution)
    draft.run = { ...draft.run, execution: update(draft.run.execution) }
  return null
}
