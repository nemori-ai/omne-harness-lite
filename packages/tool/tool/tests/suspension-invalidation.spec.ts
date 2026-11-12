// 推进协程对已收场调用的失效待办（契约 P06 invalidate）：失效操作的身份由调用与等待派生，回包不确定时按
// 原操作经 inspectOperation 认回而不换身份重发，`excluded` 证明原失效不会落地所以同一身份可以再发，决策方明确
// 拒绝时待办记为阻塞并保留原因，终局不变。两部分：
// - 单步：驱动器的一步在决策方与账本命令的替身上直接运行，逐个回答确认这一步答的 Result、对决策方的调用、
//   记下的任务结局；
// - 真实运行：叫停之后的失效待办在真实 runtime、账本与推进协程上执行，读账本里的待办与决策方收到的调用。
// 替身不证明真实决策方、耐久或跨进程。
import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure, ToolWaitId } from '@omne-harness/tool-contract'
import type { ExternalOperationResolution } from '@omne-harness/tool-contract/provider'
import { createSuspensionDriver } from '../src/driver-suspension.ts'
import { askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import {
  callId,
  evidence,
  instanceId,
  ok,
  operationId,
  principalA,
  tenantA,
} from './runtime-values.ts'
import { admitCall, auditQueues, startHarness, testAuthority } from './start-values.ts'

afterEach(auditQueues)

const WAIT = 'op-c1/start/wait' as ToolWaitId
const INVALIDATION = `${WAIT}/invalidate`
const TERMINAL = evidence('terminal-of-the-call')
const RECEIPT = evidence('invalidated/receipt', 'test-decisions')

const CONTINUE = { kind: 'continue', progressed: true }
const STALLED = { kind: 'continue', progressed: false }

const INVALIDATION_SUFFIX = '/invalidate'.length

const refusal = (failure: ToolFailure): Outcome<never, ToolFailure> => fail(failure)
const DENIED: ToolFailure = { kind: 'denied', action: 'invalidate-wait' }

/** 决策方对失效回包丢失：不知道有没有落地。 */
const lost = (): Outcome<never, ToolFailure> =>
  fail({ kind: 'commit-unknown', operation: operationId(INVALIDATION) })
const unavailable = fail({
  kind: 'unavailable',
  dependency: 'test-decisions',
  diagnostic: 'not yet',
}) as Outcome<never, ToolFailure>
const resolution = (kind: ExternalOperationResolution['kind'], diagnostic = 'cannot tell') =>
  succeed(
    kind === 'committed'
      ? { kind, operation: operationId(INVALIDATION), receipt: RECEIPT }
      : kind === 'excluded'
        ? { kind, operation: operationId(INVALIDATION), exclusion: evidence('excluded') }
        : { kind, operation: operationId(INVALIDATION), diagnostic },
  )

type Answers = Readonly<{
  /** 决策方对第 n 次失效的回答。 */
  invalidate?: (n: number) => Outcome<DurableEvidence, ToolFailure>
  /** 决策方对第 n 次 inspectOperation 的回答。 */
  inspect?: (n: number) => Outcome<ExternalOperationResolution, ToolFailure>
  /** 账本对第 n 次 recordTask 的回答。 */
  record?: (n: number) => Outcome<unknown, ToolFailure>
}>

type TaskOptions = Readonly<{ wait?: string; state?: 'pending' | 'blocked'; action?: string }>

/** 驱动器的一步，接在记下每次调用的替身端口上。 */
function stepOf(answers: Answers = {}) {
  const invalidated: unknown[] = []
  const inspected: unknown[] = []
  const recorded: Record<string, unknown>[] = []
  const decisions = {
    invalidate: (input: unknown) => {
      invalidated.push(input)
      return Promise.resolve(answers.invalidate?.(invalidated.length) ?? succeed(RECEIPT))
    },
    inspectOperation: (input: unknown) => {
      inspected.push(input)
      return Promise.resolve(answers.inspect?.(inspected.length) ?? resolution('committed'))
    },
  }
  const commands = {
    recordTask: (input: Record<string, unknown>) => {
      recorded.push(input)
      return Promise.resolve(answers.record?.(recorded.length) ?? succeed(undefined))
    },
  }
  const driver = createSuspensionDriver(
    { commands, bindings: {}, decisions, queues: {} } as never,
    () => ({ instance: instanceId, generation: '1' }) as never,
    () => Promise.resolve(),
  )
  const step = {
    principal: principalA,
    tenant: tenantA,
    call: callId('c1'),
    instance: instanceId,
    signal: new AbortController().signal,
  }
  const taskOf = (options: TaskOptions = {}) => {
    const wait = options.wait ?? WAIT
    return {
      kind: 'wait-registration',
      operation: operationId(`${wait}/invalidate`),
      state: options.state ?? 'pending',
      diagnostic: null,
      wait,
      action: options.action ?? 'invalidate',
      evidence: TERMINAL,
    } as never
  }
  /** 调用的恢复信息：处于给定阶段，等待 `wait` 已被控制关闭（`closed` 另给时按所给）。 */
  const recoveryIn = (
    phase: string,
    closed: object = { phase: 'closed', cause: 'cancelled' },
    wait: string = WAIT,
  ) => ({ state: { phase }, waits: [{ intent: { wait }, ...closed }] }) as never
  /** 这一步此刻欠下的工作；调用已收场，等待没有别的步骤。 */
  const run = (task = taskOf(), phase = 'settled') => {
    const { wait } = task as { wait: string }
    const next = driver.registration(step as never, recoveryIn(phase, undefined, wait), task)
    if (next === null) throw new Error('the task owes no step now')
    return next()
  }
  return { driver, step, taskOf, recoveryIn, run, invalidated, inspected, recorded }
}

describe('the step of an invalidation duty: which task owes it now', () => {
  it.each([
    ['an invalidation of a settled call', 'pending', 'invalidate', 'settled', true],
    [
      'an invalidation of a call that is not settled yet',
      'pending',
      'invalidate',
      'suspended',
      false,
    ],
    ['an invalidation of a running call', 'pending', 'invalidate', 'running', false],
    ['an invalidation that is blocked', 'blocked', 'invalidate', 'settled', false],
    ['a registration of a suspended call', 'pending', 'ensure', 'suspended', true],
    ['a registration of a settled call', 'pending', 'ensure', 'settled', false],
    ['a registration that is blocked', 'blocked', 'ensure', 'suspended', false],
  ] as const)('%s', (_name, state, action, phase, owed) => {
    const { driver, step, taskOf, recoveryIn } = stepOf()
    const next = driver.registration(step as never, recoveryIn(phase), taskOf({ state, action }))
    expect(next !== null).toBe(owed)
  })
})

describe('the cause an invalidation carries', () => {
  it('is how the wait of the duty closed: by a control, or by the end of the original execution', async () => {
    for (const cause of ['cancelled', 'terminal'] as const) {
      const { driver, step, taskOf, recoveryIn, invalidated } = stepOf()
      const next = driver.registration(
        step as never,
        recoveryIn('settled', { phase: 'closed', cause }),
        taskOf(),
      )
      await next?.()
      expect(invalidated).toMatchObject([{ cause }])
    }
  })

  it('owes no step while the wait is not closed, or closed by its continuation', () => {
    const { driver, step, taskOf, recoveryIn } = stepOf()
    for (const closed of [{ phase: 'open' }, { phase: 'closed', cause: 'continued' }])
      expect(driver.registration(step as never, recoveryIn('settled', closed), taskOf())).toBeNull()
  })
})

describe('an invalidation the decision owner answers', () => {
  it('records the duty done on the receipt, under an operation derived from the invalidation', async () => {
    const { run, invalidated, inspected, recorded } = stepOf()
    expect(await run()).toEqual(CONTINUE)
    expect(invalidated).toEqual([
      {
        principal: principalA,
        tenant: tenantA,
        call: callId('c1'),
        operation: INVALIDATION,
        wait: WAIT,
        terminal: TERMINAL,
        cause: 'cancelled',
      },
    ])
    expect(inspected).toEqual([])
    expect(recorded).toEqual([
      {
        principal: principalA,
        tenant: tenantA,
        call: callId('c1'),
        operation: `${INVALIDATION}/done`,
        task: expect.objectContaining({ operation: INVALIDATION, action: 'invalidate' }),
        resolution: { kind: 'done', evidence: RECEIPT },
      },
    ])
  })

  it.each([
    ['a commit whose answer is unknown', fail({ kind: 'commit-unknown', operation: 'x' }), STALLED],
    ['a revision that went stale', fail({ kind: 'stale-revision', current: '1' }), STALLED],
  ] as const)(
    'goes on after %s of the record: nothing is known yet, and the step is read again',
    async (_name, answer, expected) => {
      const { run } = stepOf({ record: () => answer as never })
      expect(await run()).toEqual(expected)
    },
  )

  it('stops the run on a record that the ledger refuses', async () => {
    const refused = { kind: 'invalid', field: 'task', reason: 'not-pending' } as const
    const { run } = stepOf({ record: () => fail(refused) })
    expect(await run()).toEqual({ kind: 'failed', failure: refused })
  })

  it('does not record a duty whose done operation cannot be named', async () => {
    // 失效操作 252 个字符：`/done` 之后超出 256 的上限。
    const wait = `w${'x'.repeat(252 - INVALIDATION_SUFFIX - 1)}`
    const { run, taskOf, recorded } = stepOf()
    const result = await run(taskOf({ wait }))
    expect(result).toMatchObject({
      kind: 'failed',
      failure: { kind: 'invalid', field: 'operation' },
    })
    expect(recorded).toEqual([])
  })
})

describe('an invalidation whose answer is not certain', () => {
  it.each([
    ['commit-unknown', lost()],
    ['unavailable', unavailable],
  ])(
    'asks the owner about the original operation after %s, and records the duty done on its receipt',
    async (_name, answer) => {
      const { run, invalidated, inspected, recorded } = stepOf({
        invalidate: () => answer as never,
      })
      expect(await run()).toEqual(CONTINUE)
      expect(invalidated).toHaveLength(1)
      expect(inspected).toEqual([
        { principal: principalA, tenant: tenantA, call: callId('c1'), operation: INVALIDATION },
      ])
      expect(recorded).toMatchObject([
        { operation: `${INVALIDATION}/done`, resolution: { kind: 'done', evidence: RECEIPT } },
      ])
    },
  )

  it('asks again under the same identity when the owner excluded the original, and not before the next run', async () => {
    const { run, invalidated, inspected, recorded } = stepOf({
      invalidate: n => (n === 1 ? lost() : succeed(RECEIPT)),
      inspect: () => resolution('excluded'),
    })
    expect(await run()).toEqual({
      kind: 'failed',
      failure: {
        kind: 'unavailable',
        dependency: 'tool-decisions',
        diagnostic: 'the invalidation was excluded; it is asked again with the same identity',
      },
    })
    // 本次运行到此为止：没有换身份重发，也没有记任务结局。
    expect(invalidated).toHaveLength(1)
    expect(recorded).toEqual([])
    // 下一次运行先问原操作；excluded 之后用同一个身份再发，成功即完成。
    expect(await run()).toEqual(CONTINUE)
    expect(inspected).toHaveLength(2)
    expect(invalidated.map(input => (input as { operation: string }).operation)).toEqual([
      INVALIDATION,
      INVALIDATION,
    ])
    expect(recorded).toMatchObject([{ resolution: { kind: 'done', evidence: RECEIPT } }])
  })

  it.each(['pending', 'unknown'] as const)(
    'keeps asking about the original while the owner says %s, and never invalidates again',
    async kind => {
      const { run, invalidated, inspected, recorded } = stepOf({
        invalidate: () => lost(),
        inspect: n => (n <= 2 ? resolution(kind, 'still deciding') : resolution('committed')),
      })
      const stalled = {
        kind: 'failed',
        failure: {
          kind: 'unavailable',
          dependency: 'tool-decisions',
          diagnostic: `the invalidation is ${kind}: still deciding`,
        },
      }
      expect(await run()).toEqual(stalled)
      expect(await run()).toEqual(stalled)
      expect(recorded).toEqual([])
      expect(await run()).toEqual(CONTINUE)
      expect(invalidated).toHaveLength(1)
      expect(inspected).toHaveLength(3)
      expect(recorded).toMatchObject([{ resolution: { kind: 'done', evidence: RECEIPT } }])
    },
  )

  it('does not take a refused inspection for an answer, in the run of the answer or the next one', async () => {
    const refused = {
      kind: 'unavailable',
      dependency: 'test-decisions',
      diagnostic: 'down',
    } as const
    const { run, invalidated, inspected } = stepOf({
      invalidate: () => lost(),
      inspect: n => (n <= 2 ? fail(refused) : resolution('committed')),
    })
    expect(await run()).toEqual({ kind: 'failed', failure: refused })
    expect(await run()).toEqual({ kind: 'failed', failure: refused })
    expect(await run()).toEqual(CONTINUE)
    expect(invalidated).toHaveLength(1)
    expect(inspected).toHaveLength(3)
  })

  it('goes on with the receipt of the original when a later run finds it committed, without a new invalidation', async () => {
    const { run, invalidated, inspected, recorded } = stepOf({
      invalidate: () => lost(),
      inspect: n => (n === 1 ? resolution('unknown') : resolution('committed')),
    })
    await run()
    expect(await run()).toEqual(CONTINUE)
    expect(invalidated).toHaveLength(1)
    expect(inspected).toHaveLength(2)
    expect(recorded).toHaveLength(1)
  })

  it('forgets the uncertainty once the duty is recorded: a new asking of the identity starts clean', async () => {
    const { run, invalidated, inspected } = stepOf({
      invalidate: n => (n === 1 ? lost() : succeed(RECEIPT)),
    })
    expect(await run()).toEqual(CONTINUE)
    expect(inspected).toHaveLength(1)
    expect(await run()).toEqual(CONTINUE)
    expect(invalidated).toHaveLength(2)
    // 第二次没有先问决策方：记下任务结局之后，不确定的记忆已经清除。
    expect(inspected).toHaveLength(1)
  })

  it('keeps the uncertainty while the record of the duty is not certain either', async () => {
    const { run, invalidated, inspected } = stepOf({
      invalidate: n => (n === 1 ? lost() : succeed(RECEIPT)),
      record: n => (n === 1 ? lost() : succeed(undefined)),
    })
    // 失效已被认回，任务结局的提交回包未知：任务还在，下一次运行仍先问原操作。
    expect(await run()).toEqual(STALLED)
    expect(await run()).toEqual(CONTINUE)
    expect(invalidated).toHaveLength(1)
    expect(inspected).toHaveLength(2)
  })
})

describe('an invalidation the decision owner refuses', () => {
  it.each([
    ['denied', DENIED],
    ['invalid', { kind: 'invalid', field: 'terminal', reason: 'unknown-wait' }],
    ['conflict', { kind: 'conflict', operation: operationId(INVALIDATION) }],
  ] as [string, ToolFailure][])(
    'blocks the duty with the refusal (%s) and stops the run, without asking about the original',
    async (kind, failure) => {
      const { run, invalidated, inspected, recorded } = stepOf({
        invalidate: () => refusal(failure),
      })
      const reason = `invalidation-refused: ${kind}`
      expect(await run()).toEqual({ kind: 'blocked', diagnostic: reason })
      expect(invalidated).toHaveLength(1)
      expect(inspected).toEqual([])
      expect(recorded).toEqual([
        {
          principal: principalA,
          tenant: tenantA,
          call: callId('c1'),
          operation: `${INVALIDATION}/refused`,
          task: expect.objectContaining({ operation: INVALIDATION }),
          resolution: { kind: 'blocked', reason },
        },
      ])
    },
  )

  it('leaves the duty for the next run when the block does not land', async () => {
    const unlanded = stepOf({ invalidate: () => refusal(DENIED), record: () => lost() })
    expect(await unlanded.run()).toEqual(STALLED)
    const verdict = { kind: 'invalid', field: 'task', reason: 'not-pending' } as const
    const refused = stepOf({ invalidate: () => refusal(DENIED), record: () => fail(verdict) })
    expect(await refused.run()).toEqual({ kind: 'failed', failure: verdict })
  })

  it('does not block a duty whose refusal operation cannot be named', async () => {
    // 失效操作 250 个字符：`/refused` 之后超出 256 的上限，而 `/done` 仍可命名。
    const wait = `w${'x'.repeat(250 - INVALIDATION_SUFFIX - 1)}`
    const { run, taskOf, recorded } = stepOf({
      invalidate: () => refusal(DENIED),
    })
    expect(await run(taskOf({ wait }))).toMatchObject({
      kind: 'failed',
      failure: { kind: 'invalid', field: 'operation' },
    })
    expect(recorded).toEqual([])
  })
})

// 真实运行：叫停暂停中的调用之后，失效待办由推进协程经决策方执行。决策方替身包住脚本化的决策方，只改失效与
// inspectOperation 两处的回答。
type Wrapped = Readonly<{
  /** 失效落地并丢失回包（脚本化决策方的 `answer-lost`）。 */
  landed?: boolean
  /** 第 n 次失效的回答；缺省走脚本化的决策方。 */
  invalidate?: (n: number) => Outcome<DurableEvidence, ToolFailure> | undefined
  /** 第 n 次 inspectOperation 的回答；缺省走脚本化的决策方。 */
  inspect?: (n: number) => Outcome<ExternalOperationResolution, ToolFailure> | undefined
}>

async function stoppedCall(wrapped: Wrapped = {}) {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const bridge = scriptedBridge('registers')
  if (wrapped.landed === true) bridge.invalidation('answer-lost')
  const attempts = { invalidate: 0, inspect: 0 }
  const decisions = {
    ...bridge,
    invalidate: (input: Parameters<typeof bridge.invalidate>[0]) => {
      attempts.invalidate += 1
      const injected = wrapped.invalidate?.(attempts.invalidate)
      return injected === undefined ? bridge.invalidate(input) : Promise.resolve(injected)
    },
    inspectOperation: (input: Parameters<typeof bridge.inspectOperation>[0]) => {
      attempts.inspect += 1
      const injected = wrapped.inspect?.(attempts.inspect)
      return injected === undefined ? bridge.inspectOperation(input) : Promise.resolve(injected)
    },
  } as typeof bridge
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions,
    driverRetryDelayMs: 5,
  })
  const access = { principal: principalA, tenant: tenantA, call: callId('c1') }
  const settle = async () => {
    for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
      await new Promise(resolve => setTimeout(resolve, 2))
      quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
    }
  }
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  await settle()
  expect((await harness.state('c1')).phase).toBe('suspended')
  const stop = { ...access, operation: operationId('stop-c1'), intent: { kind: 'stop' } } as const
  ok(await harness.commands.control(stop))
  await harness.drive('c1')
  await settle()
  const recovery = async () => ok(await harness.commands.loadRecovery(access))
  const duties = async () =>
    (await recovery()).tasks.filter(task => task.kind === 'wait-registration')
  return { harness, bridge, attempts, recovery, duties, settle }
}

