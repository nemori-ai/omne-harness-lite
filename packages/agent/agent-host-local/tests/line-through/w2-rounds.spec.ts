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
import { historyReadGrowth, type RoundCount } from './w2-measure.ts'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

/** The rows a round adds to the session log: its input and its reply. */
const NEW_ROWS_PER_ROUND = 2
/**
 * The AD-04 read path per round from the second on: one page read of the rows after the kept cursor
 * and, because the cursors Session issues are signed and only one row early is usable, one more read
 * of the rows up to the row before the upper bound to get that cursor (`mint` in session-adapters
 * `src/cordis/history-source.ts`, C-FIX-CURSOR). Measured in rounds 2 and 3: 2 reads, 5 rows.
 */
const AD04_READS = 2
/**
 * The rows the AD-04 read path reads for `added` new rows: the page read returns the added rows and the
 * row before them (the signed cursor of Session is usable only one row early), and the mint read,
 * which gets that cursor for the next round, reads the rows of this round again. So: `2 * added + 1`
 * (R2-D75). Rounds 2 and 3 measure 5 rows for 2 added rows.
 */
const AD04_ROWS_FOR = (added: number) => 2 * added + 1

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
    const w = await openW2World({
      earlier: 'session',
      model: a => ({
        parts: [replyText(`r${a.index}`, `answer ${a.index}`)],
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
    // S3 item 3: the history page reads of rounds 2 and 3 depend on the rows the round before added,
    // not on the length of the history (R2-D72). Rounds 2 and 3 read the same, and the read is the
    // bound for the rows that were added.
    const [, two, three] = w.counters.rounds
    expect(two?.ad04ReadCalls).toBe(three?.ad04ReadCalls)
    expect(two?.ad04ReadRows).toBe(three?.ad04ReadRows)
    expect(
      historyReadGrowth(w.counters.rounds, NEW_ROWS_PER_ROUND, AD04_ROWS_FOR, AD04_READS),
    ).toEqual([])
    // The two assertions of the first form of the criterion, for the AD-04 read path alone (the probes
    // left out): rounds 2 and 3 hand out only the rows the round before added, and nothing handed out
    // before is handed out again. R2-D74: they stay as they were until Reduce rules on them.
    for (const count of [two, three]) {
      expect(count?.ad04ProjectedRows).toBe(2)
      expect(count?.ad04StableRecompute).toBe(0)
    }
    // The probes of the qualification check read one row each, and their number is that of round 1.
    expect(two?.probeReadCalls).toBe(w.counters.rounds[0]?.probeReadCalls)
    expect(three?.probeReadCalls).toBe(two?.probeReadCalls)
  })
})

describe('J1 negative control of the history read criterion', () => {
  // The criterion must turn red when the reads grow with the history: the counts of the real rounds
  // with the rows of the earlier rounds read again in round 3 (a source that reads from the start).
  it('J1 a round that reads the earlier rows again breaks the criterion', async () => {
    const w = await openW2World({
      earlier: 'session',
      model: a => ({ parts: [replyText(`r${a.index}`, `answer ${a.index}`)], reason: 'stop' }),
    })
    worlds.push(w)
    await w.createSession('j1n')
    for (const round of [1, 2, 3]) await w.runRound(round, `question ${round}`)
    const real = w.counters.rounds
    expect(historyReadGrowth(real, NEW_ROWS_PER_ROUND, AD04_ROWS_FOR, AD04_READS)).toEqual([])
    const [one, two, three] = real as [RoundCount, RoundCount, RoundCount]
    const fromStart: RoundCount[] = [
      one,
      two,
      { ...three, ad04ReadRows: three.ad04ReadRows + one.ad04ReadRows + two.ad04ReadRows },
    ]
    const broken = historyReadGrowth(fromStart, NEW_ROWS_PER_ROUND, AD04_ROWS_FOR, AD04_READS)
    expect(broken.length).toBeGreaterThan(0)
    expect(broken.join(' ')).toContain('round 3')
  })
})

describe('J1 replay block', () => {
  // R7 item 5, S3-3: the request of round 2 carries the reasoning_state block of round 1. R2-D70
  // names this a deviation of wave 2: the delivery has no scope/format channel, and the Agent Loop
  // answers `unsupported` to a result with a reasoning_state or thinking part
  // (agent/src/loop/model-result.ts). L-MODEL adds the replay channel in wave 3. Not written as passing.
  it.todo(
    'J1 the request of round 2 replays the reasoning_state block of round 1 (R2-D70 named deviation, wave 3)',
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
