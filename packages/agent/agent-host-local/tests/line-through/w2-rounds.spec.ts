// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import { EARLIER, intakeAccess, ok, strangerAccess } from './world.ts'
import { ad04RowsOf, historyReadGrowth, type RoundCount } from './w2-measure.ts'
import {
  reasoningStateBlock,
  replyText,
  toolCallBlock,
  openW2World,
  type W2World,
} from './w2-world.ts'

const NEW_ROWS_PER_ROUND = 2
const AD04_READS = 2
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

    expect(w.admits).toHaveLength(1)
    expect(w.assembled.map(messages => messages.map(textOf))).toEqual([[...EARLIER]])
    expect(first).toMatchObject({ modelRequests: 1, modelReceives: 1, toolInvokes: 0 })
    expect(first.ad02Commits).toBeGreaterThan(0)
    expect(ok(await w.transactions.readWork(intakeAccess)).run).toMatchObject({
      kind: 'terminal',
      terminal: { outcome: 'completed' },
    })

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
      const { emitted, readThrough } = await w.progress(await w.execution())
      expect(readThrough).toBe(emitted)
    }
    console.log(
      'J1-AD04',
      JSON.stringify(
        w.counters.rounds.map(count => ({
          round: count.round,
          ad04ProjectedRows: count.ad04ProjectedRows,
          ad04StableRecompute: count.ad04StableRecompute,
          ad04ReadCalls: count.ad04ReadCalls,
          ad04ReadRows: count.ad04ReadRows,
        })),
      ),
      JSON.stringify(w.counters.ad04Rows, (_key, value: unknown) =>
        typeof value === 'bigint' ? Number(value) : value,
      ),
    )
    const rows = [2, 3].map(round => ({ round, ...ad04RowsOf(w.counters.ad04Rows, round) }))
    expect(
      rows.map(({ round, added, read, reread }) => ({ round, added: added.length, read, reread })),
    ).toEqual(
      rows.map(({ round, added, boundary }) => ({
        round,
        added: NEW_ROWS_PER_ROUND,
        read: [boundary, ...added],
        reread: [boundary, ...added.slice(0, -1)],
      })),
    )

    const sizes = w.assembled.map(messages => messages.length)
    expect(sizes).toHaveLength(3)
    expect(sizes[1]).toBeGreaterThan(sizes[0] ?? 0)
    expect(sizes[2]).toBeGreaterThan(sizes[1] ?? 0)
    const second = w.assembled[1]?.map(textOf) ?? []
    expect(second).toEqual(expect.arrayContaining(['question 1', 'answer 0']))
    const [, two, three] = w.counters.rounds
    expect(two?.ad04ReadCalls).toBe(three?.ad04ReadCalls)
    expect(two?.ad04ReadRows).toBe(three?.ad04ReadRows)
    expect(
      historyReadGrowth(w.counters.rounds, NEW_ROWS_PER_ROUND, AD04_ROWS_FOR, AD04_READS),
    ).toEqual([])
    expect(two?.ad04ProjectedRows).toBe(three?.ad04ProjectedRows)
    for (const count of [two, three])
      expect(count?.ad04ProjectedRows).toBe(AD04_ROWS_FOR(NEW_ROWS_PER_ROUND))
    expect(two?.probeReadCalls).toBe(w.counters.rounds[0]?.probeReadCalls)
    expect(three?.probeReadCalls).toBe(two?.probeReadCalls)
  })
})

describe('J1 negative control of the history read criterion', () => {
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
    expect(saved).toHaveProperty('ok')
  })

  it('J2 a Tool action whose admission is unavailable is denied, the denial goes to the Model, and the Run completes', async () => {
    const w = await openW2World({
      earlier: 'session',
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j2u')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'could not run it')], reason: 'stop' },
      toolRequests: {
        describe: async () => ({
          failure: { kind: 'unavailable', owner: 'agentToolRequests', diagnostic: 'scenario' },
        }),
      },
    })
    worlds.push(w)
    await w.createSession('j2u')
    await w.runRound(1, 'read the file')
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(0)
    const tools = (w.assembled[1] ?? []).filter(message => message.role === 'tool')
    expect(tools).toHaveLength(1)
  })

  it('J2 the second step of a Run, whose result carries a reasoning_state, wakes the Agent and the Run completes', async () => {
    const w = await openW2World({
      earlier: 'session',
      model: a =>
        a.index === 0
          ? { parts: [toolCallBlock('tc-j2r')], reason: 'tool-suggestions' }
          : { parts: [replyText(`r${a.index}`, 'not allowed')], reason: 'stop' },
      modelDelivery: delivery =>
        delivery.kind === 'result' && delivery.consumer.work.endsWith('/step-2')
          ? {
              ...delivery,
              parts: [
                { kind: 'sealed', trims: [], block: reasoningStateBlock('rs2') },
                ...delivery.parts,
              ],
            }
          : delivery,
      toolRequests: {
        describe: async () => ({
          failure: { kind: 'unavailable', owner: 'agentToolRequests', diagnostic: 'scenario' },
        }),
      },
    })
    worlds.push(w)
    await w.createSession('j2r')
    await w.runRound(1, 'list the files')
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.modelCalls).toHaveLength(2)
    expect(w.receivedFailures).toEqual([])
    const execution = await w.execution()
    const page = ok(
      await w.probeLog.output.read({ ...w.agentAccess, execution, after: null, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('the output has a gap')
    const received = page.events.filter(event => event.body.kind === 'entry')
    expect(received).toHaveLength(2)
    const replies = page.events.flatMap(event =>
      event.body.kind === 'message' && event.body.message.role === 'assistant'
        ? [event.body.message]
        : [],
    )
    expect(replies).toHaveLength(2)
    expect(replies[1]?.blocks.map(block => block.kind)).toEqual(['text'])
    expect(textOf(replies[1]!)).toBe('not allowed')
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
    expect(toolResultOf(w.assembled[1] ?? [])).toHaveLength(1)
    expect(toolResultOf(w.assembled[2] ?? [])).toHaveLength(1)
    expect(w.counters.rounds[1]).toMatchObject({ toolInvokes: 0 })
    expect(w.counters.rounds[1]?.historyRows).toBeGreaterThan(0)
  })
})
