// J3 and J4: the controls of Session reach the Agent through AD-14 on one real Cordis root
// (R10 items 2 and 3; M-CANCEL). Both start at the intake face of Session; no scenario calls an Agent
// control entry, so AD-14 and the Journal's cancellation installation are on the path.
//
// J3 cancels the Run (`cancelRun`, graceful) while a Model call is in flight and asserts, on the
// Agent side, that the cancellation intent is established, and that nothing new is sent after it.
// Expected state while the upstream gaps stay open: red. The known limit "the control that the
// recovery path does not advance" in the agent-host-local SPEC (anchor `恢复路径的未推进控制`: the
// long-lived control entry writes `accepted` and does not advance) keeps `intent-established` from
// being built, and K-12 (control events are not normalized after a cancel) keeps AD-02 from
// interpreting the later events of the execution. The assertions follow the closure specification
// and are not to be bent around those gaps.
//
// J4 interrupts one Model call (`stopCall`) and leaves the Tool call and the Run alone. Expected
// state while defect D5 stays open: red. Session knows a Model call as a producer under its
// invocation reference (AD-05 writes `key.reference`); AD-14 decodes `producer.call` as a
// `ModelCallId` and drops a reference, while a call identity is `not-found` in Session. No identity
// reaches the Agent, whatever the caller sends.
// @module-tag slow
// Why slow: real Workers, real files and the whole line on one root.
import { afterEach, describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { TENANT, intakeAccess, ok } from './world.ts'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const gate = () => Promise.withResolvers<void>()

async function activeRun(w: W2World) {
  const { run } = ok(await w.transactions.readWork(intakeAccess))
  if (run.kind !== 'active') throw new Error(`the Run is ${run.kind}`)
  return run
}

describe('J3: cancelling the Run stops new Model requests and Tool actions', () => {
  it('J3 cancels from Session: the Run ends cancelled, the intent is established, nothing new is sent', async () => {
    const release = gate()
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? {
              // The call shows part of its reply and reports a cost, then stays in flight; its late
              // result is a Tool call suggestion that nothing may act on.
              parts: [toolCallBlock('tc-late')],
              reason: 'tool-suggestions',
              partial: [replyText('part', 'a part of the reply')],
              cost: '0.25',
              hold: release.promise,
            }
          : { parts: [replyText(`r${a.index}`, 'must not be asked')], reason: 'stop' },
    })
    worlds.push(w)
    await w.createSession('j3')
    await w.accept('j3-in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
    const run = await activeRun(w)
    // The world learns the execution of a Run while it is active; the cancel ends the Run quickly.
    const execution = await w.execution()

    const operation = operationId('j3-cancel')
    const cancel = () =>
      w.intake.work.cancelRun({ ...intakeAccess, operation, run: run.run, urgency: 'graceful' })
    const receipt = ok(await cancel())
    // The Run ends cancelled, through Session's one terminal exit.
    await w.until(async () => (await w.lastTerminal()) === String(run.run))
    expect(ok(await w.transactions.readWork(intakeAccess)).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'cancelled' },
    })
    // The Agent side holds the intent of the cancellation. Session ends the Run through its own
    // terminal exit and AD-14 delivers the control to the Agent asynchronously: acceptance and
    // intent are two stages, so the read waits, at most 5 seconds, for the intent stage.
    const cancelControl = async () =>
      ok(await w.journal().load({ ...w.agentAccess, execution })).controls.find(
        record => record.command.kind === 'cancel',
      )
    await w
      .until(
        async () => (await cancelControl())?.stages['intent-established']?.state === 'reached',
        5000,
      )
      .catch(() => undefined)
    expect((await cancelControl())?.stages['intent-established']).toMatchObject({
      state: 'reached',
    })

    // From the confirmed cancel on: no new Model request, no new Tool action, whatever arrives late.
    const requests = w.modelCalls.length
    release.resolve()
    await w.until(() => w.replies.length === 1)
    for (let check = 0; check < 3; check += 1) await w.until(async () => true)
    expect(w.modelCalls).toHaveLength(requests)
    expect(w.tools.invoke.calls).toHaveLength(0)
    // The cost the call reported is readable from the account outlet.
    const accounts = w.outlet.received(TENANT)
    expect(accounts.map(kept => kept.account.cost)).toContainEqual([
      expect.objectContaining({ lexeme: '0.25' }),
    ])
    // The same operation again is recognised: the original receipt, no second terminal.
    expect(await cancel()).toEqual({ ok: receipt })
  })
})

