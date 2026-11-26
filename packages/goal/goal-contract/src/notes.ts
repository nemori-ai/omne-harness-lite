import { openGap } from './observe.ts'
import type { GoalRecord } from './record.ts'
import { renderReferences } from './render.ts'
import { STALL_LIMIT } from './verdict.ts'

const parts = (...lines: readonly (string | null)[]): string =>
  lines.filter((line): line is string => line !== null && line !== '').join('\n\n')

const gapOf = ({ body, readings, state }: GoalRecord): string =>
  openGap(body, readings, state.rounds)

function pauseReason(record: GoalRecord): string | null {
  const { state, body } = record
  if (state.status !== 'paused' || state.pause.by !== 'verdict') return null
  const { row, exit } = state.pause
  if (row === 5) {
    const named = body.exits.find(entry => entry.id === exit)
    return `判定看到要你来定的情形出现了：[${String(exit)}] ${named?.statement ?? ''}`.trimEnd()
  }
  if (row === 6) return '判定认为照现在的条件它达不成：进展清单里写的阻碍被试过，仍然挡着。'
  if (row === 7) return `连续 ${String(STALL_LIMIT)} 次核对，差距都没有变近。`
  return '这一次判定答不出，没法核对做没做到。'
}

/** The line left in the conversation when a verdict hands the goal to the person: why it stopped and what is still open. Null for any other state. */
export function pausedNote(record: GoalRecord): string | null {
  const reason = pauseReason(record)
  if (reason === null || record.state.status !== 'paused') return null
  const open = gapOf(record)
  const { pause } = record.state
  const byExit = pause.by === 'verdict' && pause.exit !== null ? `，或照 [${pause.exit}] 收场` : ''
  return parts(
    `目标暂停了，交给你定。${reason}`,
    open === '' ? null : `还没合上的：\n${open}`,
    `这一轮到这里结束。你可以恢复、修订或取消这个目标${byExit}。`,
  )
}

/** What the agent is told after its context was compacted: what the goal is for, where the material is, what is still open. Null when no goal is in progress. */
export function compactedNote(record: GoalRecord): string | null {
  if (record.state.status !== 'active') return null
  const references = renderReferences(record.body)
  const open = gapOf(record)
  return parts(
    'The context of this session was compacted. Its goal still stands, and your work is still checked against it each time you are about to stop.',
    `Purpose: ${record.body.purpose}`,
    references === '' ? null : `Where the material is:\n${references}`,
    open === '' ? null : `Still open:\n${open}`,
    'Goal show reads the whole goal, how far each entry is from done, and your progress list.',
  )
}
