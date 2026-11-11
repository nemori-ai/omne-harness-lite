// 叫停决策器（decideControl）的测试场景：在真实运行时、账本与推进协程上把一次检查点调用推进到某个位置，
// 读出此刻的调用域快照，再把快照与控制命令直接交给决策器。快照来自真实运行，所以字段齐全；要造出账本自己到不了的
// 前置状态时，只在快照上改一条记录。快照取自非耐久账本，不证明耐久。
import { succeed } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolControl } from '@omne-harness/tool-contract'
import { decideControl } from '../src/ledger-control.ts'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type Segment,
} from './checkpoint-values.ts'
import {
  CALL,
  mintOf,
  settle,
  snapshotOfCall,
  type CallSnapshot,
  type Record_,
} from './resumption-decider-values.ts'
import {
  evidence,
  operationId,
  principalA,
  tenantA,
  textFactory,
  type Block,
} from './runtime-values.ts'
import { admitCall, startHarness, testAuthority } from './start-values.ts'

export const STOP_OPERATION = operationId('stop-c1')
export const SUBJECT: DurableEvidence = evidence('control-subject')
export const STOP: ToolControl = { kind: 'stop' }

/** 账本为被叫停的调用造结果的工厂：文字是作者为「等待被关闭」预写的那一份。 */
export function closedText(closedResult: string) {
  const made = textFactory().text(closedResult)
  if ('failure' in made) throw new Error('the text factory of the tests does not fail')
  return succeed(made.ok)
}

/** 与账本交给决策器的命令同形：操作、输入摘要、意图与主体。 */
export function controlCommand(intent: ToolControl, changes: Record_ = {}) {
  return {
    principal: principalA,
    tenant: tenantA,
    call: CALL,
    operation: STOP_OPERATION,
    inputDigest: 'digest-control',
    intent,
    subject: SUBJECT,
    ...changes,
  } as never
}

export function decideStop(
  snapshot: CallSnapshot,
  intent: ToolControl = STOP,
  text: Parameters<typeof decideControl<Block>>[2] = closedText,
  changes: Record_ = {},
) {
  return decideControl(snapshot, controlCommand(intent, changes), text, mintOf(snapshot))
}

/** 首段一直运行的调用 `c1`：已记 live 启动，没有等待。 */
export async function runningCallSnapshot(): Promise<CallSnapshot> {
  const authority = testAuthority()
  const initial = (): Promise<Segment> => new Promise<Segment>(() => {})
  const binding = checkpointBinding(authority, askingAuthor(initial))
  const harness = startHarness({
    authority,
    bindingsPort: () => binding.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
  })
  binding.attach(harness)
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  await settle(harness)
  return snapshotOfCall(harness)
}

/** 只受理、尚未启动的调用 `c1`：没有启动记录。 */
export async function admittedCallSnapshot(): Promise<CallSnapshot> {
  const authority = testAuthority()
  const binding = checkpointBinding(authority, askingAuthor())
  const harness = startHarness({
    authority,
    bindingsPort: () => binding.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
  })
  await admitCall(harness, 'c1')
  return snapshotOfCall(harness)
}
