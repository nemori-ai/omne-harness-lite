import type {
  DurableEvidence,
  QueuePosition,
  ToolState,
  ToolTerminal,
} from '@omne-harness/tool-contract'

export function releasedQueue(queue: QueuePosition, evidence: DurableEvidence): QueuePosition {
  return queue.kind === 'held' || queue.kind === 'waiting'
    ? { ...queue, kind: 'released', evidence }
    : queue
}

// A withdraw settled the call while its execution still runs: its real final comes as a late version.
export function lateVersionOf(state: ToolState): Readonly<{ logical: ToolTerminal }> | null {
  return state.phase === 'settled' && state.execution.kind === 'live'
    ? { logical: state.terminal }
    : null
}

export function awaitsFinal(state: ToolState): boolean {
  return state.phase !== 'settled' || lateVersionOf(state) !== null
}
