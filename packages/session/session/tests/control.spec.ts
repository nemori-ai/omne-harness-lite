import { afterEach, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  deriveDriveOperation,
  type ConsumptionId,
  type SessionCallControl,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  operationId,
  ordinaryInput,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import {
  controlFixture,
  hideReasons,
  interceptReads,
  readControlWork,
  turn,
} from './fixtures/control-fixture.ts'
import { TENANT_A, TENANT_B, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

it('本地取消传播原操作与原执行', async () => {
  const f = await controlFixture()
  open.push(f.h)
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(f.control).toHaveBeenCalledWith({
    tenant: f.h.access().tenant,
    session: f.h.access().session,
    execution: f.original.execution.execution,
    operation: deriveDriveOperation({
      kind: 'control',
      execution: f.original.execution.execution,
      control: operationId('cancel'),
    }),
    control: operationId('cancel'),
    intent: { kind: 'cancel-run', run: f.original.run, urgency: 'graceful' },
  })
  expect((await readControlWork(f.h)).controls[0]?.state).toBe('propagating')
})

it('归档向被它取消的 Run 的执行传播同一取消', async () => {
  const f = await controlFixture()
  open.push(f.h)
  succeeded(
    await f.h.faces('intake').work.control({
      ...f.h.access(),
      operation: operationId('archive'),
      intent: { kind: 'archive' },
    }),
    'archive',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(f.control).toHaveBeenCalledWith({
    tenant: f.h.access().tenant,
    session: f.h.access().session,
    execution: f.original.execution.execution,
    operation: deriveDriveOperation({
      kind: 'control',
      execution: f.original.execution.execution,
      control: operationId('archive'),
    }),
    control: operationId('archive'),
    intent: { kind: 'archive' },
  })
  const after = await readControlWork(f.h)
  expect(after.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'cancelled' } })
  expect(after.controls[0]?.state).toBe('propagating')
})

it('归档只向它自己终结的那个 Run 的执行发送', async () => {
  const f = await controlFixture()
  open.push(f.h)
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await vi.waitFor(async () => {
    const { run } = await readControlWork(f.h)
    if (run.kind !== 'active' || run.run === f.original.run) throw new Error('waiting for Run')
  })
  const later = (await readControlWork(f.h)).run
  if (later.kind !== 'active') throw new Error('no later Run')
  succeeded(
    await f.h.faces('intake').work.control({
      ...f.h.access(),
      operation: operationId('archive'),
      intent: { kind: 'archive' },
    }),
    'archive',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
  expect(f.control.mock.calls.map(([input]) => [input.control, input.execution])).toEqual([
    [operationId('cancel'), f.original.execution.execution],
    [operationId('archive'), later.execution.execution],
  ])
})

it('后继 Run 不接原取消', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 3 } } })
  open.push(f.h)
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await f.h.accept('input-2')
  await vi.waitFor(async () => expect((await readControlWork(f.h)).run.kind).toBe('active'))
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
  expect(f.control.mock.calls.map(([input]) => input.execution)).toEqual([
    f.original.execution.execution,
    f.original.execution.execution,
  ])
  expect(f.control.mock.calls[1]).toEqual(f.control.mock.calls[0])
})

it('单调用控制保持范围', async () => {
  const f = await controlFixture()
  open.push(f.h)
  const [binding] = await f.calls()
  if (binding === undefined) throw new Error('no binding')
  const before = await readControlWork(f.h)
  succeeded(
    await f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId('stop'),
      producer: binding.producer,
    }),
    'stopCall',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(f.control.mock.calls[0]?.[0]).toEqual({
    tenant: f.h.access().tenant,
    session: f.h.access().session,
    execution: f.original.execution.execution,
    operation: deriveDriveOperation({
      kind: 'control',
      execution: f.original.execution.execution,
      control: operationId('stop'),
    }),
    control: operationId('stop'),
    intent: { kind: 'stop-call', producer: binding.producer },
  })
  const after = await readControlWork(f.h)
  expect(after.run).toEqual(before.run)
  expect(after.consumptions).toEqual(before.consumptions)
  expect(after.controls[0]?.pending).toEqual([binding.producer])
})

