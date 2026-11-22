// @module-tag slow
import { expect, it } from 'vitest'
import { ok } from './world.ts'
import { openW2World, replyText, toolCallBlock } from './w2-world.ts'

it('completes the Run after the Tool refused an action for good', async () => {
  const answer = Promise.withResolvers<void>()
  const w = await openW2World({
    model: a =>
      a.index === 0
        ? { parts: [toolCallBlock('refused-tool')], reason: 'tool-suggestions' }
        : {
            parts: [replyText(`reply-${a.index}`, 'done without the tool')],
            reason: 'stop',
            hold: answer.promise,
          },
  })
  let round: Promise<unknown> = Promise.resolve()
  try {
    w.tools.invoke.always(async () => ({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
    }))
    await w.createSession('tool-refused')
    round = w.runRound(1, 'use the tool and finish', 15_000)
    await w.until(() => w.modelCalls.length === 2, 15_000)
    const asking = ok(await w.probeLog.load({ ...w.agentAccess, execution: await w.execution() }))
    expect(asking.checkpoint.voided).toMatchObject([
      { kind: 'tool', step: 'step-1', cause: 'not-accepted' },
    ])
    answer.resolve()
    await round
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
    expect(w.modelCalls).toHaveLength(2)
    const [ended] = w.endedRuns()
    if (ended === undefined) throw new Error('the Run did not end')
    expect(await w.runEnd(ended.run)).toEqual({ conclusion: 'complete', failure: null })
    await w.until(() => w.settled(ended.execution), 10_000)
  } finally {
    answer.resolve()
    await round.catch(() => undefined)
    await w.close()
  }
})
