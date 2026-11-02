// J1 and J2: conversation rounds over the whole line on one real Cordis root.
//
// Real: the product parts of ./w2-world.ts, with AD-02 (the Agent's publication interpreted into the
// session log) and the handoff provider on the real sqlite-provider. Doubles: the Model and the Tool
// (fixed delays), the Tool request preparation (R2-D36), the Runtime Context handoff, and the earlier
// context, which is the history of the K-RQ holder double: the AD-04 history source is installed in
// the world only by `earlier: 'session'`, and the Request Context refuses its first page (the
// defect D3 of the report: the Session model view starts at sequence 1, Request Context reads from
// 0), so no scenario here reads the earlier rounds from the Session log yet.
//
// Placeholders name what they wait for. D3 and D4 are the combination defects of the first batch of
// C-JOINT (attempt 502-r3-a2), handed back with their reproductions.
// @module-tag slow
// Why slow: real Workers, real files and the whole line on one root.
import { afterEach, describe, expect, it } from 'vitest'
import { EARLIER, intakeAccess, ok, strangerAccess } from './world.ts'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const textOf = (message: { blocks: readonly unknown[] }): string =>
  message.blocks.map(block => (block as { text?: string }).text ?? '').join('')

describe('J1: three rounds of one conversation', () => {
  it('J1 round 1: one Model request on the earlier context, its result saved, the Run ends', async () => {
    const w = await openW2World({
      model: a => ({ parts: [replyText(`r${a.index}`, `answer ${a.index}`)], reason: 'stop' }),
    })
    worlds.push(w)
    await w.createSession('j1')
    const first = await w.runRound(1, 'first question')

    // One Model request, built from the earlier context; the reply was saved by the receiver.
    expect(w.admits).toHaveLength(1)
    expect(w.assembled.map(messages => messages.map(textOf))).toEqual([[...EARLIER]])
    expect(first).toMatchObject({ modelRequests: 1, modelReceives: 1, toolInvokes: 0 })
    // AD-02 interpreted the Agent's events into the session log: its commits are counted.
    expect(first.ad02Commits).toBeGreaterThan(0)
    // The Run ended through the one terminal exit of Session.
    expect(ok(await w.transactions.readWork(intakeAccess)).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'completed' },
    })

    // Another tenant reads neither the execution nor the session.
    const execution = await w.execution()
    expect(await w.journal().load({ ...strangerAccess, execution })).toEqual({
      failure: { kind: 'denied', action: 'load' },
    })
    expect(await w.transactions.readWork(strangerAccess)).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  const defect = 'D4: from the second round AD-02 conflicts on the same-root execution head'
  it.todo(`J1 round 2 and 3: the Model request grows with the earlier rounds (${defect})`)
  it.todo(`J1 round 2 and 3: the history read returns only the new rows (${defect}; D3 for AD-04)`)
  it.todo(`J1 round 2: the request carries the reasoning block of round 1 (${defect})`)
  it.todo(
    `J1 after each round readThrough equals emittedThrough and the next startRun passes (${defect})`,
  )
})

describe('J2: a Tool result enters the next Model request', () => {
  it('J2 invokes the Tool double once with the request of the fixed schema and saves its result', async () => {
    const w = await openW2World({
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j2')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'done')], reason: 'stop' },
    })
    worlds.push(w)
    await w.createSession('j2')
    await w.accept('j2-in', 'read the file')
    await w.until(() => w.toolPushes.length === 1)
    const [saved] = await Promise.all(w.toolPushes)

    expect(w.tools.invoke.calls).toHaveLength(1)
    expect(w.toolRequests).toHaveLength(1)
    expect(w.toolRequests[0]?.arguments).toEqual({
      original: '{}',
      effective: '{}',
      complete: true,
    })
    // The receiver saved the original result of that call.
    expect(saved).toHaveProperty('ok')
  })

  const defect =
    'D4: after the Tool result the Agent run fails and AD-02 conflicts on the execution head'
  it.todo(
    `J2 the next Model request of the round has the Tool result block of the same call (${defect})`,
  )
  it.todo(`J2 the Tool result enters the session log through AD-02 (${defect})`)
  it.todo(
    `J2 round 2 still has the Tool result block, read from history, with no new invoke (${defect})`,
  )
})
