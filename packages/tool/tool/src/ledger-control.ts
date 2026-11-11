import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ControlProgress,
  type ControlReceipt,
  type ControlRecord,
  type DurableEvidence,
  type ToolControl,
  type ToolOperationId,
  type ToolState,
} from '@omne-harness/tool-contract'
import type { ControlDispatch } from '@omne-harness/tool-contract/provider'
import { invalid, type MutationInput } from './boundary.ts'
import { mintEvidence, sameFactValue } from './evidence.ts'
import {
  operationRecord,
  put,
  queueTask,
  recall,
  reply,
  settlementWrites,
  syntheticChannels,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'
import { commonOf, dropSuspensionContent, nextState, type StateBody } from './ledger-start.ts'
import {
  taskKey,
  type CallRecord,
  type LedgerWrite,
  type WaitLedgerRecord,
} from './ledger-store.ts'

type Command = MutationInput<unknown> & Readonly<{ inputDigest: string }>
type ControlCommand = Command & Readonly<{ intent: ToolControl; subject: DurableEvidence }>
type ProgressCommand = Command &
  Readonly<{
    control: ToolOperationId
    source: DurableEvidence
    progress: ControlProgress
  }>

function withControls(
  call: CallRecord,
  controls: readonly ControlRecord[],
  mint: Mint,
): CallRecord {
  const { source: _source, ...body } = call.state
  const state = { ...body, controls, revision: mint.revision }
  return {
    ...call,
    state: {
      ...state,
      source: mintEvidence('state', { tenant: call.tenant, call: call.call }, mint.revision, state),
    },
  }
}

/**
 * 控制的定义域（契约 P06、P07，Tool SPEC 第 29、32 条）：
 * - 暂停中的调用（等待 opening、open 或 responding）：stop 与 withdraw 让调用收场，background 被拒；
 * - 恢复段已准备、尚未 live（execution `starting` 于 resume 记录）：stop 与 live 调用同样保存停止待办，
 *   段一 live 即送达；
 * - 已记录 live 启动或已结束的调用：stop 保存停止待办，或记 `already-ended`。
 * 其余控制答 unsupported。
 *
 * 让暂停中的调用收场时，结果是账本自己形成的：先答 `prepare-synthetic`，由调用方把作者预写的文字
 * 写成结果通道，再带着 `prepared` 重新决策（与未启动调用的终局同一条路）。
 */
export function decideControl(
  snapshot: Snapshot,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  if (call.state.phase === 'suspended')
    return decideSuspendedControl(snapshot, call, command, prepared, mint)
  const resumeStarting = call.start?.kind === 'resume' && call.state.execution.kind === 'starting'
  if (
    command.intent.kind !== 'stop' ||
    call.start === null ||
    (call.state.execution.kind !== 'live' &&
      call.state.execution.kind !== 'ended' &&
      !resumeStarting)
  )
    return reply(
      fail({
        kind: 'unsupported',
        adoption: call.request.availability.definition.adoption,
        reason:
          'control currently requires a suspended call, or a stop of a started or resuming invocation',
      }),
    )
  const source = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent: command.intent, start: call.start, subject: command.subject },
  )
  const ended = call.state.execution.kind === 'ended'
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: ended
      ? { kind: 'already-ended', evidence: call.state.source }
      : { kind: 'pending', diagnostic: 'stop-not-dispatched' },
  }
  const revised = withControls(call, [...call.state.controls, control], mint)
  const receipt: ControlReceipt = {
    operation: command.operation,
    state: revised.state,
    progress: control.progress,
  }
  const dispatch: ControlDispatch = {
    tenant: call.tenant,
    call: call.call,
    operation: command.operation,
    adoption: call.start.executor,
    inputDigest: command.inputDigest,
    start: call.start,
    intent: command.intent,
    source,
  }
  return {
    kind: 'commit',
    value: receipt,
    writes: [
      put({ kind: 'call', call: revised }),
      put(
        operationRecord(
          command,
          { kind: 'control', control: receipt, subject: command.subject },
          mint,
        ),
      ),
      ...(ended
        ? []
        : [
            put({
              kind: 'task',
              task: {
                kind: 'stop',
                operation: command.operation,
                state: 'pending',
                diagnostic: null,
                control: dispatch,
              },
            }),
          ]),
    ],
  }
}