for (const missing of ['attempt', 'history', 'ambiguous'] as const)
  it(`${missing} 原关联不足时不发送`, async () => {
    const f = await controlFixture()
    open.push(f.h)
    const [binding] = await f.calls()
    if (binding === undefined) throw new Error('no binding')
    const read = f.h.backend.transactions.readWork.bind(f.h.backend.transactions)
    interceptReads(f.h, async input => {
      const answer = await read(input)
      if ('failure' in answer) return answer
      const snapshot = answer.ok
      if (missing === 'attempt')
        return succeed({
          ...snapshot,
          consumptions: snapshot.consumptions.map(c => ({
            ...c,
            binding: { ...c.binding, initiatingAttempt: null },
          })),
        })
      if (snapshot.historyIndex === undefined) throw new Error('missing test history')
      return succeed({
        ...snapshot,
        historyIndex: {
          ...snapshot.historyIndex,
          attempts:
            missing === 'history'
              ? []
              : [...snapshot.historyIndex.attempts, ...snapshot.historyIndex.attempts],
        },
      })
    })
    succeeded(
      await f.h.faces('intake').work.stopCall({
        ...f.h.access(),
        operation: operationId('stop'),
        producer: binding.producer,
      }),
      'stopCall',
    )
    await turn()
    expect(f.control).not.toHaveBeenCalled()
    expect((await readControlWork(f.h)).controls[0]?.state).toBe('propagating')
  })

it('background-tool 只以原 producer 的执行与意图发送', async () => {
  const f = await controlFixture()
  open.push(f.h)
  const [binding] = await f.calls('tool')
  if (binding === undefined) throw new Error('no tool binding')
  const producer = { kind: 'tool' as const, call: binding.producer.call }
  succeeded(
    await f.h.faces('intake').work.control({
      ...f.h.access(),
      operation: operationId('background'),
      intent: { kind: 'background-tool', producer },
    }),
    'background-tool',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(f.control.mock.calls[0]?.[0]).toMatchObject({
    execution: f.original.execution.execution,
    control: operationId('background'),
    intent: { kind: 'background-tool', producer },
  })
})

it('后继 Run 开始后旧调用控制仍只指向原执行', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 3 } } })
  open.push(f.h)
  const [binding] = await f.calls()
  if (binding === undefined) throw new Error('no binding')
  succeeded(
    await f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId('stop'),
      producer: binding.producer,
    }),
    'stopCall',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await f.cancel()
  await f.h.accept('input-2')
  await vi.waitFor(async () => {
    const snapshot = await readControlWork(f.h)
    if (snapshot.run.kind !== 'active' || snapshot.run.run === f.original.run)
      throw new Error('waiting for successor Run')
  })
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.control.mock.calls.length).toBeGreaterThanOrEqual(4))
  const stops = f.control.mock.calls.filter(([input]) => input.intent.kind === 'stop-call')
  expect(stops.length).toBeGreaterThanOrEqual(2)
  expect(
    f.control.mock.calls.every(([input]) => input.execution === f.original.execution.execution),
  ).toBe(true)
})

it('原 Run 的执行记录不是恰好一个时不发送', async () => {
  for (const shape of ['none', 'twice'] as const) {
    const f = await controlFixture()
    open.push(f.h)
    const read = f.h.backend.transactions.readWork.bind(f.h.backend.transactions)
    interceptReads(f.h, async input => {
      const answer = await read(input)
      if ('failure' in answer) return answer
      const executions = answer.ok.executions ?? []
      return succeed({
        ...answer.ok,
        executions: shape === 'none' ? [] : [...executions, ...executions],
      })
    })
    await f.cancel()
    await turn()
    expect(f.control, shape).not.toHaveBeenCalled()
    expect((await readControlWork(f.h)).controls[0]?.state, shape).toBe('propagating')
  }
})

