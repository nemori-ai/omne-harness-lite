// 恢复一侧三个纯决策器（acceptDecision、prepareResume、closeWait）的测试场景：在真实运行时、账本与
// 推进协程上把一次检查点调用推进到决策器被问到的那一刻，读出此刻的调用域快照，再把快照与命令直接交给
// 决策器。快照来自真实运行，所以字段齐全；要造出账本自己到不了的前置状态（例如读与提交之间别处改了记录），
// 在快照上只改那一条记录。
import { succeed } from '@omne-harness/operation-result'
import type {
  DecisionValue,
  DurableEvidence,
  ToolCallId,
  ToolRevision,
  ToolWaitId,
} from '@omne-harness/tool-contract'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { snapshotOf, type Decision, type Snapshot } from '../src/ledger-decider.ts'
import type { LedgerWrite } from '../src/ledger-store.ts'
import { nextRevision } from '../src/evidence.ts'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type ResumeInput,
  type Segment,
} from './checkpoint-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority, type StartHarness } from './start-values.ts'

export const FIRST = 'op-c1/start/wait' as ToolWaitId
export const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
export const CALL = ACCESS.call as ToolCallId

export type CallSnapshot = Snapshot

export function text(value: string) {
  return { kind: 'string', value } as const
}

/** 决策方为 `FIRST` 上报的决定证据（与 driver 经 inspect 取得的形状一致）。 */
export const DECISION: DurableEvidence = evidence(`decision/${FIRST}`, 'test-decisions')

export async function snapshotOfCall(harness: StartHarness): Promise<CallSnapshot> {
  const domain = { kind: 'call', tenant: tenantA, call: CALL } as const
  const read = await harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  return snapshotOf(domain, read)
}

/** 提交这一笔时账本给的新修订：当前域修订加一。 */
export function mintOf(snapshot: CallSnapshot) {
  return { revision: nextRevision(snapshot.revision) }
}

export function revisionOf(snapshot: CallSnapshot): ToolRevision {
  if (snapshot.call === null) throw new Error('the snapshot has no call')
  return snapshot.call.state.revision
}

type Commands = StartHarness['commands']
/** 账本在这些命令被问到的那一刻，决策器读到的调用域快照与命令的输入。 */
export type Captured = Readonly<{
  planSuspension: { snapshot: CallSnapshot; input: Parameters<Commands['planSuspension']>[0] }[]
  suspend: { snapshot: CallSnapshot; input: Parameters<Commands['suspend']>[0] }[]
  attachRegistration: {
    snapshot: CallSnapshot
    input: Parameters<Commands['attachRegistration']>[0]
  }[]
  closeWait: { snapshot: CallSnapshot; input: Parameters<Commands['closeWait']>[0] }[]
}>