/** 等待失效的操作（P06 invalidate）：与登记同法，只由等待身份派生，所以调用与等待确定它。 */
export function invalidationOperation(wait: string): ToolOperationId | null {
  const decoded = decodeToolOperationId(`${wait}/invalidate`)
  return 'ok' in decoded ? decoded.ok : null
}

/** 调用当前的等待：尚未关闭的那一个。一个暂停中的调用恰有一个。 */
function currentWait(snapshot: Snapshot): WaitLedgerRecord | undefined {
  return [...snapshot.waits.values()].find(wait => wait.record.phase !== 'closed')
}

/** 收场时的计时：暂停或已关闭的计时关闭并保留累计；未知的计时保持原样。 */
function closedTiming(timing: ToolState['timing']): ToolState['timing'] {
  return timing.kind === 'paused' || timing.kind === 'closed'
    ? { kind: 'closed', accumulatedMs: timing.accumulatedMs }
    : timing
}

/**
 * 暂停中的调用收到控制（契约 P06「取消与答复在原 ToolCall 事务排序」，P07 stop 与 withdraw）。
 *
 * 有效的 Ask 等待不能转后台，所以 background 回复 `invalid`。stop 与 withdraw 在同一笔调用域提交里：
 * - 把调用写成 settled：终局是 interrupted，原因是本次控制（withdraw 时 withdrawn 为 true），
 *   不伪造答案；`execution` 保留 `{kind:'suspended', checkpoint}`，这正是 `suspended-exclusion`
 *   释放依据的形状；效果记为未知，因为已运行的段可能产生过效果；
 * - 记下控制，进度为 `already-ended`：暂停已经排除旧执行，没有执行可停；
 * - 以 `cancelled` 关闭当前等待；
 * - 写失效待办 `wait-registration{action:'invalidate'}` 与队列释放待办 `queue`，
 *   删除登记、停泊与接受留下的待办：它们的后续都被收场取代。
 * 调用记录的 CAS 决定取消与 acceptDecision 的先后：取消先成立时，之后的接受见调用已收场而被拒；
 * 接受先成立时，取消仍然成立，恢复不再进行。
 */
function decideSuspendedControl(
  snapshot: Snapshot,
  call: CallRecord,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const { intent } = command
  if (intent.kind === 'background') return reply(invalid('intent', 'ask-wait-cannot-background'))
  if (call.state.phase !== 'suspended' || call.state.execution.kind !== 'suspended')
    return reply(invalid('call', 'not-suspended'))
  const { checkpoint } = call.state.execution
  const committed = [...snapshot.suspensions.values()].find(
    entry => entry.checkpoint !== null && sameFactValue(entry.checkpoint.payload, checkpoint),
  )?.checkpoint
  if (committed === undefined || committed === null || call.start === null)
    return reply(invalid('checkpoint', 'not-committed-by-suspend'))
  const wait = currentWait(snapshot)
  if (wait === undefined) return reply(invalid('wait', 'no-current-wait'))
  const invalidation = invalidationOperation(wait.record.intent.wait)
  if (invalidation === null) return reply(invalid('wait', 'no-invalidation-operation'))
  const terminal = {
    kind: 'interrupted',
    cause: { kind: 'control', operation: command.operation, withdrawn: intent.kind === 'withdraw' },
  } as const
  // 结果是作者为「等待被关闭」预写的那一份：调用没有答案，也没有运行恢复段。
  const made = syntheticChannels(
    command,
    { terminal, consumer: call.request.consumer, closedResult: committed.closedResult },
    prepared,
  )
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const effect = { kind: 'unknown', diagnostic: 'suspended-segments-effect-unreported' } as const
  const settled = settlementWrites(
    snapshot,
    command,
    call.request.consumer,
    terminal,
    made.ok,
    mint,
    effect,
  )
  if ('failure' in settled) return reply(settled)
  const first = settled.ok
  const { version, delivery } = first.version
  const source = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent, start: call.start, subject: command.subject },
  )
  const control: ControlRecord = {
    operation: command.operation,
    intent,
    source,
    progress: { kind: 'already-ended', evidence: committed.exclusion },
  }
  const current = commonOf(call.state)
  const body: StateBody = {
    ...current,
    phase: 'settled',
    wait: { kind: 'none' },
    result: version,
    relation: 'foreground',
    terminal,
    foreground: { kind: 'final', result: version },
    effect,
    timing: closedTiming(current.timing),
    queue:
      current.queue.kind === 'held' || current.queue.kind === 'waiting'
        ? { ...current.queue, kind: 'released', evidence: committed.exclusion }
        : current.queue,
    controls: [...current.controls, control],
    delivery,
  }
  const state = nextState(call, body, mint.revision)
  const receipt: ControlReceipt = {
    operation: command.operation,
    state,
    progress: control.progress,
  }
  const replaced = snapshot.tasks.filter(
    task =>
      task.kind === 'queue' ||
      task.kind === 'suspend' ||
      task.kind === 'prepare' ||
      (task.kind === 'wait-registration' && task.action === 'ensure'),
  )
  const writes: LedgerWrite[] = [
    put({ kind: 'call', call: { ...call, state } }),
    ...first.writes,
    ...dropSuspensionContent(snapshot),
    put({
      kind: 'wait',
      wait: {
        ...wait,
        record: {
          intent: wait.record.intent,
          phase: 'closed',
          cause: 'cancelled',
          evidence: source,
        },
      },
    }),
    put(
      operationRecord(
        command,
        { kind: 'control', control: receipt, subject: command.subject },
        mint,
      ),
    ),
    ...replaced.map(task => ({ kind: 'delete', key: taskKey(task) }) as const),
    put({
      kind: 'task',
      task: {
        kind: 'wait-registration',
        operation: invalidation,
        state: 'pending',
        diagnostic: null,
        wait: wait.record.intent.wait,
        action: 'invalidate',
        evidence: state.source,
      },
    }),
    put({ kind: 'task', task: queueTask(command.operation, state.source) }),
  ]
  return { kind: 'commit', value: receipt, writes }
}

