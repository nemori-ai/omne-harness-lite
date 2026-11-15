import type { WaitRecord } from '@omne-harness/tool-contract'
import { recordKey, type LedgerRecord, type LedgerWrite } from './ledger-store.ts'

const LIVE_WAIT_PHASES: ReadonlySet<WaitRecord['phase']> = new Set([
  'opening',
  'open',
  'responding',
])

export function hasPendingWork(records: Iterable<LedgerRecord>): boolean {
  let suspended = false
  let liveWait = false
  for (const record of records) {
    if (record.kind === 'task' && record.task.state === 'pending') return true
    if (record.kind === 'call' && record.call.state.phase === 'suspended') suspended = true
    if (record.kind === 'wait' && LIVE_WAIT_PHASES.has(record.wait.record.phase)) liveWait = true
  }
  return suspended && liveWait
}

export function pendingAfter(
  records: readonly LedgerRecord[],
  writes: readonly LedgerWrite[],
): boolean {
  const after = new Map(records.map(record => [recordKey(record), record]))
  for (const write of writes) {
    if (write.kind === 'put') after.set(recordKey(write.record), write.record)
    else if (write.kind === 'delete') after.delete(write.key)
    else if (write.kind === 'drop') after.clear()
  }
  return hasPendingWork(after.values())
}
