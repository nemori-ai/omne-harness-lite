// @module-tag slow
import { expect, it } from 'vitest'
import { ok } from './world.ts'
import { openW2World, replyText, toolCallBlock } from './w2-world.ts'

it('completes the Run after the Tool refused an action for good', async () => {
  const w = await openW2World({
    model: a =>
      a.index === 0
        ? { parts: [toolCallBlock('refused-tool')], reason: 'tool-suggestions' }
        : { parts: [replyText(`reply-${a.index}`, 'done without the tool')], reason: 'stop' },
  })
  try {
    w.tools.invoke.always(async () => ({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'request', reason: 'the arguments do not match' },
    }))
    await w.createSession('tool-refused')
    await w.runRound(1, 'use the tool and finish', 15_000)
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
    expect(w.modelCalls).toHaveLength(2)
    const ended = ok(await w.fresh().load({ ...w.agentAccess, execution: await w.execution() }))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ended.checkpoint.voided).toMatchObject([
      { kind: 'tool', step: 'step-1', cause: 'not-accepted' },
    ])
  } finally {
    await w.close()
  }
})
