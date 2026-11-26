import { countsAs, type BodyIssue, type GoalOutcome } from '@omne-harness/goal-contract'
import type { ScheduleExecutorInspection } from '@omne-harness/schedule-contract'

type Ended = Extract<ScheduleExecutorInspection, { kind: 'ended' }>

const WHICH: Readonly<Record<Exclude<GoalOutcome['kind'], 'exit'>, string>> = {
  achieved: 'achieved',
  unattainable: 'unattainable',
  stalled: 'stalled',
  'judge-unavailable': 'judge-unavailable',
  aborted: 'aborted',
  cancelled: 'cancelled',
}

/** The end of a Job by the end of its goal: achieving, or an exit written as success, succeeds; a cancel stops; the rest fails, saying which. */
export function endOf(outcome: GoalOutcome): Ended {
  const reason = outcome.kind === 'exit' ? `exit:${outcome.exit}` : WHICH[outcome.kind]
  const counts = countsAs(outcome)
  if (counts === 'success') return { kind: 'ended', report: 'succeeded', result: true, reason }
  return {
    kind: 'ended',
    report: counts === 'neither' ? 'stopped' : 'failed',
    result: false,
    reason,
  }
}

/** What is wrong with a body, one entry a clause: `A1.evidence: …; purpose: …`. */
export const issuesText = (issues: readonly BodyIssue[]): string =>
  issues
    .map(
      issue => `${issue.entry === null ? '' : `${issue.entry}.`}${issue.field}: ${issue.problem}`,
    )
    .join('; ')
