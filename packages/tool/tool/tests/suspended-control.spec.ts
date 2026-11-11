// 叫停暂停中的检查点调用（契约 P02、P06、P07；Tool SPEC 第 32 条）：真实 runtime、账本与推进协程，
// 非耐久记录仓，脚本化的决策方与按段执行的检查点绑定。三个位置：等待 opening 或 open 时暂停，
// 答复已接受而在排队，prepareResume 之后、恢复段 live 之前。
import { afterEach, describe, expect, it } from 'vitest'
import type { DurableEvidence, ToolWaitId } from '@omne-harness/tool-contract'
import type { DecisionValue } from '@omne-harness/tool-contract'
import { mintEvidence } from '../src/evidence.ts'
import { invalidationOperation } from '../src/ledger-control.ts'
import { CHECKPOINT_STATE_KEY, taskKey, WAIT_REQUEST_KEY } from '../src/ledger-store.ts'
import {
  asking,
  askingAuthor,
  checkpointBinding,
  CLOSED_RESULT,
  scriptedBridge,
  type BridgeScript,
  type Segment,
} from './checkpoint-values.ts'
import {
  admittedCallSnapshot,
  decideStop,
  runningCallSnapshot,
  STOP as STOP_INTENT,
  STOP_OPERATION,
  SUBJECT,
} from './control-decider-values.ts'
import {
  committed,
  invalidOf,
  mintOf,
  putsOf,
  replied,
  snapshotOfCall,
  suspendedCall,
  withCall,
  withState,
  withSuspensions,
  withWait,
  withWaitRecord,
  afterCommit,
  continued,
  FIRST as FIRST_WAIT,
  type CallSnapshot,
  type Record_,
} from './resumption-decider-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  testAuthority,
  type StartOptions,
} from './start-values.ts'

afterEach(auditQueues)

/** `c1` 的第一个等待：首次 start 是 `op-c1/start`，等待身份由 start 派生。 */
const FIRST = 'op-c1/start/wait' as ToolWaitId
const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
const STOP = { ...ACCESS, operation: operationId('stop-c1'), intent: { kind: 'stop' } } as const

function text(value: string) {
  return { kind: 'string', value } as const
}

function setup(
  options: StartOptions & {
    script?: BridgeScript
    initial?: () => Promise<Segment>
  } = {},
) {
  const authority = testAuthority()
  const author = askingAuthor(options.initial)
  const checkpoint = checkpointBinding(authority, author)
  const bridge = scriptedBridge(options.script ?? 'registers')
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    ...options,
  })
  return { harness, checkpoint, bridge, author }
}

type Built = ReturnType<typeof setup>

/** 运行推进协程调度的工作，直到连续几轮没有新调度。 */
async function settle(harness: Built['harness']): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

async function recovery(harness: Built['harness']) {
  return ok(await harness.commands.loadRecovery(ACCESS))
}

/** `c1` 受理后运行到第一个等待，并按脚本登记。 */
async function suspended(options: Parameters<typeof setup>[0] = {}) {
  const built = setup(options)
  await admitCall(built.harness, 'c1')
  await built.harness.drive('c1')
  await settle(built.harness)
  expect((await built.harness.state('c1')).phase).toBe('suspended')
  return built
}

/** 叫停之后再推进一次 `c1`：失效与释放两项待办由协程完成。 */
async function driveAfterStop(built: Built): Promise<void> {
  await built.harness.drive('c1')
  await settle(built.harness)
}

/** 叫停提交写下的调用记录：已收场、等待已关闭、两项待办已写。 */
async function expectSettledByStop(built: Built) {
  const read = await recovery(built.harness)
  expect(read.state).toMatchObject({
    phase: 'settled',
    relation: 'foreground',
    terminal: {
      kind: 'interrupted',
      cause: { kind: 'control', operation: 'stop-c1', withdrawn: false },
    },
    execution: { kind: 'suspended' },
    wait: { kind: 'none' },
  })
  expect(read.waits).toMatchObject([{ phase: 'closed', cause: 'cancelled' }])
  expect(read.controls).toMatchObject([
    { operation: 'stop-c1', progress: { kind: 'already-ended' } },
  ])
  expect(
    read.tasks.flatMap(task =>
      task.kind === 'wait-registration' || task.kind === 'queue' || task.kind === 'suspend'
        ? [[task.kind, task.operation, 'action' in task ? task.action : null]]
        : [],
    ),
  ).toEqual(
    expect.arrayContaining([
      ['wait-registration', `${FIRST}/invalidate`, 'invalidate'],
      ['queue', 'stop-c1', null],
    ]),
  )
  expect(
    read.tasks.filter(task => task.kind === 'wait-registration' || task.kind === 'queue'),
  ).toHaveLength(2)
  expect(read.tasks.map(task => task.kind)).not.toContain('suspend')
  return read
}

