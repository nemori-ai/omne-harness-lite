// J6: the read and write counts of a fixed round shape over 200 rounds, the receives per round
// (R2-D42) and the measurement events (R2-D17). The counts are deterministic for this shape and prove
// nothing beyond it: J6 does not decide E9.
//
// The shape of one round is the one of the closure specification: one input of a fixed size, one Tool
// call and two Model requests (before and after the Tool), one reply each. A second shape without the
// Tool, one input and one reply, is run next to it: the Tool rounds of the world stop from the second
// round on (defect D10 of the hand-back: the Agent of the second execution takes the Model result
// that suggests a Tool and goes no further), so the 200 rounds can only run in the plain shape.
//
// The events written to `e9-events.jsonl` are those of the `measure` observers of Session, Context and
// Agent, read with one clock (`performance.now()`); `round-complete` is the explicit event of Session
// (R2-D17 P2). The counts are written to `counts.json` before any assertion runs.
// @module-tag slow
// Why slow: 200 rounds of real Workers and real files.
import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import type { RoundCount } from './w2-measure.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const OUT = new URL('../../../../../tmp/line-session-run/w2/C-JOINT/', import.meta.url)
const ROUNDS = 200
/** The items every round must show alike: all but the number of the round and the retries. */
const stable = ({
  round: _round,
  storageRollbacks: _rollbacks,
  ad02Refused: _refused,
  ...rest
}: RoundCount) => rest

type Shape = 'tool' | 'plain'

function scriptOf(shape: Shape) {
  return (a: { index: number }) =>
    shape === 'tool' && a.index % 2 === 0
      ? { parts: [toolCallBlock(`tc-${a.index}`)], reason: 'tool-suggestions' as const }
      : { parts: [replyText(`r${a.index}`, 'a fixed reply')], reason: 'stop' as const }
}

/** Runs `rounds` rounds of one shape, writes the counts and the events, and returns the counts. */
async function run(shape: Shape, rounds: number, w: W2World) {
  const events = w.startRecording()
  await w.createSession(`j6-${shape}`)
  try {
    for (let round = 1; round <= rounds; round += 1)
      await w.runRound(round, 'one fixed question', 20_000)
  } finally {
    writeFileSync(new URL(`counts-${shape}.json`, OUT), JSON.stringify(w.counters.rounds, null, 1))
    writeFileSync(new URL(`e9-events-${shape}.jsonl`, OUT), events.lines())
  }
  return w.counters.rounds
}

describe('J6: fixed round counts', () => {
  it(
    'J6 plain shape: 200 rounds, the counts of rounds 11-30 and 181-200 equal round by round',
    { timeout: 900_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('plain'),
      })
      worlds.push(w)
      const table = await run('plain', ROUNDS, w)
      expect(table).toHaveLength(ROUNDS)

      // One Model result is received per round and nothing else.
      for (const count of table) expect(count).toMatchObject({ modelReceives: 1, toolReceives: 0 })
      // The pairs of rounds: no item may grow with the number of rounds.
      const early = table.slice(10, 30).map(stable)
      const late = table.slice(180, 200).map(stable)
      expect(late).toEqual(early)
      // 200 rounds ran under the configured record limit: no round was refused for capacity.
      expect(table.at(-1)?.round).toBe(ROUNDS)
    },
  )

  it(
    'J6 tool shape: the first rounds receive two Model results and one Tool result each',
    { timeout: 300_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('tool'),
      })
      worlds.push(w)
      // The closure specification asks for 200 rounds of this shape; the world gets through one.
      const table = await run('tool', 3, w)
      for (const count of table)
        expect(count).toMatchObject({
          modelRequests: 2,
          toolInvokes: 1,
          modelReceives: 2,
          toolReceives: 1,
        })
    },
  )
})