/** 终端暂停的调用 `c1`：Ask 等待已登记（open），队列条目已停放。 */
export async function suspendedCall(
  options: Readonly<{ resume?: (input: ResumeInput, count: number) => Promise<Segment> }> = {},
) {
  const memory = createMemoryToolLedgerStore()
  const authority = testAuthority()
  const author = askingAuthor(
    undefined,
    options.resume ?? (() => Promise.resolve(succeed({ kind: 'completed', value: 'done' }))),
  )
  const binding = checkpointBinding(authority, author)
  const bridge = scriptedBridge('registers')
  // 命令被问到的那一刻读下来的快照与输入。closeWait 那一刻：恢复段的 continued 事实已保存，等待已推进到 continued。
  const before: Captured = {
    planSuspension: [],
    suspend: [],
    attachRegistration: [],
    closeWait: [],
  }
  const harness = startHarness({
    memory,
    authority,
    bindingsPort: () => binding.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    environmentsPort: base =>
      Object.assign(base, {
        release: () =>
          Promise.resolve(
            succeed({ kind: 'released', evidence: evidence('environment-released') }),
          ),
        inspectRelease: () =>
          Promise.resolve(
            succeed({ kind: 'released', evidence: evidence('environment-released') }),
          ),
      }) as never,
    commands: base => ({
      ...base,
      planSuspension: async input => {
        before.planSuspension.push({ snapshot: await snapshotOfCall(harness), input })
        return base.planSuspension(input)
      },
      suspend: async input => {
        before.suspend.push({ snapshot: await snapshotOfCall(harness), input })
        return base.suspend(input)
      },
      attachRegistration: async input => {
        before.attachRegistration.push({ snapshot: await snapshotOfCall(harness), input })
        return base.attachRegistration(input)
      },
      closeWait: async input => {
        before.closeWait.push({ snapshot: await snapshotOfCall(harness), input })
        return base.closeWait(input)
      },
    }),
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  await settle(harness)
  return { harness, bridge, before, author, binding }
}

export type Suspended = Awaited<ReturnType<typeof suspendedCall>>

/** 推进协程排定的工作，直到连续几轮没有新工作。 */
export async function settle(harness: StartHarness): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

/** 以真实命令接受 `FIRST` 的决定，不推进恢复。 */
export async function accepted(built: Suspended, value: DecisionValue = { kind: 'declined' }) {
  built.bridge.decide(FIRST, value)
  ok(
    await built.harness.commands.acceptDecision({
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: DECISION,
    }),
  )
  return snapshotOfCall(built.harness)
}

/** 接受 `FIRST` 的决定，再以真实命令确认恢复段的环境，不推进恢复。 */
export async function resumePrepared(
  built: Suspended,
  value: DecisionValue = { kind: 'declined' },
) {
  const snapshot = await accepted(built, value)
  const record = snapshot.call
  if (record === null || record.execution === null) throw new Error('the call has no execution')
  const preparation = record.preparations.at(-1)
  if (preparation?.purpose !== 'resume')
    throw new Error('the acceptance planned no resume preparation')
  // The write context carries the principal as the driver's does.
  const write = { ...record.execution, principal: ACCESS.principal }
  ok(
    await built.harness.commands.prepared({
      ...write,
      operation: operationId(`${preparation.operation}/prepared`),
      expected: revisionOf(snapshot),
      preparation,
      resources: evidence('resume-environment'),
    }),
  )
  return snapshotOfCall(built.harness)
}

/** 推进协程把恢复一路走完，返回 closeWait 被问到那一刻的快照与命令。 */
export async function continued(built: Suspended, value: DecisionValue = { kind: 'declined' }) {
  built.bridge.decide(FIRST, value)
  await built.harness.drive('c1')
  await settle(built.harness)
  const closing = built.before.closeWait[0]
  if (closing === undefined) throw new Error('closeWait was never asked')
  return closing
}

export type Record_ = Readonly<Record<string, unknown>>

/** 快照上只改调用记录。 */
export function withCall(snapshot: CallSnapshot, edit: (record: Record_) => Record_): CallSnapshot {
  if (snapshot.call === null) throw new Error('no call')
  return { ...snapshot, call: edit(snapshot.call) as never }
}

/** 快照上只改调用状态里的字段。 */
export function withState(snapshot: CallSnapshot, changes: Record_): CallSnapshot {
  return withCall(snapshot, record => ({
    ...record,
    state: { ...(record.state as Record_), ...changes },
  }))
}

/** 快照上只改一条等待记录。 */
export function withWait(snapshot: CallSnapshot, wait: string, edit: (record: Record_) => Record_) {
  const waits = new Map(snapshot.waits)
  const found = waits.get(wait)
  if (found === undefined) throw new Error('no such wait')
  waits.set(wait, edit(found) as never)
  return { ...snapshot, waits }
}

/** 快照上只改等待的记录体（phase、progress、intent 等）。 */
export function withWaitRecord(snapshot: CallSnapshot, wait: string, changes: Record_) {
  return withWait(snapshot, wait, found => ({
    ...found,
    record: { ...(found.record as Record_), ...changes },
  }))
}

export function withSuspensions(
  snapshot: CallSnapshot,
  edit: (entries: [string, Record_][]) => [string, Record_][],
): CallSnapshot {
  const entries = [...snapshot.suspensions].map(([key, value]) => [key, value] as [string, Record_])
  return { ...snapshot, suspensions: new Map(edit(entries) as never) }
}

export function withFacts(
  snapshot: CallSnapshot,
  edit: (fact: Record_) => Record_ | null,
): CallSnapshot {
  const facts = new Map<string, never>()
  for (const [key, fact] of snapshot.facts) {
    const edited = edit(fact)
    if (edited !== null) facts.set(key, edited as never)
  }
  return { ...snapshot, facts }
}

/** 把一次提交写下的操作记录并入快照，得到这笔提交之后的快照。 */
export function afterCommit(snapshot: CallSnapshot, writes: readonly LedgerWrite[]): CallSnapshot {
  const operations = new Map(snapshot.operations)
  for (const write of writes)
    if (write.kind === 'put' && write.record.kind === 'operation')
      operations.set(write.record.operation.operation, write.record.operation)
  return { ...snapshot, operations }
}

export function putsOf(writes: readonly LedgerWrite[], kind: string): Record_[] {
  return writes.flatMap(write =>
    write.kind === 'put' && write.record.kind === kind ? [write.record as Record_] : [],
  )
}

export function committed<V>(decision: Decision<V>) {
  if (decision.kind !== 'commit') throw new Error(`not a commit: ${JSON.stringify(decision)}`)
  return decision
}

export function invalidOf(field: string, reason: string) {
  return { failure: { kind: 'invalid', field, reason } }
}

export function replied<V>(decision: Decision<V>) {
  if (decision.kind !== 'reply') throw new Error(`not a reply: ${JSON.stringify(decision)}`)
  return decision.outcome
}