/**
 * 两项待办完成之后：失效带着收场状态的证据经决策方执行一次，条目已删、墓碑在，调用没有剩下的失效或
 * 释放待办。
 */
async function expectInvalidatedAndReleased(built: Built, terminal: DurableEvidence) {
  const { harness, bridge } = built
  const read = await recovery(harness)
  expect(bridge.invalidated).toEqual([{ operation: `${FIRST}/invalidate`, wait: FIRST, terminal }])
  expect(
    read.tasks.filter(task => task.kind === 'wait-registration' || task.kind === 'queue'),
  ).toEqual([])
  expect(await harness.queue()).toEqual([])
  expect(await harness.released('c1')).toBe(true)
}

describe('a stop of a call suspended on its wait', () => {
  it('settles the call parked on its open wait, invalidates the registration once and frees the queue place', async () => {
    const built = await suspended({ queueCapacity: 1 })
    const { harness } = built
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])
    // 停泊的条目仍计入 queueCapacity。
    await expect(admitCall(harness, 'c2')).rejects.toThrow('tool-queue')

    const receipt = ok(await harness.commands.control(STOP))
    expect(receipt.progress.kind).toBe('already-ended')
    expect(receipt.state.phase).toBe('settled')
    // 同一操作重送认回原回执。
    expect(ok(await harness.commands.control(STOP))).toEqual(receipt)
    await expectSettledByStop(built)

    await driveAfterStop(built)
    await expectInvalidatedAndReleased(built, receipt.state.source)
    // 名额回到范围：容量为 1 的范围又能受理。
    await admitCall(harness, 'c2')
  })

  it('settles the call whose wait is still opening, and drops its registration duty', async () => {
    const built = await suspended({ script: 'refuses' })
    const before = await recovery(built.harness)
    expect(before.waits).toMatchObject([{ phase: 'opening' }])
    expect(before.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'wait-registration', action: 'ensure', state: 'blocked' }),
      ]),
    )

    ok(await built.harness.commands.control(STOP))
    const read = await expectSettledByStop(built)
    expect(
      read.tasks.filter(task => task.kind === 'wait-registration' && task.action === 'ensure'),
    ).toEqual([])

    await driveAfterStop(built)
    await expectInvalidatedAndReleased(built, read.state.source)
    // 登记只试过一次：叫停之后不再登记。
    expect(built.bridge.ensured).toHaveLength(1)
  })

  it('recalls an invalidation whose answer was lost through inspectOperation, and never invalidates again', async () => {
    const built = await suspended()
    built.bridge.invalidation('answer-lost')
    const receipt = ok(await built.harness.commands.control(STOP))
    await driveAfterStop(built)
    await driveAfterStop(built)
    expect(built.bridge.inspected).toEqual([`${FIRST}/invalidate`])
    await expectInvalidatedAndReleased(built, receipt.state.source)
  })

  it('settles with withdrawn: true on a withdraw of either reach, and refuses to move the asking call to the background', async () => {
    const built = await suspended()
    const { harness } = built
    const background = await harness.commands.control({
      ...ACCESS,
      operation: operationId('background-c1'),
      intent: { kind: 'background' },
    })
    expect(background).toEqual({
      failure: { kind: 'invalid', field: 'intent', reason: 'ask-wait-cannot-background' },
    })
    expect((await harness.state('c1')).phase).toBe('suspended')

    const withdrawn = ok(
      await harness.commands.control({
        ...ACCESS,
        operation: operationId('withdraw-c1'),
        intent: { kind: 'withdraw', reach: 'foreground-and-unadmitted' },
      }),
    )
    expect(withdrawn.state).toMatchObject({
      phase: 'settled',
      terminal: {
        kind: 'interrupted',
        cause: { kind: 'control', operation: 'withdraw-c1', withdrawn: true },
      },
    })
    await driveAfterStop(built)
    expect(await harness.queue()).toEqual([])
    expect(built.bridge.invalidated).toHaveLength(1)
  })
})