it('离开传播的控制不再重放，且不留重放记录', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 5 } } })
  open.push(f.h)
  let settled = false
  const read = f.h.backend.transactions.readWork.bind(f.h.backend.transactions)
  interceptReads(f.h, async input => {
    const answer = await read(input)
    if ('failure' in answer || !settled) return answer
    return succeed({
      ...answer.ok,
      controls: answer.ok.controls.map(control => ({
        ...control,
        state: 'reconciled' as const,
        pending: [],
        pendingUnassociatedWaiting: [],
      })),
    })
  })
  f.control.mockResolvedValue(fail({ kind: 'commit-unknown', operation: 'ignored-port-operation' }))
  f.query.mockResolvedValue(succeed('unknown'))
  await f.cancel()
  await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(1))
  settled = true
  f.h.clock.controls.advance(100)
  await turn()
  await turn()
  expect(f.control).toHaveBeenCalledTimes(1)
  expect(f.query).toHaveBeenCalledTimes(1)
  settled = false
  await f.notice()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
})

it('受理后停止的重放记录在控制离开传播后随发现清除', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 1 } } })
  open.push(f.h)
  let settled = false
  let settledReads = 0
  const read = f.h.backend.transactions.readWork.bind(f.h.backend.transactions)
  interceptReads(f.h, async input => {
    const answer = await read(input)
    if ('failure' in answer || !settled) return answer
    settledReads += 1
    return succeed({
      ...answer.ok,
      controls: answer.ok.controls.map(control => ({
        ...control,
        state: 'reconciled' as const,
        pending: [],
        pendingUnassociatedWaiting: [],
      })),
    })
  })
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  f.h.clock.controls.advance(100)
  await turn()
  await f.notice()
  expect(f.control).toHaveBeenCalledTimes(1)
  settled = true
  await f.notice()
  await vi.waitFor(() => expect(settledReads).toBeGreaterThan(0))
  await turn()
  await turn()
  settled = false
  await f.notice()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
})

it('控制一直不返回时不占住会话队列，关闭也能结束', async () => {
  const f = await controlFixture()
  open.push(f.h)
  f.control.mockImplementation(() => new Promise(() => undefined))
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await f.h.accept('input-2')
  await vi.waitFor(async () => {
    const snapshot = await readControlWork(f.h)
    if (snapshot.run.kind !== 'active' || snapshot.run.run === f.original.run)
      throw new Error('waiting for successor Run')
  })
  await f.h.instance.close()
  expect(f.control).toHaveBeenCalledTimes(1)
})

it('受理不结清责任', async () => {
  const f = await controlFixture({ drive: false })
  open.push(f.h)
  await f.calls()
  succeeded(
    await f.h.faces('coordinator').work.preserveResult({
      ...f.h.access(),
      operation: operationId('preserve'),
      participation: null,
      consumption: 'model-1' as ConsumptionId,
      result: {
        producer: { kind: 'model', call: 'model-1' },
        version: '1',
        delivery: null,
        source: evidence('result/model-1'),
      },
      custody: evidence('custody/model-1'),
    }),
    'preserve result',
  )
  f.h.setDrive(true)
  const invoked = f.invoke.mock.calls.length
  await f.cancel(false)
  const before = await readControlWork(f.h)
  await f.notice()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(before.consumptions.some(item => item.results.length > 0)).toBe(true)
  expect(await readControlWork(f.h)).toEqual(before)
  expect(before.controls[0]?.pending).toHaveLength(2)
  expect(before.controls[0]?.pendingUnassociatedWaiting).toHaveLength(1)
  expect(before.controls[0]?.state).toBe('propagating')
  expect(f.resume).not.toHaveBeenCalled()
  expect(f.invoke).toHaveBeenCalledTimes(invoked)
})

