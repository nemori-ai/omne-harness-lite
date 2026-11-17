import type { AgentJournal, CallerCommit, ExecutionMutation } from '@omne-harness/agent-contract'
import type { JournalWrite } from '../testing/journal.ts'

// The caller a Journal write brings to a joint Session commit. A compaction result joins only
// through the context transition that adopts it, never through its custody or processing.
export function historyCaller<P>(input: ExecutionMutation<P>, method: JournalWrite): CallerCommit {
  if (method === 'recordResult') {
    const transfer = (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
    return compactionDuty(transfer) ? { kind: 'none' } : transfer
  }
  if (method !== 'commit') return { kind: 'none' }
  const commit = input as Parameters<AgentJournal<P>['commit']>[0]
  if (compactionDuty(commit.caller)) return { kind: 'none' }
  if (commit.caller.kind !== 'none') return commit.caller
  const handoff = commit.handoff
  if (handoff?.kind !== 'resolve') return commit.caller
  const { request, decision, record } = handoff.outcome
  if (
    request.kind !== 'execution' ||
    request.source.kind !== 'model-reply' ||
    decision.kind !== 'prepared'
  )
    return commit.caller
  return {
    kind: 'message',
    message: decision.message,
    source: record,
    admission: decision.admission,
  }
}

function compactionDuty(caller: CallerCommit): boolean {
  return (
    (caller.kind === 'custody' || caller.kind === 'processed') &&
    caller.result.producer.kind === 'compaction'
  )
}