describe('a stop of a call whose decision was accepted', () => {
  it('settles the call queued for its slot: the resume segment never runs and the ready entry is released', async () => {
    let calls = 0
    // c1 暂停在等待上，c2 的首段一直运行，占着工具唯一的名额。
    const built = await suspended({
      initial: () => {
        calls += 1
        return calls === 1
          ? Promise.resolve(asking('{"asked":"which file?"}'))
          : new Promise<Segment>(() => {})
      },
    })
    const { harness, bridge, checkpoint, author } = built
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    await settle(harness)
    expect((await harness.state('c2')).phase).toBe('running')
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') } satisfies DecisionValue)
    await harness.drive('c1')
    await settle(harness)
    // 答复已接受，条目重新排队却取不到名额：调用仍暂停，等待 responding。
    const queued = await recovery(harness)
    expect(queued.waits).toMatchObject([{ phase: 'responding' }])
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '3', stage: 'ready' },
      { call: 'c2', ordinal: '2', stage: 'held' },
    ])

    ok(await harness.commands.control(STOP))
    await expectSettledByStop(built)
    await driveAfterStop(built)
    expect(checkpoint.segments).toEqual(['op-c1/start', 'op-c2/start'])
    expect(author.resumed).toEqual([])
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'held' }])
    expect(await harness.released('c1')).toBe(true)
    expect(bridge.invalidated).toHaveLength(1)
  })

  it('settles the call after the acceptance; a later resume of its checkpoint is refused', async () => {
    const built = await suspended()
    const { harness, bridge, checkpoint, author } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    ok(
      await harness.commands.acceptDecision({
        ...ACCESS,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
    )
    ok(await harness.commands.control(STOP))
    const read = await expectSettledByStop(built)
    // 接受写下的 queue 待办由释放待办取代。
    expect(read.tasks.filter(task => task.kind === 'queue').map(task => task.operation)).toEqual([
      'stop-c1',
    ])
    const resumed = await harness.commands.prepareResume({
      ...ACCESS,
      instance: read.execution?.instance as never,
      generation: '1',
      operation: operationId(`${FIRST}/resume`),
      expected: read.state.revision,
      checkpoint: evidence('checkpoint/op-c1/start', 'test-host'),
    })
    expect(resumed).toMatchObject({ failure: { kind: 'invalid', reason: 'phase:settled' } })
    await driveAfterStop(built)
    expect(checkpoint.segments).toEqual(['op-c1/start'])
    expect(author.resumed).toEqual([])
    await expectInvalidatedAndReleased(built, read.state.source)
  })
})

describe('a stop between prepareResume and the live resume segment', () => {
  it('is kept as a pending stop of the resume record and reaches the segment once it is live', async () => {
    const stopped: unknown[] = []
    const built = await suspended({
      commands: base => ({
        ...base,
        prepareResume: async input => {
          const prepared = await base.prepareResume(input)
          if ('ok' in prepared && stopped.length === 0) stopped.push(await base.control(STOP))
          return prepared
        },
      }),
    })
    const { harness, bridge, checkpoint } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    await harness.drive('c1')
    await settle(harness)
    // 叫停在 starting 提交：不收场，保存 pending 的停止与 stop 待办，指向恢复记录。
    expect(stopped).toMatchObject([
      { ok: { progress: { kind: 'pending' }, state: { phase: 'starting' } } },
    ])
    expect(checkpoint.stops.map(stop => [stop.operation, stop.start.operation])).toEqual([
      ['stop-c1', `${FIRST}/resume`],
    ])
    const read = await recovery(harness)
    expect(read.controls).toMatchObject([
      { operation: 'stop-c1', progress: { kind: 'already-ended' } },
    ])
    expect(read.tasks.map(task => task.kind)).not.toContain('stop')
  })
})

// 下面的用例把真实运行里读下来的快照直接交给 decideControl：账本在事务里按事务快照再判一次，
// 所以每个定义域分支与拒绝分支都要逐个确认——拒绝的种类与原因、什么都不写、提交时写下的记录。
const UNSUPPORTED = {
  kind: 'unsupported',
  reason: expect.stringContaining('a stop of a started or resuming invocation'),
}

function callOf(snapshot: CallSnapshot) {
  if (snapshot.call === null) throw new Error('the snapshot has no call')
  return snapshot.call
}