it('未知先查询', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 10 } } })
  open.push(f.h)
  f.control.mockResolvedValue(fail({ kind: 'commit-unknown', operation: 'ignored-port-operation' }))
  f.query
    .mockResolvedValueOnce(succeed('unknown'))
    .mockRejectedValueOnce(new Error('query unavailable'))
    .mockResolvedValueOnce(succeed('excluded'))
    .mockResolvedValue(succeed('committed'))
  await f.cancel()
  await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(1))
  expect(f.control).toHaveBeenCalledTimes(1)
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
  expect(f.control).toHaveBeenCalledTimes(1)
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(4))
  expect(f.control).toHaveBeenCalledTimes(2)
  const first = f.control.mock.calls[0]?.[0]
  expect(first).toBeDefined()
  expect(f.control.mock.calls[1]?.[0]).toEqual(first)
  expect(
    f.query.mock.calls.every(
      ([input]) => input.execution === first?.execution && input.operation === first.operation,
    ),
  ).toBe(true)
  f.h.clock.controls.advance(1000)
  await f.notice('control.progress')
  expect(f.control).toHaveBeenCalledTimes(2)
  expect((await readControlWork(f.h)).controls[0]?.state).toBe('propagating')
})

it('最小预算下未知提交仍先查询原身份', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 1 } } })
  open.push(f.h)
  f.control.mockResolvedValue(fail({ kind: 'commit-unknown', operation: 'ignored-port-operation' }))
  f.query.mockResolvedValue(succeed('committed'))
  await f.cancel()
  await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(1))
  expect(f.control).toHaveBeenCalledTimes(1)
  expect(f.query.mock.calls[0]?.[0]).toMatchObject({
    execution: f.original.execution.execution,
    operation: f.control.mock.calls[0]?.[0].operation,
  })
  f.h.clock.controls.advance(1000)
  await f.notice()
  expect(f.control).toHaveBeenCalledTimes(1)
  expect(f.query).toHaveBeenCalledTimes(1)
})

it('重复通知不绕过间隔与上限，关闭停止发送', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 2 } } })
  open.push(f.h)
  f.control.mockResolvedValue(fail({ kind: 'busy' }))
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await Promise.all(Array.from({ length: 8 }, () => f.notice()))
  expect(f.control).toHaveBeenCalledTimes(1)
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
  f.h.clock.controls.advance(100)
  await f.notice()
  expect(f.control).toHaveBeenCalledTimes(2)
  await f.h.instance.close()
  f.h.clock.controls.advance(10000)
  await f.notice()
  expect(f.control).toHaveBeenCalledTimes(2)
  expect((await readControlWork(f.h)).controls[0]?.state).toBe('propagating')
})

it('在途发送只保留一个任务', async () => {
  const f = await controlFixture()
  open.push(f.h)
  let complete: (() => void) | undefined
  f.control.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = () => resolve(succeed({ revision: '1', evidence: evidence('accepted') }))
      }),
  )
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  await Promise.all(Array.from({ length: 12 }, () => f.notice()))
  expect(f.control).toHaveBeenCalledTimes(1)
  complete?.()
})

it('关闭时在途发送完成后不再发送', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 5 } } })
  open.push(f.h)
  let complete: (() => void) | undefined
  f.control.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = () => resolve(fail({ kind: 'busy' }))
      }),
  )
  await f.cancel()
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  const closing = f.h.instance.close()
  complete?.()
  await closing
  f.h.clock.controls.advance(10000)
  await turn()
  expect(f.control).toHaveBeenCalledTimes(1)
  expect((await readControlWork(f.h)).controls[0]?.state).toBe('propagating')
})

for (const kind of ['control.requested', 'control.progress'])
  it(`外部 ${kind} 唤醒`, async () => {
    const f = await controlFixture()
    open.push(f.h)
    await f.cancel(false)
    await turn()
    expect(f.control).not.toHaveBeenCalled()
    await f.notice(kind)
    await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  })

