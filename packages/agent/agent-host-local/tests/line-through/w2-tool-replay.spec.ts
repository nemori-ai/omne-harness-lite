// @module-tag slow
import { expect, it } from 'vitest'
import { ok } from './world.ts'
import { openW2World, replyText, toolCallBlock } from './w2-world.ts'

it('answers saved to a Tool result pushed again for its settled execution, and keeps it out of the next Run', async () => {
  const release = Promise.withResolvers<void>()
  const w = await openW2World({
    reception: 'routed',
    model: a =>
      a.index === 0
        ? { parts: [toolCallBlock('first-tool')], reason: 'tool-suggestions' }
        : {
            parts: [replyText(`reply-${a.index}`, 'done')],
            reason: 'stop',
            ...(a.index === 2 ? { hold: release.promise } : {}),
          },
  })
  try {
    await w.createSession('tool-replay')
    await w.runRound(1, 'use the tool and finish', 10_000, 'settled')
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
    const [first] = w.endedRuns()
    const [delivery] = w.toolResults
    if (first === undefined || delivery === undefined)
      throw new Error('the first Run did not save its Tool result')

    await w.accept('second', 'answer the second question')
    await w.until(() => w.modelCalls.length === 3, 10_000)
    const secondExecution = await w.execution()
    expect(secondExecution).not.toBe(first.execution)
    const secondAccess = { ...w.agentAccess, execution: secondExecution }
    const again = await w.toolReceiver.push({
      access: w.agentAccess,
      delivery,
      signal: new AbortController().signal,
    })
    expect(again).toEqual({ ok: { key: delivery.key, evidence: expect.any(Object) } })
    expect(await w.settled(first.execution)).toBe(true)
    const during = ok(await w.probeEntries.read({ ...secondAccess, after: null, limit: 100 }))
    expect(during.caughtUp).toBe(true)
    expect(during.items.filter(item => item.entry.kind === 'received')).toHaveLength(0)
    release.resolve()
    await w.until(async () => {
      const terminal = await w.lastTerminal()
      return terminal !== null && terminal !== first.run
    }, 10_000)
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
  } finally {
    release.resolve()
    await w.close()
  }
})
