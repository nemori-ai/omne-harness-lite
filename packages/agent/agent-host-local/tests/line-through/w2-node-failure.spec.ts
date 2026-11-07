// @module-tag slow
// Real SQLite, Session AD-02 and Agent runtime; producer and context doubles are defined in w2-world.
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
    receptionTargets: 'journal',
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
    await expect
      .poll(
        async () => {
          const snapshot = ok(await w.fresh().load(firstAccess))
          return {
            state: snapshot.state,
            pending: snapshot.finishObligations?.items
              .filter(
                item => item.disposition.kind === 'pending' || item.disposition.kind === 'unknown',
              )
              .map(item => ({ kind: item.kind, disposition: item.disposition })),
          }
        },
        { timeout: 10_000 },
      )
      .toMatchObject({ state: { kind: 'ended' }, pending: [] })
    expect(await w.lastOutcome()).toBe('cancelled')
    const first = ok(await w.fresh().load(firstAccess))
    const firstEntries = ok(
      await w.freshEntries().read({ ...firstAccess, after: null, limit: 100 }),
    )
    expect(firstEntries.caughtUp).toBe(true)
    expect(firstEntries.items.some(item => item.entry.kind === 'received')).toBe(true)

    await w.accept('second', 'second question')
    await w.until(() => w.modelCalls.length === 2, 10_000)
    const secondExecution = await w.execution()
    expect(secondExecution).not.toBe(firstExecution)
    const secondAccess = { ...w.agentAccess, execution: secondExecution }
    await w.until(() => w.replies.some(reply => reply.index === 0), 10_000)
    const [replay] = replays
    if (replay === undefined)
      throw new Error('the cancelled Run did not retain its original result')
    expect(await replay()).toHaveProperty('ok')
    expect(w.tools.invoke.calls).toHaveLength(0)
    expect(ok(await w.fresh().load(firstAccess)).state).toEqual(first.state)
    const secondEntries = ok(
      await w.freshEntries().read({ ...secondAccess, after: null, limit: 100 }),
    )
    expect(secondEntries.caughtUp).toBe(true)
    expect(secondEntries.items.filter(item => item.entry.kind === 'received')).toHaveLength(0)
    secondRelease.resolve()
    await w.until(async () => ok(await w.fresh().load(secondAccess)).state.kind === 'ended', 10_000)
    await w.until(async () => (await w.lastOutcome()) === 'completed', 10_000)
    expect(w.modelCalls).toHaveLength(2)
    expect(w.tools.invoke.calls).toHaveLength(0)
  } finally {
    firstRelease.resolve()
    secondRelease.resolve()
  }
})

