// @module-tag slow
// Real SQLite and production Journal targets; Model and Tool execution use w2-world's scripted providers.
import { expect, it } from 'vitest'
import { readToolDeliveryMaterial } from '@omne-harness/agent'
import { ok } from './world.ts'
import { openW2World, replyText, toolCallBlock } from './w2-world.ts'

it('routes a saved Tool result to its original execution after the next Run starts', async () => {
  const release = Promise.withResolvers<void>()
  const w = await openW2World({
    receptionTargets: 'journal',
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
    await w.runRound(1, 'use the tool and finish', 10_000)
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
    const firstExecution = await w.execution()
    const firstRun = await w.lastTerminal()
    const firstAccess = { ...w.agentAccess, execution: firstExecution }
    const before = ok(await w.freshEntries().read({ ...firstAccess, after: null, limit: 100 }))
    expect(before.caughtUp).toBe(true)
    const original = before.items
      .map(item => item.entry)
      .find(entry => entry.kind === 'received' && entry.delivery.producer === 'tool')
    if (original === undefined || original.kind !== 'received')
      throw new Error('the original Tool result was not saved')
    const material = ok(
      await w.sessionLog.materials.read({ ...w.agentAccess, source: original.material }),
    )
    const delivery = readToolDeliveryMaterial(w.agentAccess, material, original)
    if (delivery === null) throw new Error('the original Tool material is not readable')

    await w.accept('second', 'answer the second question')
    await w.until(() => w.modelCalls.length === 3, 10_000)
    const secondExecution = await w.execution()
    expect(secondExecution).not.toBe(firstExecution)
    const secondAccess = { ...w.agentAccess, execution: secondExecution }
    expect(
      await w.toolReceiver.push({
        access: w.agentAccess,
        delivery,
        signal: new AbortController().signal,
      }),
    ).toHaveProperty('ok')
    expect(ok(await w.freshEntries().read({ ...firstAccess, after: null, limit: 100 }))).toEqual(
      before,
    )
    const during = ok(await w.freshEntries().read({ ...secondAccess, after: null, limit: 100 }))
    expect(during.caughtUp).toBe(true)
    expect(during.items.filter(item => item.entry.kind === 'received')).toHaveLength(0)
    release.resolve()
    await w.until(async () => {
      const terminal = await w.lastTerminal()
      return terminal !== null && terminal !== firstRun
    }, 10_000)
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(1)
    const after = ok(await w.freshEntries().read({ ...secondAccess, after: null, limit: 100 }))
    expect(after.caughtUp).toBe(true)
    const received = after.items.flatMap(item =>
      item.entry.kind === 'received' ? [item.entry] : [],
    )
    expect(received.length).toBeGreaterThan(0)
    for (const entry of received) expect(entry.consumption).not.toBe(original.consumption)
  } finally {
    release.resolve()
    await w.close()
  }
})
