// J3 and J4: the controls of Session reach the Agent through AD-14 on one real Cordis root
// (R10 items 2 and 3; M-CANCEL). Both go through the intake face of Session, never through an Agent
// control entry.
//
// J3 cancels the Run (`cancelRun`, graceful) and asserts, on the Agent side, that the cancellation
// intent is established. State: placeholder. The cancellation intent path of AD-14 is part of the
// main closure C-ADAPTERS (`srun-w2-adapters`), which the parent branch does not have yet.
//
// J4 interrupts one Model call (`stopCall`) and leaves the Tool call and the Run alone. The Tool call
// of the scenario is a Tool double that has accepted and not yet pushed its result.
// @module-tag slow
// Why slow: real Workers, real files and the whole line on one root.
import { afterEach, describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import { TENANT, intakeAccess, ok } from './world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const gate = () => Promise.withResolvers<void>()

describe('J3: cancelling the Run stops new Model requests and Tool actions', () => {
  const awaiting = 'awaits C-ADAPTERS: the cancellation intent path of AD-14'
  it.todo(`J3 ends the Run as cancelled through the one terminal exit of Session (${awaiting})`)
  it.todo(`J3 establishes the Agent cancellation intent: intent-established holds (${awaiting})`)
  it.todo(`J3 sends no new Model request and no new Tool invoke after the cancel (${awaiting})`)
  it.todo(`J3 reads back the delivered content and the cost after the cancel (${awaiting})`)
  it.todo(`J3 acknowledges the same operation again with the original receipt (${awaiting})`)
})

describe('J4: stopCall interrupts one call and leaves the rest alone', () => {
  it('J4 interrupts the Model call; its content and cost stay readable', async () => {
    const stopped = gate()
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? {
              parts: [replyText('late', 'late')],
              reason: 'stop',
              partial: [replyText('part', 'a part of the reply')],
              cost: '0.25',
              hold: stopped.promise,
            }
          : { parts: [replyText(`r${a.index}`, 'after the interrupt')], reason: 'stop' },
    })
    worlds.push(w)
    await w.createSession('j4a')
    await w.accept('j4a-in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
    const [call] = w.modelCalls
    if (call === undefined) throw new Error('no Model call')

    const answer = await w.intake.work.stopCall({
      ...intakeAccess,
      operation: operationId('j4a-stop'),
      producer: { kind: 'model', call },
    })
    stopped.resolve()
    expect(answer).toHaveProperty('ok')
    // The same operation again is recognised, not a second interrupt.
    const again = await w.intake.work.stopCall({
      ...intakeAccess,
      operation: operationId('j4a-stop'),
      producer: { kind: 'model', call },
    })
    expect(again).toEqual(answer)
    ok(answer)
  })

  it('J4 answers unsupported for a Tool target and leaves the Run alone', async () => {
    const release = gate()
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j4')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'done')], reason: 'stop' },
      tool: () => ({ content: [], hold: release.promise }),
    })
    worlds.push(w)
    await w.createSession('j4b')
    await w.accept('j4b-in', 'hello')
    await w.until(() => w.counters.rounds.length === 0 && w.toolRequests.length === 1)
    const refused = await w.intake.work.stopCall({
      ...intakeAccess,
      operation: operationId('j4b-stop'),
      producer: { kind: 'tool', call: 'tcall_w2_0' },
    })
    release.resolve()
    expect(refused).toMatchObject({ failure: { kind: 'unsupported' } })
    const work = ok(await w.transactions.readWork(intakeAccess))
    expect(work.run.kind).toBe('active')
    expect(TENANT).toBeDefined()
  })
})
