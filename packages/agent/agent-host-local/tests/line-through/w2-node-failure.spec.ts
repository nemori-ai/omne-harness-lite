// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { operationId } from '@omne-harness/session-contract/testing'
import { intakeAccess, ok, type ModelAdmission } from './world.ts'
import { openW2World, replyText, toolCallBlock, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('keeps a cancelled producer callback away from the next Run', async () => {
  const firstRelease = Promise.withResolvers<void>()
  const secondRelease = Promise.withResolvers<void>()
  const admissions: ModelAdmission[] = []
  const replays: Array<() => Promise<unknown>> = []
  const w = await openW2World({
    reception: 'routed',
    wrapModelReceiver: receiver => ({
      ...receiver,
      async push(input) {
        const answer = await receiver.push(input)
        if ('ok' in answer && input.delivery.kind === 'result' && replays.length === 0) {
          replays.push(() => receiver.push({ ...input, signal: new AbortController().signal }))
        }
        return answer
      },
    }),
    model: a => {
      admissions.push(a)
      return a.index === 0
        ? {
            parts: [toolCallBlock('old-tool-suggestion')],
            reason: 'tool-suggestions',
            partial: [replyText('first-part', 'before cancellation')],
            cost: '0.25',
            hold: firstRelease.promise,
          }
        : {
            parts: [replyText(`reply-${a.index}`, 'second answer')],
            reason: 'stop',
            hold: secondRelease.promise,
          }
    },
  })
  worlds.push(w)
  try {
    await w.createSession('cancel-then-next')
    await w.accept('first', 'first question')
    await w.until(async () => {
      const first = admissions[0]
      if (first === undefined) return false
      const dispatches = ok(
        await w.scripted.provider.runtime.calls.dispatches({ ...w.agentAccess, call: first.call }),
      )
      return dispatches.some(dispatch => dispatch.send === 'started')
    }, 10_000)
    const { run } = ok(await w.probe.readWork(intakeAccess))
    if (run.kind !== 'active') throw new Error('the first Run is not active')
    const firstExecution = await w.execution()
    const firstAccess = { ...w.agentAccess, execution: firstExecution }
    ok(
      await w.intake.work.cancelRun({
        ...intakeAccess,
        operation: operationId('cancel-first'),
        run: run.run,
        urgency: 'graceful',
      }),
    )
    await expect
      .poll(
        async () => {
          const snapshot = ok(await w.fresh().load(firstAccess))
          return snapshot.state.kind
        },
        { timeout: 10_000 },
      )
      .toBe('settling')
    expect(w.modelCalls).toHaveLength(1)
    expect(w.tools.invoke.calls).toHaveLength(0)
    firstRelease.resolve()
    await w.until(() => w.replies.some(reply => reply.index === 0), 10_000)
    const [replay] = replays
    if (replay === undefined) throw new Error('the cancelled Run did not keep its original result')
    await w.until(() => w.settled(firstExecution), 10_000)
    expect(await w.lastOutcome()).toBe('cancelled')
    expect(await w.runEnd(String(run.run))).toBeNull()

    await w.accept('second', 'second question')
    await w.until(() => w.modelCalls.length === 2, 10_000)
    const secondExecution = await w.execution()
    expect(secondExecution).not.toBe(firstExecution)
    const secondAccess = { ...w.agentAccess, execution: secondExecution }
    expect(await replay()).toEqual({ failure: { kind: 'denied' } })
    expect(w.tools.invoke.calls).toHaveLength(0)
    expect(await w.settled(firstExecution)).toBe(true)
    const secondEntries = ok(
      await w.probeEntries.read({ ...secondAccess, after: null, limit: 100 }),
    )
    expect(secondEntries.caughtUp).toBe(true)
    expect(secondEntries.items.filter(item => item.entry.kind === 'received')).toHaveLength(0)
    secondRelease.resolve()
    await w.until(async () => (await w.lastOutcome()) === 'completed', 10_000)
    expect(w.modelCalls).toHaveLength(2)
    expect(w.tools.invoke.calls).toHaveLength(0)
  } finally {
    firstRelease.resolve()
    secondRelease.resolve()
  }
})

it('retains a failed execution and hands its untaken input to the Run a new input starts on real SQL', async () => {
  const failedExecutions: AgentExecutionId[] = []
  const w = await openW2World({
    model: a => ({ parts: [replyText(`reply-${a.index}`, 'second run answer')], reason: 'stop' }),
    wrapAgentDependencies: dependencies => ({
      ...dependencies,
      conditions: {
        read(input) {
          if (failedExecutions.length === 0) {
            failedExecutions.push(input.advance.execution)
            throw new Error('one conditions read fails')
          }
          return dependencies.conditions.read(input)
        },
      },
    }),
  })
  worlds.push(w)
  await w.createSession('node-failure')
  await w.runRound(1, 'retry this input after the failed execution', 10_000)
  const [execution] = failedExecutions
  if (execution === undefined) throw new Error('the conditions fault was not injected')
  expect(w.endedRuns()).toEqual([{ run: expect.any(String), execution, outcome: 'failed' }])
  expect(ok(await w.probe.readWork(intakeAccess))).toMatchObject({
    run: { kind: 'terminal', terminal: { outcome: 'failed' } },
    pending: ['in-1'],
    awaitingPerson: true,
  })
  expect(w.modelCalls).toHaveLength(0)
  const access = { ...w.agentAccess, execution }
  const first = ok(await w.fresh().load(access))
  expect(first.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
  expect(first.checkpoint.calls.filter(call => call.kind === 'model')).toHaveLength(0)
  expect(first.settlement.candidate?.failure).toMatchObject({
    kind: 'node-failed',
    node: 'E2',
    category: 'exception',
  })
  const inputs = ok(await w.fresh().inputs({ ...access, watermark: first.inputWatermark }))
  expect(inputs.batch.ordered).toHaveLength(1)
  const obligations = first.finishObligations?.items.filter(item => item.kind === 'accepted-input')
  expect(obligations).toHaveLength(1)
  expect(obligations?.[0]).toMatchObject({ taken: null, disposition: { kind: 'held' } })
  const events = ok(await w.fresh().output.read({ ...access, after: null, limit: 100 }))
  if (events.kind !== 'page') throw new Error('the original events are unavailable')
  expect(events.events.filter(event => event.body.kind === 'input-taken')).toHaveLength(0)
  expect(events.events.filter(event => event.body.kind === 'ended')).toHaveLength(1)

  const [failedEnd] = w.endedRuns()
  expect(await w.runEnd(failedEnd!.run)).toMatchObject({
    conclusion: 'fail',
    failure: { kind: 'node-failed', node: 'E2', category: 'exception' },
  })

  await w.runRound(2, 'the person answers the failure', 10_000)
  expect(await w.lastOutcome()).toBe('completed')
  const second = w.endedRuns().at(-1)!
  expect(second.execution).not.toBe(execution)
  expect(await w.runEnd(second.run)).toEqual({ conclusion: 'complete', failure: null })
  expect((await w.batchesTaken(second.run)).flat()).toEqual([...inputs.batch.ordered, 'in-2'])
  const secondCalls = w.modelCalls.length
  expect(ok(await w.probe.readWork(intakeAccess))).toMatchObject({
    run: { kind: 'terminal', terminal: { outcome: 'completed' } },
    pending: [],
  })
  const retained = ok(await w.probeLog.load(access))
  expect(retained.state).toEqual(first.state)
  expect(retained.settlement.candidate).toEqual(first.settlement.candidate)
  expect(ok(await w.probeLog.inputs({ ...access, watermark: first.inputWatermark }))).toEqual(
    inputs,
  )

  await w.runRound(3, 'a fresh question after recovery', 10_000)
  expect(await w.lastOutcome()).toBe('completed')
  expect(w.modelCalls).toHaveLength(secondCalls + 1)
  const third = w.endedRuns().at(-1)!
  expect(third.execution).not.toBe(second.execution)
  expect(third.execution).not.toBe(execution)
  expect((await w.batchesTaken(third.run)).flat()).toEqual(['in-3'])
  expect(ok(await w.probeLog.load(access)).state).toEqual(first.state)
})

it.each([false, true])(
  'refuses a duplicate Model result of settled Run A and keeps it out of Run B, failed A = %s',
  async failFirst => {
    const release = Promise.withResolvers<void>()
    const replays: Array<() => Promise<unknown>> = []
    const firstExecutions: AgentExecutionId[] = []
    let failed = false
    const w = await openW2World({
      reception: 'routed',
      model: a => ({
        parts: [replyText(`reply-${a.index}`, `answer ${a.index}`)],
        reason: 'stop',
        ...(a.index === 1 ? { hold: release.promise } : {}),
      }),
      wrapModelReceiver: receiver => ({
        ...receiver,
        async push(input) {
          const answer = await receiver.push(input)
          if ('ok' in answer && input.delivery.kind === 'result' && replays.length === 0) {
            replays.push(() => receiver.push({ ...input, signal: new AbortController().signal }))
          }
          return answer
        },
      }),
      wrapAgentDependencies: dependencies => ({
        ...dependencies,
        conditions: {
          read(input) {
            if (firstExecutions.length === 0) firstExecutions.push(input.advance.execution)
            if (failFirst && replays.length > 0 && !failed) {
              failed = true
              throw new Error('one conditions read fails after the original result was saved')
            }
            return dependencies.conditions.read(input)
          },
        },
      }),
    })
    worlds.push(w)
    try {
      await w.createSession(`duplicate-${failFirst}`)
      await w.runRound(1, 'first question', 10_000, 'settled')
      expect(await w.lastOutcome()).toBe(failFirst ? 'failed' : 'completed')
      const firstRun = await w.lastTerminal()
      expect(failed).toBe(failFirst)
      const [firstExecution] = firstExecutions
      const [replay] = replays
      if (firstExecution === undefined || replay === undefined)
        throw new Error('the first result was not saved')

      await w.accept('second', 'second question')
      await w.until(() => w.modelCalls.length === 2, 10_000)
      const secondExecution = await w.execution()
      expect(secondExecution).not.toBe(firstExecution)
      expect(await replay()).toEqual({ failure: { kind: 'denied' } })
      expect(await w.settled(firstExecution)).toBe(true)
      const secondAccess = { ...w.agentAccess, execution: secondExecution }
      const beforeSecondResult = ok(
        await w.probeEntries.read({ ...secondAccess, after: null, limit: 100 }),
      )
      expect(beforeSecondResult.caughtUp).toBe(true)
      expect(beforeSecondResult.items.filter(item => item.entry.kind === 'received')).toHaveLength(
        0,
      )

      release.resolve()
      await w.until(async () => {
        const ended = await w.lastTerminal()
        return ended !== null && ended !== firstRun
      }, 10_000)
      expect(await w.lastOutcome()).toBe('completed')
      const second = w.endedRuns().at(-1)!
      expect(second.execution).toBe(secondExecution)
      expect(await w.runEnd(second.run)).toEqual({ conclusion: 'complete', failure: null })
    } finally {
      release.resolve()
    }
  },
)