describe('the invalidation duty of a stopped call, on the real runtime', () => {
  it('invalidates once and clears the duty', async () => {
    const built = await stoppedCall()
    expect(built.bridge.invalidated).toHaveLength(1)
    expect(await built.duties()).toEqual([])
    expect(built.attempts.inspect).toBe(0)
  })

  it('recalls an invalidation that landed and lost its answer, and does not invalidate again', async () => {
    const built = await stoppedCall({ landed: true })
    expect(built.attempts.invalidate).toBe(1)
    expect(built.attempts.inspect).toBe(1)
    expect(await built.duties()).toEqual([])
  })

  it('asks again under the same identity when the owner excluded an original that never landed', async () => {
    const built = await stoppedCall({ invalidate: n => (n === 1 ? lost() : undefined) })
    expect(built.bridge.invalidated.map(input => input.operation)).toEqual([INVALIDATION])
    expect(built.attempts.invalidate).toBe(2)
    expect(built.attempts.inspect).toBeGreaterThanOrEqual(1)
    expect(await built.duties()).toEqual([])
  })

  it('asks later when the owner cannot tell yet, and never invalidates a second time', async () => {
    const built = await stoppedCall({
      landed: true,
      inspect: n => (n === 1 ? resolution('unknown', 'later') : undefined),
    })
    expect(built.attempts.invalidate).toBe(1)
    expect(built.attempts.inspect).toBe(2)
    expect(await built.duties()).toEqual([])
  })

  it('blocks the duty on a definite refusal, keeps the reason, and no later run asks again', async () => {
    const built = await stoppedCall({
      invalidate: () => refusal(DENIED),
    })
    const [duty] = await built.duties()
    expect(duty).toMatchObject({
      action: 'invalidate',
      state: 'blocked',
      diagnostic: 'invalidation-refused: denied',
    })
    expect((await built.recovery()).state).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'interrupted' },
    })
    await built.harness.drive('c1')
    await built.settle()
    expect(built.attempts.invalidate).toBe(1)
    expect(built.attempts.inspect).toBe(0)
  })
})
