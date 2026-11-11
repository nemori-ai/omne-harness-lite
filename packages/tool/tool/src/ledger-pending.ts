// 调用域的待办标记（契约 P01「通知丢失由 scanPending 补偿」）。账本在每笔调用域提交里，按提交
// 生效后的记录算出这个调用是否还有待推进的工作，把结果交给记录仓与记录一起提交。各个决策器不写标记。
import type { WaitRecord } from '@omne-harness/tool-contract'
import { recordKey, type LedgerRecord, type LedgerWrite } from './ledger-store.ts'

/** 暂停中的调用在这些阶段的等待上还有工作：登记、取决定，或接受之后的恢复。 */
const LIVE_WAIT_PHASES: ReadonlySet<WaitRecord['phase']> = new Set([
  'opening',
  'open',
  'responding',
])

/**
 * 一个调用域有待推进的工作：有状态为 `pending` 的待办，或调用暂停中且有一个等待处于
 * `opening`、`open` 或 `responding`。`blocked` 的待办不算：推进协程不处理它（driver 跳过受阻
 * 待办），它要等外部的处置。它仍留在调用记录里，`loadRecovery` 照常返回它。
 */
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

/**
 * 按键依次应用写入之后，这个调用域是否还有待推进的工作。整域删除（`drop`）之后域里没有记录，
 * 也就没有待办。到期索引的写入（`schedule`、`unschedule`）不改记录。
 */
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
