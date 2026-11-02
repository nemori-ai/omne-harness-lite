// J1 and J2: conversation rounds over the whole line on one real Cordis root.
// @module-tag slow
// Why slow: real Workers, real files and the whole line on one root.
import { afterEach, describe, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import { ok, strangerAccess } from './world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

describe('J2: a Tool result enters the next Model request', () => {
  it('J2 invokes the Tool double once, with the request of the fixed schema', async () => {
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j2')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'done')], reason: 'stop' },
    })
    worlds.push(w)
    await w.createSession('j2')
    await w.accept('j2-in', 'hello')
    await w.until(() => w.toolPushes.length === 1)
    await Promise.all(w.toolPushes)
    expect(w.tools.invoke.calls).toHaveLength(1)
    expect(w.toolRequests).toHaveLength(1)
    expect(w.toolRequests[0]?.arguments).toEqual({ original: '{}', effective: '{}', complete: true })
    const execution = await w.execution()
    expect(ok(await w.journal().load({ ...w.agentAccess, execution }))).toBeDefined()
    // Another tenant is denied the execution.
    expect(await w.journal().load({ ...strangerAccess, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
  })
})
