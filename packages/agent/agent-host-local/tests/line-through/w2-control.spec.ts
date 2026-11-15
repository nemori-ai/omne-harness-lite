// @module-tag slow
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
    const execution = await w.execution()

    const operation = operationId('j3-cancel')
    const cancel = () =>
      w.intake.work.cancelRun({ ...intakeAccess, operation, run: run.run, urgency: 'graceful' })
    const receipt = ok(await cancel())
    await w.until(async () => (await w.lastTerminal()) === String(run.run))
    expect(ok(await w.transactions.readWork(intakeAccess)).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'cancelled' },
    })
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

    const requests = w.modelCalls.length
    release.resolve()
    await w.until(() => w.replies.length === 1)
    for (let check = 0; check < 3; check += 1) await w.until(async () => true)
    expect(w.modelCalls).toHaveLength(requests)
    expect(w.tools.invoke.calls).toHaveLength(0)
    const reported = () =>
      w.outlet
        .received(TENANT)
        .some(kept => kept.account.cost.some(cost => 'lexeme' in cost && cost.lexeme === '0.25'))
    await w.until(reported, 5000).catch(() => undefined)
    const accounts = w.outlet.received(TENANT)
    expect(accounts.map(kept => kept.account.cost)).toContainEqual([
      expect.objectContaining({ lexeme: '0.25' }),
    ])
    expect(await cancel()).toEqual({ ok: receipt })
  })
})

describe('J4: stopCall interrupts one call and leaves the rest alone', () => {
  it('J4 interrupts the Model call and the Run goes on with the next request', async () => {
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
            : { parts: [replyText('r2', 'held')], reason: 'stop', hold: never },
    })
    worlds.push(w)
    await w.createSession('j4a')
    await w.accept('j4a-in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
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

    let attempt = 0
    let first = ok(await stop(`j4a-stop-${attempt}`))
    const end = Date.now() + 5000
    while (first.answer.kind === 'not-found' && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 50))
      attempt += 1
      first = ok(await stop(`j4a-stop-${attempt}`))
    }
    const receipt = first
    expect(receipt.answer).toMatchObject({ kind: 'requested' })
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
    await w.until(() => w.modelCalls.length >= 2, 10_000)
    expect(ok(await w.transactions.readWork(intakeAccess)).run.kind).toBe('active')
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