export function controlFinished(progress: ControlProgress): boolean {
  return (
    progress.kind === 'stopped' ||
    progress.kind === 'already-ended' ||
    progress.kind === 'rejected' ||
    progress.kind === 'relation-changed'
  )
}

export function decideRecordControl(
  snapshot: Snapshot,
  command: ProgressCommand,
  mint: Mint,
): Decision<ControlRecord> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const original = call.state.controls.find(item => item.operation === command.control)
  if (original === undefined || !sameFactValue(original.source, command.source))
    return reply(invalid('control', 'not-original-control'))
  if (controlFinished(original.progress)) {
    return sameFactValue(original.progress, command.progress)
      ? reply(succeed(original))
      : reply(fail({ kind: 'conflict', operation: command.control }))
  }
  const task = snapshot.tasks.find(
    item => item.kind === 'stop' && item.operation === command.control,
  )
  if (task?.kind !== 'stop' || !sameFactValue(task.control.start, call.start))
    return reply(invalid('control', 'not-original-execution'))
  if (command.progress.kind === 'relation-changed')
    return reply(invalid('progress', 'stop-cannot-change-relation'))
  const progress = command.progress
  const control: ControlRecord = { ...original, progress }
  const revised = withControls(
    call,
    call.state.controls.map(item => (item.operation === command.control ? control : item)),
    mint,
  )
  return {
    kind: 'commit',
    value: control,
    writes: [
      put({ kind: 'call', call: revised }),
      put(operationRecord(command, { kind: 'record-control', control }, mint)),
      controlFinished(control.progress)
        ? { kind: 'delete', key: taskKey(task) }
        : put({
            kind: 'task',
            task: {
              ...task,
              diagnostic: 'diagnostic' in control.progress ? control.progress.diagnostic : null,
            },
          }),
    ],
  }
}

/** A confirmed denial closes only propagation; execution and all other duties remain intact. */
export function rejectControl(
  call: CallRecord,
  original: ControlRecord,
  mint: Mint,
): Decision<ControlRecord> {
  const control: ControlRecord = {
    ...original,
    progress: {
      kind: 'rejected',
      reason: 'control-qualification-denied',
      evidence: mintEvidence(
        'operation',
        {
          tenant: call.tenant,
          call: call.call,
          operation: original.operation,
        },
        mint.revision,
        { control: original.source, reason: 'control-qualification-denied' },
      ),
    },
  }
  return {
    kind: 'commit',
    value: control,
    writes: [
      put({
        kind: 'call',
        call: withControls(
          call,
          call.state.controls.map(item => (item.operation === original.operation ? control : item)),
          mint,
        ),
      }),
      { kind: 'delete', key: taskKey({ kind: 'stop', operation: original.operation }) },
    ],
  }
}
