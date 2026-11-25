// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { intakeAccess, ok } from './world.ts'
import { entriesOf } from '../host-support.ts'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const ROLLED_BACK = {
  failure: { kind: 'unavailable', dependency: 'journal', diagnostic: 'rolled back' },
}

describe('#1369: the result of a call let go after its Run was cancelled', () => {
  it('keeps its cost when its first received commit is rolled back: the Model pushes it again', async () => {
    const release = Promise.withResolvers<void>()
    const armed = { on: false, failed: 0 }
    const w = await openW2World({
      reception: 'routed',
      model: a =>
        a.index === 0
          ? {
              parts: [toolCallBlock('tc-late')],
              reason: 'tool-suggestions',
              cost: '0.25',
              hold: release.promise,
            }
          : { parts: [replyText(`r${a.index}`, 'must not be asked')], reason: 'stop' },
      receivedCommit: async (commit, input) => {
        if (!armed.on || armed.failed > 0) return commit(input)
        armed.failed += 1
        return ROLLED_BACK
      },
    })
    worlds.push(w)
    await w.createSession('r1')
    await w.accept('r1-in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
    const { run } = ok(await w.transactions.readWork(intakeAccess))
    if (run.kind !== 'active') throw new Error(`the Run is ${run.kind}`)
    const execution = await w.execution()
    const operation = operationId('r1-cancel')
    ok(
      await w.intake.work.cancelRun({
        ...intakeAccess,
        operation,
        run: run.run,
        urgency: 'graceful',
      }),
    )
    await w.until(async () => (await w.lastTerminal()) === String(run.run))

    armed.on = true
    release.resolve()
    await w.until(() => w.replies.length === 1)
    const reported = async () =>
      (await entriesOf(w.freshEntries(), { ...w.agentAccess, execution })).flatMap(entry =>
        entry.kind === 'received' && 'accounts' in entry.delivery
          ? entry.delivery.accounts.map(kept => kept.account?.cost ?? [])
          : [],
      )
    await w.until(async () => (await reported()).length > 0).catch(() => undefined)
    expect(armed.failed).toBe(1)
    expect(w.receivedFailures).toHaveLength(1)
    expect(await reported()).toContainEqual([expect.objectContaining({ lexeme: '0.25' })])
  })
})
