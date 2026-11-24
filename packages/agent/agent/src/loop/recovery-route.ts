import type {
  Action,
  ActionBatch,
  AgentCheckpoint,
  ExecutionSnapshot,
  PendingCall,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { LOOP_NODES, type LoopNode } from './nodes.ts'

type UnsupportedRecovery = Readonly<{ kind: 'unsupported'; node: string; card: string }>
type Recovery = Outcome<LoopNode | 'evaluate', UnsupportedRecovery>

function recoveryCard(node: string): string {
  if (node.startsWith('C')) return '#502 stage 4'
  return /^[AT]/u.test(node) ? '#502 stage 2' : '#502 stage 5'
}

function recoveryTarget(node: string): Recovery {
  if (
    !LOOP_NODES.includes(node as LoopNode) ||
    ['E0', 'E1', 'E2', 'U0', 'Q1', 'R0', 'W0', 'F0', 'H0', 'M2', 'Q5'].includes(node)
  )
    return fail({ kind: 'unsupported', node, card: recoveryCard(node) })
  return succeed(node as LoopNode)
}

function batchRecovery(position: string, batch: ActionBatch): string {
  if (batch.barrier.kind === 'closed') return 'A1'
  if (['T4', 'T5', 'I8'].includes(position)) return position
  const slotted = (action: Action) => batch.slots.some(slot => slot.action === action.id)
  if (batch.barrier.kind === 'all-denied') return batch.actions.every(slotted) ? 'T2' : 'A3'
  const judged = (action: Action) => ['allowed', 'denied'].includes(action.judgment.kind)
  if (batch.actions.some(action => judged(action) && !slotted(action))) return 'A2'
  return batch.slots.some(slot => slot.kind === 'dispatched') ? 'T0' : 'T1'
}

function callRecovery(position: string, call: PendingCall): Recovery {
  if (call.purpose === 'action') return recoveryTarget('T0')
  if (['M0', 'M6', 'M1', 'M3', 'M4', 'M5', 'I3'].includes(position)) return recoveryTarget(position)
  if (position === 'Q2' || position === 'Q4') return recoveryTarget('I3')
  return recoveryTarget('M1')
}

function preparationRecovery(at: AgentCheckpoint): Recovery | null {
  if (at.requestPreparation?.kind === 'cannot-fit') return succeed('F1')
  if (at.compaction !== null) {
    const ended = at.compaction.ended
    return recoveryTarget(
      ended === 'committed'
        ? 'C4'
        : ended === 'failed'
          ? 'F1'
          : at.currentHandoff !== null
            ? 'C3'
            : at.compaction.received !== null
              ? 'C2'
              : 'C1',
    )
  }
  const prepared = at.requestPreparation
  if (prepared === null) return null
  return recoveryTarget('C0')
}

/** The positions before the final request record: no fact of them outlives the process. */
export const BEFORE_RECORD: readonly string[] = ['I1', 'P0', 'P1', 'I2']

function stateRecovery(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Recovery | null {
  const at = read.checkpoint
  if (read.state.kind === 'ended') return succeed('F4')
  // A lost receipt must be reconciled before any dependent business continuation can run.
  if (read.unresolved.length > 0) return succeed('R0')
  if (read.state.kind === 'settling') return succeed(at.position === 'F3' ? 'F3' : 'F2')
  // An open pass keeps the position of the node it runs on; that node continues it from the saved chain.
  // The pass before the model call judges a preparation that does not outlive the process: prepare again first.
  if (at.chain === null) return null
  return BEFORE_RECORD.includes(at.position) ? succeed('I1') : recoveryTarget(at.position)
}

export function recoveryRoute(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Recovery {
  const at = read.checkpoint
  const settled = stateRecovery(read)
  if (settled !== null) return settled
  if (at.batch !== null && at.batch.actions.length > 0)
    return recoveryTarget(batchRecovery(at.position, at.batch))
  const call = at.calls[0]
  if (call !== undefined) return callRecovery(at.position, call)
  if (at.position === 'F1') return recoveryTarget('I8')
  if (['I3', 'I4', 'I8', 'F2', 'F3', 'F4', 'O0', 'E9'].includes(at.position))
    return recoveryTarget(at.position)
  const preparation = preparationRecovery(at)
  if (preparation !== null) return preparation
  if (at.inputBatch !== null || BEFORE_RECORD.includes(at.position)) return succeed('I1')
  if (['E4', 'I0', 'I8'].includes(at.position)) return succeed('evaluate')
  return recoveryTarget(at.position)
}