it('未提交的取消不传播', async () => {
  const f = await controlFixture()
  open.push(f.h)
  f.h.view.onCommit(async () =>
    fail({ kind: 'unavailable', owner: 'test-commit', diagnostic: 'refused' }),
  )
  await f.h.faces('intake').work.cancelRun({
    ...f.h.access(),
    operation: operationId('cancel'),
    run: f.original.run,
    urgency: 'graceful',
  })
  f.h.view.onCommit(null)
  await turn()
  expect(f.control).not.toHaveBeenCalled()
  expect((await readControlWork(f.h)).controls).toEqual([])
})

it('提交未知的取消不提前传播，由扫描找回', async () => {
  const f = await controlFixture()
  open.push(f.h)
  f.h.view.onCommit(async (input, next) => {
    await next()
    return fail({ kind: 'commit-unknown', operation: input.command.input.operation })
  })
  const answer = await f.h.faces('intake').work.cancelRun({
    ...f.h.access(),
    operation: operationId('cancel'),
    run: f.original.run,
    urgency: 'graceful',
  })
  expect('failure' in answer && answer.failure.kind).toBe('commit-unknown')
  f.h.view.onCommit(null)
  await turn()
  expect(f.control).not.toHaveBeenCalled()
  succeeded(await f.h.instance.maintain(TENANT_A), 'maintain')
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
})

it('启动找回已保存控制', async () => {
  const f = await controlFixture()
  open.push(f.h)
  await f.cancel(false)
  succeeded(await f.h.instance.maintain(TENANT_A), 'maintain')
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
})

it('周期找回遗漏通知的控制', async () => {
  const f = await controlFixture({
    policy: {
      recoveryScan: {
        periodMs: 100,
        pageSize: 100,
        startupRetryDelaysMs: [1000, 5000, 30000],
        sessionBackoff: { initialMs: 1, multiplier: 2, maxMs: 10 },
      },
    },
  })
  open.push(f.h)
  hideReasons(f.h, ['inputs', 'unresolved'])
  succeeded(await f.h.instance.maintain(TENANT_A), 'maintain')
  await turn()
  await f.cancel(false)
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
})

it('租户间控制独立', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 1 } } })
  open.push(f.h)
  const other = f.h.other()
  succeeded(
    await f.h
      .faces('intake')
      .management.create({ ...other, operation: operationId('create'), creation: creation() }),
    'create other',
  )
  f.h.bindings.controls.bind(TENANT_B, sessionId('session-1'))
  succeeded(
    await f.h.faces('intake').work.accept({
      ...other,
      operation: operationId('other-input'),
      value: ordinaryInput('other-input'),
    }),
    'accept other',
  )
  await vi.waitFor(async () =>
    expect(
      succeeded(await f.h.backend.transactions.readWork(other), 'other snapshot').run.kind,
    ).toBe('active'),
  )
  const snapshot = succeeded(await f.h.backend.transactions.readWork(other), 'other snapshot')
  if (snapshot.run.kind !== 'active') throw new Error('other Run missing')
  await f.cancel()
  succeeded(
    await f.h.faces('intake').work.cancelRun({
      ...other,
      operation: operationId('cancel'),
      run: snapshot.run.run,
      urgency: 'graceful',
    }),
    'cancel other',
  )
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(2))
  expect(f.control.mock.calls.some(([input]) => tenantEquals(input.tenant, TENANT_A))).toBe(true)
  expect(f.control.mock.calls.some(([input]) => tenantEquals(input.tenant, TENANT_B))).toBe(true)
})

it('主体失败不调用 Agent', async () => {
  const f = await controlFixture()
  open.push(f.h)
  await f.cancel(false)
  f.h.bindings.controls.answerNext({ ok: { kind: 'not-bound' } })
  await f.notice()
  expect(f.control).not.toHaveBeenCalled()
})

