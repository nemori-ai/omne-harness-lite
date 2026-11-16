import type { InputId } from './identity.ts'
import type { RunTerminal, WorkSnapshot } from './values.ts'

export function pendingAfterTerminal(
  snapshot: Pick<WorkSnapshot, 'pending' | 'unanswered'>,
  outcome: RunTerminal['outcome'],
): readonly InputId[] {
  return outcome === 'failed'
    ? [...(snapshot.unanswered ?? []), ...snapshot.pending]
    : snapshot.pending
}
