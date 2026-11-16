import type {
  DurableEvidence,
  QueuePosition,
  ToolState,
  ToolTerminal,
} from '@omne-harness/tool-contract'
import type { Snapshot } from './ledger-decider.ts'
import type { ReleaseBasis, ResultRecord } from './ledger-store.ts'

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

// The result that holds the execution's own final: its late version when a withdraw ended the
// foreground first, otherwise the result of the call.
export function executionResultOf(
  snapshot: Snapshot,
  state: Extract<ToolState, { phase: 'settled' }>,
): ResultRecord | undefined {
  return snapshot.results.get(state.supplements.at(-1)?.result ?? state.result)
}

// A call settled without a start: the ledger rejected the start, or a control ended the call first.
export function unstartedReleaseBasis(snapshot: Snapshot): ReleaseBasis | null {
  const record = snapshot.call
  if (record === null || record.start !== null || record.state.phase !== 'settled') return null
  const result = snapshot.results.get(record.state.result)
  if (result === undefined) return null
  const receipt = snapshot.operations.get(result.settledBy)?.receipt.kind
  if (receipt === 'ledger-rejected') return { kind: 'ledger-rejected', result: result.source }
  return receipt === 'control' ? { kind: 'ended-before-start', result: result.source } : null
}
