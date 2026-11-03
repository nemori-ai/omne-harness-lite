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
import {
  replyText,
  toolCallBlock,
  openW2World,
  type W2World,
  reasoningStateBlock,
} from './w2-world.ts'

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

  it('J1 three rounds: the request grows and the history read returns only the new rows', async () => {
    // The encrypted reasoning block of round 1 (`reasoning_state` of the message model), paired with
    // its reply text.
    const reasoning = reasoningStateBlock('blk_reasoning_state', 'opaque-state-of-round-1', [
      'blk_r0',
    ])
    const w = await openW2World({
      earlier: 'session',
      model: a => ({
        parts:
          a.index === 0
            ? [reasoning, replyText('r0', 'answer 0')]
            : [replyText(`r${a.index}`, `answer ${a.index}`)],
        reason: 'stop',
      }),
    })
    worlds.push(w)
    await w.createSession('j1')
    for (const round of [1, 2, 3]) {
      await w.runRound(round, `question ${round}`)
      // After the round the interpretation has caught up with what the Agent emitted, so the next
      // startRun goes through.
      const { emitted, readThrough } = await w.progress(await w.execution())
      expect(readThrough).toBe(emitted)
    }

    // The request of round n carries the inputs and the replies of the rounds before it.
    const sizes = w.assembled.map(messages => messages.length)
    expect(sizes).toHaveLength(3)
    expect(sizes[1]).toBeGreaterThan(sizes[0] ?? 0)
    expect(sizes[2]).toBeGreaterThan(sizes[1] ?? 0)
    const second = w.assembled[1]?.map(textOf) ?? []
    expect(second).toEqual(expect.arrayContaining(['question 1', 'answer 0']))
    // The reasoning block of round 1 is replayed in the request of round 2.
    const replayed = (w.assembled[1] ?? [])
      .flatMap(message => message.blocks as readonly { kind: string }[])
      .map(block => block.kind)
    expect(replayed).toContain('reasoning_state')

    // Rounds 2 and 3 read only what the round before added to the session log: its input and its
    // reply, whatever the length of round 1; nothing already read is read again.
    const [, two, three] = w.counters.rounds
    for (const count of [two, three]) {
      expect(count?.historyRows).toBe(2)
      expect(count?.projectedRows).toBe(2)
      expect(count?.stableRecompute).toBe(0)
    }
  })
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

  it('J2 the Tool result enters the next request of the round and the request of round 2', async () => {
    const w = await openW2World({
      earlier: 'session',
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j2b')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, `answer ${a.index}`)], reason: 'stop' },
    })
    worlds.push(w)
    await w.createSession('j2b')
    await w.runRound(1, 'read the file')
    await w.runRound(2, 'and again')
    expect(w.tools.invoke.calls).toHaveLength(1)

    const toolResultOf = (messages: (typeof w.assembled)[number]) =>
      messages.filter(message => message.role === 'tool')
    // The next Model request of the same round has the Tool result of that call.
    expect(toolResultOf(w.assembled[1] ?? [])).toHaveLength(1)
    // The request of round 2 still has it: it comes from the history read, and the Tool double is not
    // asked again.
    expect(toolResultOf(w.assembled[2] ?? [])).toHaveLength(1)
    expect(w.counters.rounds[1]).toMatchObject({ toolInvokes: 0 })
    // AD-02 wrote the result into the session log: the second round read it back as a history row.
    expect(w.counters.rounds[1]?.historyRows).toBeGreaterThan(0)
  })
})