function adoptionOf(snapshot: CallSnapshot) {
  return callOf(snapshot).request.availability.definition.adoption
}

describe('decideControl: a stop of a call that is not suspended', () => {
  it('keeps a pending stop of a live call: the call records it, and a stop duty carries the dispatch to the segment', async () => {
    const snapshot = await runningCallSnapshot()
    const call = callOf(snapshot)
    expect(call.state.execution.kind).toBe('live')
    const mint = mintOf(snapshot)
    const decision = committed(decideStop(snapshot))
    const source = mintEvidence(
      'operation',
      { tenant: tenantA, call: call.call, operation: STOP_OPERATION },
      mint.revision,
      { intent: STOP_INTENT, start: call.start, subject: SUBJECT },
    )
    const progress = { kind: 'pending', diagnostic: 'stop-not-dispatched' }
    expect(decision.value).toMatchObject({ operation: STOP_OPERATION, progress })
    expect(decision.value.state).toMatchObject({ phase: 'running', revision: mint.revision })
    const [saved] = putsOf(decision.writes, 'call') as unknown as [{ call: { state: Record_ } }]
    expect(saved.call.state.controls).toEqual([
      { operation: STOP_OPERATION, intent: STOP_INTENT, source, progress },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      {
        operation: {
          operation: STOP_OPERATION,
          inputDigest: 'digest-control',
          receipt: { kind: 'control', control: decision.value, subject: SUBJECT },
        },
      },
    ])
    expect(putsOf(decision.writes, 'task')).toEqual([
      {
        kind: 'task',
        task: {
          kind: 'stop',
          operation: STOP_OPERATION,
          state: 'pending',
          diagnostic: null,
          control: {
            tenant: tenantA,
            call: call.call,
            operation: STOP_OPERATION,
            adoption: call.start?.executor,
            inputDigest: 'digest-control',
            start: call.start,
            intent: STOP_INTENT,
            source,
          },
        },
      },
    ])
    expect(decision.writes).toHaveLength(3)
  })

  it('records already-ended on the state of a call whose execution ended, and owes no stop duty', async () => {
    const snapshot = await runningCallSnapshot()
    const ended = withState(snapshot, { execution: { kind: 'ended', evidence: evidence('ended') } })
    const decision = committed(decideStop(ended))
    expect(decision.value.progress).toEqual({
      kind: 'already-ended',
      evidence: callOf(ended).state.source,
    })
    expect(putsOf(decision.writes, 'task')).toEqual([])
    expect(putsOf(decision.writes, 'call')).toHaveLength(1)
    expect(putsOf(decision.writes, 'operation')).toHaveLength(1)
    expect(decision.writes).toHaveLength(2)
  })

  it('keeps a pending stop of a resume segment that is prepared and not yet live', async () => {
    const snapshot = await runningCallSnapshot()
    const call = callOf(snapshot)
    const preparing = withCall(
      withState(snapshot, { execution: { kind: 'starting', start: call.start?.operation } }),
      record => ({
        ...record,
        start: { ...(record.start as Record_), kind: 'resume', checkpoint: evidence('checkpoint') },
      }),
    )
    const decision = committed(decideStop(preparing))
    expect(decision.value.progress).toEqual({ kind: 'pending', diagnostic: 'stop-not-dispatched' })
    expect(putsOf(decision.writes, 'task')).toMatchObject([
      { task: { kind: 'stop', control: { start: { kind: 'resume' } } } },
    ])
  })

  it('answers an unknown call with invalid, and writes nothing', async () => {
    const snapshot = await runningCallSnapshot()
    expect(replied(decideStop({ ...snapshot, call: null }))).toEqual(
      invalidOf('call', 'unknown-call'),
    )
  })

  describe.each([
    ['background', { kind: 'background' }],
    ['withdraw', { kind: 'withdraw', reach: 'foreground-and-unadmitted' }],
  ] as const)('a %s of a live call', (_name, intent) => {
    it('is unsupported: only a stop reaches a started invocation', async () => {
      const snapshot = await runningCallSnapshot()
      expect(replied(decideStop(snapshot, intent))).toEqual({
        failure: { ...UNSUPPORTED, adoption: adoptionOf(snapshot) },
      })
    })
  })

  it('is unsupported for a stop of a call that has no start record', async () => {
    const snapshot = await admittedCallSnapshot()
    expect(callOf(snapshot).start).toBeNull()
    expect(replied(decideStop(snapshot))).toEqual({
      failure: { ...UNSUPPORTED, adoption: adoptionOf(snapshot) },
    })
  })

  it.each([
    ['a first start that is recorded and not yet live', 'start', 'starting'],
    ['a resume segment whose execution is unknown', 'resume', 'unknown'],
    ['a resume segment whose execution is lost', 'resume', 'lost'],
    ['a first start whose execution is unknown', 'start', 'unknown'],
  ] as const)('is unsupported for a stop of %s', async (_name, start, execution) => {
    const snapshot = await runningCallSnapshot()
    const call = callOf(snapshot)
    const edited = withCall(
      withState(snapshot, {
        execution:
          execution === 'lost'
            ? { kind: 'lost', evidence: evidence('lost') }
            : { kind: execution, start: call.start?.operation },
      }),
      record => ({
        ...record,
        start:
          start === 'resume'
            ? { ...(record.start as Record_), kind: 'resume', checkpoint: evidence('checkpoint') }
            : record.start,
      }),
    )
    expect(replied(decideStop(edited))).toEqual({
      failure: { ...UNSUPPORTED, adoption: adoptionOf(edited) },
    })
  })
})

