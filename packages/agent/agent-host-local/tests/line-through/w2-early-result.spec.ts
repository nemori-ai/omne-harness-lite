// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const ROUNDS = 5
const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

type CallEntry = Readonly<{ consumption?: string; delivered?: string; result?: unknown }>

function outOfOrder(log: readonly Readonly<{ kind: string; payload: unknown }>[]): string[] {
  const entries = log.map(entry => ({ kind: entry.kind, value: entry.payload as CallEntry }))
  const delivered = entries.flatMap((entry, at) =>
    entry.kind === 'call.execution-fact' && entry.value.delivered !== undefined
      ? [{ consumption: entry.value.delivered, at }]
      : [],
  )
  return delivered.flatMap(({ consumption, at }) => {
    const bound = entries.findIndex(
      entry => entry.kind === 'call.bound' && entry.value.consumption === consumption,
    )
    const processed = entries.findIndex(
      entry =>
        entry.kind === 'call.execution-fact' &&
        entry.value.consumption === consumption &&
        entry.value.result !== undefined,
    )
    return bound !== -1 && bound < at && (processed === -1 || at < processed)
      ? []
      : [`${consumption}: bound ${bound}, delivered ${at}, processed ${processed}`]
  })
}

it.each([
  ['the routed journal', 'routed', 0],
  ['the Agent journal', undefined, 20],
] as const)(
  'Tool results that come back before the Agent waits for them: the Run completes through %s, and the session log binds each call before its delivery and delivers before it processes',
  async (_label, reception, delay) => {
    const w = await openW2World({
      model: admission =>
        admission.index < ROUNDS
          ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
          : { parts: [replyText('done', 'every file read')], reason: 'stop' },
      tool: index => ({ content: [replyText(`tool-${index}`, `the content of file ${index}`)] }),
      defaultDelayMs: delay,
      earlier: 'session',
      ...(reception === undefined ? {} : { reception }),
      maxRunSteps: 1000,
    })
    worlds.push(w)
    await w.createSession(`early-result-${reception ?? 'journal'}`)
    await w.runRound(1, `read the ${ROUNDS} files one by one`, 30_000, 'settled')
    expect(await w.lastOutcome()).toBe('completed')
    expect(w.tools.invoke.calls).toHaveLength(ROUNDS)
    const log = await w.logOf(['call.bound', 'call.execution-fact'])
    expect(
      log.filter(
        entry =>
          entry.kind === 'call.execution-fact' &&
          (entry.payload as CallEntry).delivered !== undefined,
      ).length,
    ).toBeGreaterThanOrEqual(ROUNDS)
    expect(outOfOrder(log)).toEqual([])
  },
  60_000,
)
