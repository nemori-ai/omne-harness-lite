import type { Failure } from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { Told } from './model-telling.ts'

/** Owned preparation commits are progress, not lost races of the Agent's publication. */
export async function settleModelStep(
  snapshot: WorkSnapshot | null,
  prepare: (snapshot: WorkSnapshot | null) => Promise<Told>,
  read: () => Promise<Outcome<WorkSnapshot | null, Failure>>,
): Promise<Told> {
  let changed = false
  for (let attempt = 0; attempt < 16; attempt++) {
    const result = await prepare(snapshot)
    if (result === null) return changed ? { kind: 'again' } : null
    if (result.kind === 'answer') return result
    changed = true
    const current = await read()
    if ('failure' in current) return { kind: 'answer', value: current }
    snapshot = current.ok
  }
  return {
    kind: 'answer',
    value: {
      failure: {
        kind: 'unavailable',
        owner: 'session-log-journal',
        diagnostic: 'the model step prerequisites kept changing',
      },
    },
  }
}