describe('J4: stopCall interrupts one call and leaves the rest alone', () => {
  it('J4 interrupts the Model call and the Run goes on with the next request', async () => {
    // Deviation from the closure specification: the Loop sends no Model call while a Tool result is
    // outstanding, so "a Tool call pending and a Model call interrupted" does not occur. The Run
    // goes on through a `continue` progression instead: after the interrupted call the Agent asks
    // the Model again. The Tool call is the case of the next test.
    const stopped = gate()
    const never = new Promise<void>(() => undefined)
    const w = await openW2World({
      progression: 'continue',
      model: a =>
        a.index === 0
          ? {
              parts: [replyText('late', 'late')],
              reason: 'stop',
              partial: [replyText('part', 'a part of the reply')],
              cost: '0.25',
              hold: stopped.promise,
            }
          : a.index === 1
            ? { parts: [replyText('r1', 'after the interrupt')], reason: 'stop' }
            : // The progression asks again after each reply; the third call is held for good.
              { parts: [replyText('r2', 'held')], reason: 'stop', hold: never },
    })
    worlds.push(w)
    await w.createSession('j4a')
    await w.accept('j4a-in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
    // Session knows the call as the producer under its invocation reference, as AD-05 writes it.
    await w.until(async () => (await w.modelReferences()).length === 1)
    const [call] = await w.modelReferences()
    if (call === undefined) throw new Error('no Model call')
    const execution = await w.execution()
    const stop = (name = 'j4a-stop') =>
      w.intake.work.stopCall({
        ...intakeAccess,
        operation: operationId(name),
        producer: { kind: 'model', call },
      })

    // Session binds the call as a producer when AD-02 has interpreted the Agent's event; a stop sent
    // before that answers `not-found` under its own operation. The scenario sends the stop again,
    // under a new operation, until Session knows the call (at most 5 seconds).
    let attempt = 0
    let first = ok(await stop(`j4a-stop-${attempt}`))
    const end = Date.now() + 5000
    while (first.answer.kind === 'not-found' && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 50))
      attempt += 1
      first = ok(await stop(`j4a-stop-${attempt}`))
    }
    const receipt = first
    // Session found the call and requested the interrupt.
    expect(receipt.answer).toMatchObject({ kind: 'requested' })
    // 1. The call is interrupted: the Agent holds the control and the producer confirmed it.
    const interrupt = async () =>
      ok(await w.journal().load({ ...w.agentAccess, execution })).controls.find(
        record => record.command.kind === 'interrupt-model',
      )
    await w
      .until(
        async () => (await interrupt())?.stages['producer-confirmed']?.state === 'reached',
        5000,
      )
      .catch(() => undefined)
    expect((await interrupt())?.stages['producer-confirmed']).toMatchObject({ state: 'reached' })
    stopped.resolve()
    // 2. The Run goes on: the Agent asks the Model a second time.
    await w.until(() => w.modelCalls.length >= 2, 10_000)
    expect(ok(await w.transactions.readWork(intakeAccess)).run.kind).toBe('active')
    // 3. The same operation again is recognised: the original receipt.
    expect(await stop(`j4a-stop-${attempt}`)).toEqual({ ok: receipt })
  })

  it('J4 answers unsupported for a Tool target and leaves the Run alone', async () => {
    const hold = gate()
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j4')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'done')], reason: 'stop' },
      tool: () => ({ content: [], hold: hold.promise }),
    })
    worlds.push(w)
    await w.createSession('j4b')
    await w.accept('j4b-in', 'hello')
    await w.until(() => w.toolRequests.length === 1)
    const refused = await w.intake.work.stopCall({
      ...intakeAccess,
      operation: operationId('j4b-stop'),
      producer: { kind: 'tool', call: 'tcall_w2_0' },
    })
    hold.resolve()
    expect(refused).toMatchObject({ failure: { kind: 'unsupported' } })
    expect((await activeRun(w)).run).toBeDefined()
  })
})