describe('decideControl: a stop of a call suspended on its wait', () => {
  it('settles the call in one commit: interrupted by the control, the wait closed, the invalidation and the release owed', async () => {
    const { harness } = await suspendedCall()
    const snapshot = await snapshotOfCall(harness)
    const call = callOf(snapshot)
    const mint = mintOf(snapshot)
    const decision = committed(decideStop(snapshot))
    const exclusion = [...snapshot.suspensions.values()][0]?.checkpoint?.exclusion
    const source = mintEvidence(
      'operation',
      { tenant: tenantA, call: call.call, operation: STOP_OPERATION },
      mint.revision,
      { intent: STOP_INTENT, start: call.start, subject: SUBJECT },
    )
    const progress = { kind: 'already-ended', evidence: exclusion }
    expect(decision.value).toMatchObject({ operation: STOP_OPERATION, progress })
    expect(decision.value.state).toMatchObject({
      phase: 'settled',
      relation: 'foreground',
      terminal: {
        kind: 'interrupted',
        cause: { kind: 'control', operation: STOP_OPERATION, withdrawn: false },
      },
      effect: { kind: 'unknown', diagnostic: 'suspended-segments-effect-unreported' },
      wait: { kind: 'none' },
      revision: mint.revision,
    })
    const state = decision.value.state
    expect(state.controls.at(-1)).toEqual({
      operation: STOP_OPERATION,
      intent: STOP_INTENT,
      source,
      progress,
    })
    // 终局的结果由账本自己造，没有执行者的原件。文字是作者为「等待被关闭」预写的那一份。
    expect(putsOf(decision.writes, 'result')).toMatchObject([
      { result: { custody: { kind: 'synthetic' }, settledBy: STOP_OPERATION } },
    ])
    expect(JSON.stringify(putsOf(decision.writes, 'result'))).toContain(CLOSED_RESULT)
    expect(putsOf(decision.writes, 'wait')).toMatchObject([
      { wait: { record: { phase: 'closed', cause: 'cancelled', evidence: source } } },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      { operation: { receipt: { kind: 'control', control: decision.value, subject: SUBJECT } } },
    ])
    const owed = (putsOf(decision.writes, 'task') as unknown as { task: Record_ }[])
      .map(entry => entry.task)
      .filter(task => task.kind === 'wait-registration' || task.kind === 'queue')
    expect(owed).toEqual([
      {
        kind: 'wait-registration',
        operation: invalidationOperation(FIRST_WAIT),
        state: 'pending',
        diagnostic: null,
        wait: FIRST_WAIT,
        action: 'invalidate',
        evidence: state.source,
      },
      {
        kind: 'queue',
        operation: STOP_OPERATION,
        state: 'pending',
        diagnostic: null,
        basis: state.source,
      },
    ])
  })

  it('answers invalid when the call state says suspended but its execution is not', async () => {
    const { harness } = await suspendedCall()
    const snapshot = await snapshotOfCall(harness)
    const live = withState(snapshot, { execution: { kind: 'live', start: 'op-c1/start' } })
    expect(replied(decideStop(live))).toEqual(invalidOf('call', 'not-suspended'))
  })

  describe('the checkpoint the suspension committed', () => {
    it('refuses a call whose suspensions committed no checkpoint, or another one', async () => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const refused = invalidOf('checkpoint', 'not-committed-by-suspend')
      expect(replied(decideStop({ ...snapshot, suspensions: new Map() }))).toEqual(refused)
      const unproved = withSuspensions(snapshot, entries =>
        entries.map(([key, entry]) => [key, { ...entry, checkpoint: null }]),
      )
      expect(replied(decideStop(unproved))).toEqual(refused)
      const other = withSuspensions(snapshot, entries =>
        entries.map(([key, entry]) => [
          key,
          {
            ...entry,
            checkpoint: {
              ...(entry.checkpoint as Record_),
              payload: evidence('another-checkpoint'),
            },
          },
        ]),
      )
      expect(replied(decideStop(other))).toEqual(refused)
    })

    it('refuses a call that has no start record, even with its checkpoint committed', async () => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const bare = withCall(snapshot, record => ({ ...record, start: null }))
      expect(replied(decideStop(bare))).toEqual(invalidOf('checkpoint', 'not-committed-by-suspend'))
    })

    it('skips a suspension that committed nothing and finds the one the call state names', async () => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const planned = withSuspensions(snapshot, entries => [
        ['op-planned-only', { ...entries[0]?.[1], checkpoint: null }],
        ...entries,
      ])
      committed(decideStop(planned))
    })
  })

  describe('the wait the stop closes', () => {
    it('refuses a call without an unclosed wait', async () => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const closed = withWaitRecord(snapshot, FIRST_WAIT, {
        phase: 'closed',
        cause: 'continued',
        evidence: evidence('closed'),
      })
      expect(replied(decideStop(closed))).toEqual(invalidOf('wait', 'no-current-wait'))
    })

    it('refuses a wait whose identity cannot name an invalidation operation', async () => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const named = withWait(snapshot, FIRST_WAIT, found => ({
        ...found,
        record: {
          ...(found.record as Record_),
          intent: { ...((found.record as Record_).intent as Record_), wait: 'a wait with spaces' },
        },
      }))
      expect(replied(decideStop(named))).toEqual(invalidOf('wait', 'no-invalidation-operation'))
    })

    it('closes the unclosed wait of a call that waited twice, and asks to invalidate that one', async () => {
      const built = await suspendedCall({
        resume: (_input, count) =>
          Promise.resolve(
            count === 1
              ? asking('{"asked":"which line?"}', 'which line?')
              : { ok: { kind: 'completed', value: 'done' } },
          ) as never,
      })
      await continued(built, { kind: 'declined' })
      const snapshot = await snapshotOfCall(built.harness)
      expect(snapshot.waits.size).toBe(2)
      const open = [...snapshot.waits.values()].filter(wait => wait.record.phase !== 'closed')
      expect(open).toHaveLength(1)
      const openWait = open[0]?.record.intent.wait as string
      // 第一个等待已被答复关闭，叫停关的是第二个。
      expect(openWait).not.toBe(FIRST_WAIT)
      const decision = committed(decideStop(snapshot))
      expect(putsOf(decision.writes, 'wait')).toMatchObject([
        { wait: { record: { intent: { wait: openWait }, phase: 'closed', cause: 'cancelled' } } },
      ])
      expect(putsOf(decision.writes, 'task')).toContainEqual({
        kind: 'task',
        task: expect.objectContaining({
          kind: 'wait-registration',
          wait: openWait,
          operation: invalidationOperation(openWait),
        }),
      })
    })
  })

  describe('the timing of the call', () => {
    const segment = {
      operation: operationId('op-c1/start'),
      source: 'clock',
      epoch: '1',
      marker: evidence('marker'),
    }
    it.each([
      ['paused', { kind: 'paused', accumulatedMs: '7' }, { kind: 'closed', accumulatedMs: '7' }],
      ['closed', { kind: 'closed', accumulatedMs: '9' }, { kind: 'closed', accumulatedMs: '9' }],
      [
        'running',
        { kind: 'running', accumulatedMs: '3', segment },
        { kind: 'running', accumulatedMs: '3', segment },
      ],
      [
        'unknown',
        { kind: 'unknown', accumulatedMs: '4', segment, diagnostic: 'clock lost' },
        { kind: 'unknown', accumulatedMs: '4', segment, diagnostic: 'clock lost' },
      ],
    ])(
      'closes a %s timing with its accumulated time; any other timing stays as it was',
      async (_name, timing, expected) => {
        const { harness } = await suspendedCall()
        const snapshot = await snapshotOfCall(harness)
        const decision = committed(decideStop(withState(snapshot, { timing })))
        expect(decision.value.state.timing).toEqual(expected)
      },
    )
  })

  describe('the queue position of the call', () => {
    const released = (position: Record_, exclusion: unknown) => ({
      ...position,
      kind: 'released',
      evidence: exclusion,
    })
    it.each(['held', 'waiting'])(
      'releases a %s position on the evidence of the exclusion, keeping its place in the line',
      async kind => {
        const { harness } = await suspendedCall()
        const snapshot = await snapshotOfCall(harness)
        const exclusion = [...snapshot.suspensions.values()][0]?.checkpoint?.exclusion
        const position = { kind, key: 'scope-key', ordinal: '4' }
        const decision = committed(decideStop(withState(snapshot, { queue: position })))
        expect(decision.value.state.queue).toEqual(released(position, exclusion))
      },
    )

    it.each([
      ['none', { kind: 'none' }],
      [
        'released',
        { kind: 'released', key: 'scope-key', ordinal: '4', evidence: evidence('gone') },
      ],
    ])('leaves a %s position as it was', async (_name, position) => {
      const { harness } = await suspendedCall()
      const snapshot = await snapshotOfCall(harness)
      const decision = committed(decideStop(withState(snapshot, { queue: position })))
      expect(decision.value.state.queue).toEqual(position)
    })
  })

  it('replaces the duties of the queue, the park and the registration of the wait, and keeps every other duty', async () => {
    const { harness } = await suspendedCall()
    const snapshot = await snapshotOfCall(harness)
    const base = { state: 'pending', diagnostic: null }
    const duty = (kind: string, operation: string, more: Record_ = {}) =>
      ({ kind, operation: operationId(operation), ...base, ...more }) as never
    const old = [
      duty('queue', 'op-old-queue', { basis: evidence('basis') }),
      duty('suspend', 'op-old-suspend', { suspension: {} }),
      duty('wait-registration', 'op-old-ensure', { wait: FIRST_WAIT, action: 'ensure' }),
    ]
    const kept = [
      duty('wait-registration', 'op-kept-invalidate', { wait: FIRST_WAIT, action: 'invalidate' }),
      duty('deliver', 'op-kept-deliver', {}),
      duty('facts', 'op-kept-facts', { basis: evidence('basis') }),
      // 另一种等待的登记待办不是这次叫停取代的：只有 Ask 等待的登记待办被取代。
      duty('resource-wait', 'op-kept-resource', { action: 'ensure', evidence: evidence('basis') }),
    ]
    const crowded = { ...snapshot, tasks: [...old, ...kept] }
    const decision = committed(decideStop(crowded))
    const deleted = decision.writes.flatMap(write => (write.kind === 'delete' ? [write.key] : []))
    // 收场的提交同时删掉调用为暂停保存的两样内容：检查点状态与等待的请求原文。
    expect(deleted.sort()).toEqual(
      [...old.map(task => taskKey(task)), CHECKPOINT_STATE_KEY, WAIT_REQUEST_KEY].sort(),
    )
  })

  it('records a withdraw as withdrawn, and refuses to send the asking call to the background', async () => {
    const { harness } = await suspendedCall()
    const snapshot = await snapshotOfCall(harness)
    const withdraw = { kind: 'withdraw', reach: 'foreground-and-unadmitted' } as const
    const decision = committed(decideStop(snapshot, withdraw))
    expect(decision.value.state).toMatchObject({
      terminal: { cause: { kind: 'control', withdrawn: true } },
    })
    expect(replied(decideStop(snapshot, { kind: 'background' }))).toEqual(
      invalidOf('intent', 'ask-wait-cannot-background'),
    )
  })

  it('answers a resend of a committed stop with its receipt, and another input with a conflict', async () => {
    const { harness } = await suspendedCall()
    const snapshot = await snapshotOfCall(harness)
    const first = committed(decideStop(snapshot))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decideStop(after))).toEqual({ ok: first.value })
    expect(replied(decideStop(after, STOP_INTENT, { inputDigest: 'digest-other' }))).toEqual({
      failure: { kind: 'conflict', operation: STOP_OPERATION },
    })
  })
})
