import { judgeArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import { closeOut } from './operations.ts'
import { AssemblyState } from './state.ts'
import { advance } from './transition.ts'
import type { AssemblyResult, AssemblySettlement } from './types.ts'
import { ownEvent } from './values.ts'

/** S-22: exactly the accepted lost finish followed by pure settlement. */
export function abandon(
  state: AssemblyState,
  reason?: unknown,
): AssemblyResult<AssemblySettlement, 'malformed' | 'event_after_finish'> {
  const data = AssemblyState.read(state)
  const event = { t: 'finish', reason: 'lost', ...(reason === undefined ? {} : { error: reason }) }
  const judgment = judgeArrivalEnvelope({ target: data.target, event })
  if ('rejected' in judgment) {
    if (judgment.rejected !== 'malformed') throw new Error('lost finish representation invariant')
    return Object.freeze({ rejected: judgment.rejected })
  }
  if (data.finish !== undefined) return Object.freeze({ rejected: 'event_after_finish' } as const)
  const finish = ownEvent(event)
  if (finish.t !== 'finish') throw new Error('lost finish ownership invariant')
  const result = closeOut(AssemblyState.create(Object.freeze({ ...advance(data, finish), finish })))
  if ('rejected' in result) throw new Error('accepted lost finish settlement invariant')
  return result
}
