// J6: the read and write counts of a fixed round shape over many rounds, the receives per round
// (R2-D42), the curve to the limit (R2-D67) and the measurement events (R2-D17). The counts are
// deterministic for this shape and prove nothing beyond it: J6 does not decide E9.
//
// The shape of one round of the plain test is one input of a fixed size and one reply. The tool shape
// adds one Tool call: two Model requests (before and after the Tool), one Tool invoke, one reply each.
// Both run until a round does not end (a limit of the product) or 200 rounds, and the curve says where
// that was. The windows are those of R2-D67 and the ruling of 08:15: rounds 11 to 30 against the 20
// rounds before the limit (plain: rounds 141 to 160, which the ruling of 08:15 names).
//
// The events written to `e9-events-<shape>.jsonl` are those of the `measure` observers of Session,
// Context and Agent, read with one clock (`performance.now()`); `round-complete` is the explicit event
// of Session (R2-D17 P2). The counts, the curve and the limit are written before any assertion runs.
// @module-tag slow
// Why slow: up to 200 rounds of real Workers and real files.
import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import type { RoundCount } from './w2-measure.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const OUT = new URL('../../../../../tmp/line-session-run/w2/C-JOINT/', import.meta.url)
const MAX_ROUNDS = 200
const WINDOW = 20
/** The items every round must show alike: all but the number of the round, the retries and the bytes. */
const stable = ({
  round: _round,
  storageRollbacks: _rollbacks,
  ad02Refused: _refused,
  maxCommitBytes: _maxCommit,
  maxReadBytes: _maxRead,
  storageCommitBytes: _commitBytes,
  ...rest
}: RoundCount) => rest

type Shape = 'tool' | 'plain'

function scriptOf(shape: Shape) {
  return (a: { index: number }) =>
    shape === 'tool' && a.index % 2 === 0
      ? { parts: [toolCallBlock(`tc-${a.index}`)], reason: 'tool-suggestions' as const }
      : { parts: [replyText(`r${a.index}`, 'a fixed reply')], reason: 'stop' as const }
}

const sum = (table: Readonly<Record<string, number>>, prefix: string): number =>
  Object.entries(table)
    .filter(([handler]) => handler.startsWith(prefix))
    .reduce((total, [, value]) => total + value, 0)

/**
 * The curve of R2-D67, one line per round: the rows the reads of the Agent records handlers returned
 * (`er_read_rows`), the largest single read of the Session snapshot in bytes, the bytes of the
 * commits of the round, and the largest single reads of the Agent records handlers, added up.
 */
function curveOf(table: readonly RoundCount[]): string {
  const lines = ['round,er_read_rows,session_snapshot_bytes,write_bytes,er_read_bytes']
  for (const count of table)
    lines.push(
      [
        count.round,
        sum(count.storageReadRows, 'execution-record.'),
        count.maxReadBytes['session.work'] ?? 0,
        count.storageCommitBytes,
        sum(count.maxReadBytes, 'execution-record.'),
      ].join(','),
    )
  return `${lines.join('\n')}\n`
}

/**
 * Runs rounds until one does not end or `MAX_ROUNDS`, writes the counts, the curve and the events,
 * and returns the rounds that ended, with the number of the round that did not (null when none).
 */
async function runToLimit(shape: Shape, w: W2World) {
  const events = w.startRecording()
  await w.createSession(`j6-${shape}`)
  let failed: number | null = null
  try {
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const ended = await w.runRound(round, 'one fixed question', 20_000).then(
        () => true,
        () => false,
      )
      if (!ended) {
        failed = round
        break
      }
    }
  } finally {
    const table = w.counters.rounds
    writeFileSync(new URL(`counts-${shape}.json`, OUT), JSON.stringify(table, null, 1))
    writeFileSync(new URL(`j6-curve-${shape}.csv`, OUT), curveOf(table))
    writeFileSync(new URL(`e9-events-${shape}.jsonl`, OUT), events.lines())
    writeFileSync(
      new URL(`j6-limit-${shape}.json`, OUT),
      JSON.stringify(
        {
          shape,
          completed: failed === null ? table.length : failed - 1,
          failedRound: failed,
          refusedReads: w.counters.refusedReads.slice(0, 3),
        },
        null,
        1,
      ),
    )
  }
  return {
    completed: failed === null ? [...w.counters.rounds] : w.counters.rounds.slice(0, -1),
    failed,
  }
}

describe('J6: fixed round counts', () => {
  it(
    'J6 plain shape: to the limit, the counts of rounds 11-30 equal those of rounds 141-160',
    { timeout: 3_600_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('plain'),
      })
      worlds.push(w)
      const { completed } = await runToLimit('plain', w)
      expect(completed.length).toBeGreaterThanOrEqual(160)

      // One Model result is received per round and nothing else.
      for (const count of completed)
        expect(count).toMatchObject({ modelReceives: 1, toolReceives: 0 })
      // The windows: no item may grow with the number of rounds.
      const early = completed.slice(10, 30).map(stable)
      const late = completed.slice(140, 160).map(stable)
      expect(late).toEqual(early)
    },
  )

  it(
    'J6 tool shape: to the limit, two Model results and one Tool result each round, the counts of rounds 11-30 equal those before the limit',
    { timeout: 3_600_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('tool'),
      })
      worlds.push(w)
      const { completed } = await runToLimit('tool', w)
      expect(completed.length).toBeGreaterThanOrEqual(30 + WINDOW)
      for (const count of completed)
        expect(count).toMatchObject({
          modelRequests: 2,
          toolInvokes: 1,
          modelReceives: 2,
          toolReceives: 1,
        })
      const early = completed.slice(10, 30).map(stable)
      const late = completed.slice(-WINDOW).map(stable)
      expect(late).toEqual(early)
    },
  )
})
