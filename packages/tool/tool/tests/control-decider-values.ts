// 叫停决策器（decideControl）的测试场景：在真实运行时、账本与推进协程上把一次检查点调用推进到某个位置，
// 读出此刻的调用域快照，再把快照与控制命令直接交给决策器。快照来自真实运行，所以字段齐全；要造出账本自己到不了的
// 前置状态时，只在快照上改一条记录。快照取自非耐久账本，不证明耐久。
import type { ControlReceipt, DurableEvidence, ToolControl } from '@omne-harness/tool-contract'
import { decideControl } from '../src/ledger-control.ts'
import type { Decision } from '../src/ledger-decider.ts'
import type { PreparedSynthetic } from '../src/ledger-result-preparation.ts'
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
import { evidence, operationId, principalA, tenantA, textFactory } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority } from './start-values.ts'

export const STOP_OPERATION = operationId('stop-c1')
export const SUBJECT: DurableEvidence = evidence('control-subject')
export const STOP: ToolControl = { kind: 'stop' }

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

/**
 * 把一次叫停交给决策器。决策器要一份合成结果时先答 `prepare-synthetic`；账本此时写结果正文再问一次。
 * 这里按同样的两步走：用作者预写的那句话造出结果，带着它再问。
 */
export function decideStop(
  snapshot: CallSnapshot,
  intent: ToolControl = STOP,
  changes: Record_ = {},
): Decision<ControlReceipt> {
  const command = controlCommand(intent, changes)
  const first = decideControl(snapshot, command, null, mintOf(snapshot))
  if (first.kind !== 'prepare-synthetic') return first
  const { need } = first
  if (!('closedResult' in need)) throw new Error('a stop of a suspended call closes its wait')
  const made = textFactory().text(need.closedResult)
  if ('failure' in made) throw new Error('the text factory of the tests does not fail')
  const { operation, inputDigest } = command as { operation: never; inputDigest: string }
  const prepared = {
    id: operationId('prepared-stop-c1'),
    operation,
    inputDigest,
    need,
    basis: evidence('prepared-stop'),
    policy: null as never,
    // The words of a closed wait are short: the result keeps them inline, with no body.
    state: { kind: 'prepared', value: { ...made.ok, original: { kind: 'none' } } },
  } satisfies PreparedSynthetic
  const second = decideControl(snapshot, command, prepared, mintOf(snapshot))
  if (second.kind === 'prepare-synthetic') throw new Error('the decider asked to prepare twice')
  return second
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