async function backgroundedCall(f: Awaited<ReturnType<typeof controlFixture>>) {
  const [binding] = await f.calls('tool')
  if (binding === undefined) throw new Error('no binding')
  const sent = vi.fn<SessionCallControl['control']>(async () => succeed('recorded' as const))
  f.h.callControl.port = { control: sent }
  const execution = f.original.execution.execution
  succeeded(
    await f.h.backend.transactions.commitEntries({
      observation: {
        ...f.h.access(),
        run: f.original.run,
        execution,
        channel: 'tool-received',
        operation: operationId('entries-placeholder'),
        after: '0',
        through: '1',
        boundary: {
          execution,
          channel: 'tool-received',
          revision: '3',
          executionEvidence: evidence('agent/head/3'),
          count: '1',
        },
        items: [
          {
            ordinal: '1',
            key: 'placeholder',
            fact: evidence('agent/entry/placeholder'),
            interpretation: [
              { kind: 'backgrounded', producer: binding.producer, source: evidence('t/p') },
            ],
          },
        ],
      },
      start: { kind: 'initial' },
    }),
    'placeholder',
  )
  return { binding, sent }
}

it('停一个转了后台的调用凭引用直交 Tool，不经 Agent', async () => {
  const f = await controlFixture()
  open.push(f.h)
  const { binding, sent } = await backgroundedCall(f)
  succeeded(
    await f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId('stop'),
      producer: binding.producer,
    }),
    'stopCall',
  )
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
  expect(sent.mock.calls[0]?.[0]).toEqual({
    tenant: f.h.access().tenant,
    session: f.h.access().session,
    control: operationId('stop'),
    producer: binding.producer,
    intent: 'stop',
  })
  expect(f.control).not.toHaveBeenCalled()
})

it('归档对转了后台的调用凭引用送撤回，仍经 Agent 取消它终结的 Run', async () => {
  const f = await controlFixture()
  open.push(f.h)
  const { binding, sent } = await backgroundedCall(f)
  succeeded(
    await f.h.faces('intake').work.control({
      ...f.h.access(),
      operation: operationId('archive'),
      intent: { kind: 'archive' },
    }),
    'archive',
  )
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
  expect(sent.mock.calls[0]?.[0]).toMatchObject({ producer: binding.producer, intent: 'withdraw' })
  await vi.waitFor(() => expect(f.control).toHaveBeenCalledTimes(1))
  expect(f.control.mock.calls[0]?.[0].intent).toEqual({ kind: 'archive' })
})

it('直交答不可用时按回放间隔再送，答已记下就停', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 3 } } })
  open.push(f.h)
  const { binding, sent } = await backgroundedCall(f)
  sent.mockResolvedValueOnce(fail({ kind: 'unavailable', owner: 'tool', diagnostic: 'away' }))
  succeeded(
    await f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId('stop'),
      producer: binding.producer,
    }),
    'stopCall',
  )
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
  f.h.clock.controls.advance(100)
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
  f.h.clock.controls.advance(100)
  f.h.clock.controls.advance(100)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(sent).toHaveBeenCalledTimes(2)
})

it('直交一直不可用时只送到回放上限', async () => {
  const f = await controlFixture({ policy: { controlReplay: { intervalMs: 100, maxReplays: 3 } } })
  open.push(f.h)
  const { binding, sent } = await backgroundedCall(f)
  sent.mockResolvedValue(fail({ kind: 'unavailable', owner: 'tool', diagnostic: 'away' }))
  succeeded(
    await f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId('stop'),
      producer: binding.producer,
    }),
    'stopCall',
  )
  for (const count of [1, 2, 3]) {
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(count))
    f.h.clock.controls.advance(100)
  }
  f.h.clock.controls.advance(100)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(sent).toHaveBeenCalledTimes(3)
})

it('已记下的直交不再重送，同一调用的另一条停止按自己的控制送', async () => {
  const f = await controlFixture()
  open.push(f.h)
  const { binding, sent } = await backgroundedCall(f)
  const stop = (name: string) =>
    f.h.faces('intake').work.stopCall({
      ...f.h.access(),
      operation: operationId(name),
      producer: binding.producer,
    })
  succeeded(await stop('stop'), 'first stop')
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
  succeeded(await stop('stop-2'), 'second stop')
  await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(sent.mock.calls.map(([input]) => input.control)).toEqual([
    operationId('stop'),
    operationId('stop-2'),
  ])
})