it('retains a failed execution and lets Session regrant its untaken input on real SQL', async () => {
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
  expect(await w.lastOutcome()).toBe('failed')
  expect(w.modelCalls).toHaveLength(0)
  const firstRun = await w.lastTerminal()
  const [execution] = failedExecutions
  if (execution === undefined) throw new Error('the conditions fault was not injected')
  const access = { ...w.agentAccess, execution }
  const first = ok(await w.fresh().load(access))
  expect(first.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
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

  w.sessionClock.controls.advance(30_000)
  await w.until(async () => (await w.lastOutcome()) === 'completed', 10_000)
  expect(await w.lastOutcome()).toBe('completed')
  expect(await w.lastTerminal()).not.toBe(firstRun)
  const secondExecution = await w.execution()
  expect(secondExecution).not.toBe(execution)
  expect(w.modelCalls).toHaveLength(1)
  const second = ok(await w.fresh().load({ ...w.agentAccess, execution: secondExecution }))
  expect(second.checkpoint.inputBatch?.ordered).toEqual(inputs.batch.ordered)
  const secondEvents = ok(
    await w.fresh().output.read({
      ...w.agentAccess,
      execution: secondExecution,
      after: null,
      limit: 100,
    }),
  )
  if (secondEvents.kind !== 'page') throw new Error('the successor events are unavailable')
  expect(secondEvents.events.filter(event => event.body.kind === 'input-taken')).toHaveLength(1)
  expect(ok(await w.probe.readWork(intakeAccess)).pending).toHaveLength(0)
  const retained = ok(await w.fresh().load(access))
  expect(retained.state).toEqual(first.state)
  expect(retained.settlement.candidate).toEqual(first.settlement.candidate)
  expect(ok(await w.fresh().inputs({ ...access, watermark: first.inputWatermark }))).toEqual(inputs)
  expect(ok(await w.probe.readWork(intakeAccess)).run).toMatchObject({
    kind: 'terminal',
    terminal: { outcome: 'completed' },
  })
  await w.runRound(2, 'a fresh question after recovery', 10_000)
  expect(await w.lastOutcome()).toBe('completed')
  expect(w.modelCalls).toHaveLength(2)
  const thirdExecution = await w.execution()
  expect(thirdExecution).not.toBe(secondExecution)
  expect(thirdExecution).not.toBe(execution)
  const third = ok(await w.fresh().load({ ...w.agentAccess, execution: thirdExecution }))
  expect(third.checkpoint.inputBatch?.ordered).toEqual(['in-2'])
  expect(ok(await w.fresh().load(access)).state).toEqual(first.state)
})

it.each([false, true])(
  'keeps a duplicate Model result with Run A after Run B starts, failed A = %s',
  async failFirst => {
    const release = Promise.withResolvers<void>()
    const replays: Array<() => Promise<unknown>> = []
    const firstExecutions: AgentExecutionId[] = []
    let failed = false
    const w = await openW2World({
      receptionTargets: 'journal',
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
      await w.runRound(1, 'first question', 10_000)
      expect(await w.lastOutcome()).toBe(failFirst ? 'failed' : 'completed')
      const firstRun = await w.lastTerminal()
      expect(failed).toBe(failFirst)
      const [firstExecution] = firstExecutions
      const [replay] = replays
      if (firstExecution === undefined || replay === undefined)
        throw new Error('the first result was not saved')
      const firstAccess = { ...w.agentAccess, execution: firstExecution }
      const first = ok(await w.fresh().load(firstAccess))
      const firstEntries = ok(
        await w.freshEntries().read({ ...firstAccess, after: null, limit: 100 }),
      )
      expect(firstEntries.caughtUp).toBe(true)
      const received = firstEntries.items.filter(item => item.entry.kind === 'received')
      expect(received.length).toBeGreaterThan(0)

      await w.accept('second', 'second question')
      await w.until(() => w.modelCalls.length === 2, 10_000)
      const secondExecution = await w.execution()
      expect(secondExecution).not.toBe(firstExecution)
      expect(await replay()).toHaveProperty('ok')
      const secondAccess = { ...w.agentAccess, execution: secondExecution }
      const beforeSecondResult = ok(
        await w.freshEntries().read({ ...secondAccess, after: null, limit: 100 }),
      )
      expect(beforeSecondResult.caughtUp).toBe(true)
      expect(beforeSecondResult.items.filter(item => item.entry.kind === 'received')).toHaveLength(
        0,
      )
      expect(ok(await w.fresh().load(firstAccess)).state).toEqual(first.state)
      expect(ok(await w.freshEntries().read({ ...firstAccess, after: null, limit: 100 }))).toEqual(
        firstEntries,
      )

      release.resolve()
      await w.until(async () => {
        const ended = await w.lastTerminal()
        return ended !== null && ended !== firstRun
      }, 10_000)
      expect(await w.lastOutcome()).toBe('completed')
      const second = ok(await w.fresh().load(secondAccess))
      expect(second.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      const secondEntries = ok(
        await w.freshEntries().read({ ...secondAccess, after: null, limit: 100 }),
      )
      expect(secondEntries.caughtUp).toBe(true)
      const originalConsumptions = received.flatMap(item =>
        item.entry.kind === 'received' ? [item.entry.consumption] : [],
      )
      const secondReceived = secondEntries.items.flatMap(item =>
        item.entry.kind === 'received' ? [item.entry] : [],
      )
      expect(secondReceived.length).toBeGreaterThan(0)
      for (const entry of secondReceived)
        expect(originalConsumptions).not.toContain(entry.consumption)
    } finally {
      release.resolve()
    }
  },
)
