// J6: the read and write counts of a fixed round shape over many rounds, the receives per round
// (R2-D42), the curve to the limit (R2-D67) and the measurement events (R2-D17). The counts are
// deterministic for this shape and prove nothing beyond it: J6 does not decide E9.
//
// The shape of one round of the plain test is one input of a fixed size and one reply. The tool shape
// adds one Tool call: two Model requests (before and after the Tool), one Tool invoke, one reply each.
// Both must run the 200 rounds; a round that does not end stops the run, and the curve says where.
// The windows are the first ones again (R2-D81, the deviations of R2-D64 and R2-D67 withdrawn): rounds
// 181 to 200 against rounds 11 to 30.
//
// The calls of `execution-record.parts` are a named deviation (R2-D85): they are bounded per round, not
// equal, because a catch-up of the copy of the Agent records takes one page more when the text of its
// parts passes the page budget. The rows of those reads stay equal per round. The bytes grow with the
// rounds (the Session snapshot and the Agent records are read and written whole), so they are reported
// in the curve and in the growth rates, not asserted.
//
// The events written to `e9-events-<shape>.jsonl` are those of the `measure` observers of Session,
// Context and Agent, read with one clock (`performance.now()`); `round-complete` is the explicit event
// of Session (R2-D17 P2). The counts, the curve and the limit are written before any assertion runs.
// @module-tag slow
// Why slow: up to 200 rounds of real Workers and real files.
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import {
  PARTS_HANDLER,
  partsReadsOf,
  partsTextOf,
  type PartsRoundReads,
  type RoundCount,
} from './w2-measure.ts'
import { CONTROL_PER_ROUND, roundGrowthOf, type Growth } from './growth.ts'
import { intakeAccess } from './world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const OUT = new URL('../../../../../tmp/line-session-run/w2/C-JOINT/', import.meta.url)
const MAX_ROUNDS = 200
const WINDOW = 20
/** The early window: rounds 11 to 30. The late one is the last `WINDOW` rounds, 181 to 200. */
const EARLY_FROM = 10
/**
 * The items every round must show alike: all but the number of the round, the retries, the bytes and
 * the number of `execution-record.parts` calls, which `partsOverBound` bounds instead (R2-D85).
 */
const stable = ({
  round: _round,
  storageRollbacks: _rollbacks,
  ad02Refused: _refused,
  maxCommitBytes: _maxCommit,
  maxReadBytes: _maxRead,
  storageCommitBytes: _commitBytes,
  ad02Commits: _ad02Commits,
  storageReads: { [PARTS_HANDLER]: _partsCalls, ...reads },
  storageReadRows,
  ...rest
}: RoundCount) => ({
  ...rest,
  storageReads: untimed(reads),
  storageReadRows: untimed(storageReadRows),
})

/**
 * The reads whose counts depend on how the Agent publications and the Session commits interleave:
 * with the work cache (session-storage-sql RT-04) a read is a fold, an index swap or a whole read by
 * timing, and AD-02 merges its triggers by timing (`ad02Commits`). These counts are not compared
 * round by round; they must not grow with the number of rounds (R2-D118).
 */
const TIMED_HANDLERS: readonly string[] = [
  'session.work',
  'session.work-index',
  'session.work-reads',
  'session.history',
]

const untimed = (counts: Readonly<Record<string, number>>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(counts).filter(([handler]) => !TIMED_HANDLERS.includes(handler)),
  )

/** The timed counts of one round, by name. */
function timedOf(count: RoundCount): Record<string, number> {
  const timed: Record<string, number> = { ad02Commits: count.ad02Commits ?? 0 }
  for (const handler of TIMED_HANDLERS) {
    timed[`storageReads.${handler}`] = count.storageReads[handler] ?? 0
    timed[`storageReadRows.${handler}`] = count.storageReadRows[handler] ?? 0
  }
  return timed
}

/** What `judgeTimedGrowth` says of one timed count: its own judgement and that of its control. */
type TimedJudgement = Readonly<{ measured: Growth; control: Growth }>

/**
 * Judges every timed count of the run by the growth rule (`growth.ts`, R2-D118): each name with its
 * own judgement and with that of its negative control, the count plus `CONTROL_PER_ROUND` times the
 * round. It only judges; `timedGrowth` writes the evidence.
 */
function judgeTimedGrowth(completed: readonly RoundCount[]): Record<string, TimedJudgement> {
  const names = Object.keys(timedOf(completed[0]!))
  return Object.fromEntries(
    names.map(name => {
      const values = completed.map(count => timedOf(count)[name]!)
      const control = values.map((value, index) => value + (index + 1) * CONTROL_PER_ROUND)
      return [name, { measured: roundGrowthOf(values), control: roundGrowthOf(control) }]
    }),
  )
}

/** The names that grow, and the names whose negative control is not judged growth. */
const verdictOf = (judged: Readonly<Record<string, TimedJudgement>>) => {
  const names = Object.keys(judged)
  return {
    growing: names.filter(name => judged[name]!.measured.grows),
    controlMissed: names.filter(name => !judged[name]!.control.grows),
  }
}

/** Writes the judgement of one shape to the evidence file of the run. */
function writeTimedGrowth(shape: Shape, judged: Readonly<Record<string, TimedJudgement>>): void {
  writeFileSync(new URL(`j6-timed-growth-${shape}.json`, OUT), JSON.stringify(judged, null, 1))
}

/** Judges the timed counts, writes the judgement, and returns the verdict the case asserts. */
function timedGrowth(shape: Shape, completed: readonly RoundCount[]) {
  const judged = judgeTimedGrowth(completed)
  writeTimedGrowth(shape, judged)
  return verdictOf(judged)
}

type Shape = 'tool' | 'plain'

/**
 * The whole partition reads of AD-02 per round: it reads the partition of the current execution once
 * for each event it interprets (session-adapters `readExecutionInterpretation`; srun-w2-agent
 * tmp/line-session-run/w2/C-FIX-ROUNDS-R/parts-growth.md), so the number is that of the events of one
 * round of the shape. Measured on 953860c78 in rounds 2 to 40 (C-J1-R78 probe-plain.txt and
 * probe-tool.txt): 19 and 46 in every round. A revision cache of these reads (C-WORKCACHE) gets a
 * second named item for its point reads beside this one.
 */
const AD02_READS: Readonly<Record<Shape, number>> = { plain: 19, tool: 46 }

/**
 * The rounds from the second on whose `execution-record.parts` calls exceed the named bound of
 * R2-D85: the whole partition reads of AD-02 and the pages the catch-ups of the round need by the
 * page rule of the read handler. The first round is left out: it creates the first execution.
 */
function partsOverBound(
  shape: Shape,
  table: readonly RoundCount[],
  parts: readonly PartsRoundReads[],
): string[] {
  const over: string[] = []
  for (const count of table.slice(1)) {
    const calls = count.storageReads[PARTS_HANDLER] ?? 0
    const { catchUpPages } = partsReadsOf(parts.find(item => item.round === count.round))
    if (calls > AD02_READS[shape] + catchUpPages)
      over.push(
        `round ${count.round}: ${calls} parts calls, bound ${AD02_READS[shape]} + ${catchUpPages}`,
      )
  }
  return over
}

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

const CURVE = [
  'er_read_rows',
  'session_snapshot_bytes',
  'write_bytes',
  'er_read_bytes',
  'parts_text',
] as const
type CurveColumn = (typeof CURVE)[number]

/**
 * The curve of R2-D67, one row per round: the rows the reads of the Agent records handlers returned
 * (`er_read_rows`), the largest single read of the Session snapshot in bytes, the bytes of the
 * commits of the round, the largest single reads of the Agent records handlers added up, and the text
 * length of the parts the `execution-record.parts` reads returned (R2-D85).
 */
function curveRows(table: readonly RoundCount[], parts: readonly PartsRoundReads[]): number[][] {
  return table.map(count => [
    count.round,
    sum(count.storageReadRows, 'execution-record.'),
    count.maxReadBytes['session.work'] ?? 0,
    count.storageCommitBytes,
    sum(count.maxReadBytes, 'execution-record.'),
    partsTextOf(parts.find(item => item.round === count.round)),
  ])
}

function curveOf(rows: readonly number[][]): string {
  return `${['round', ...CURVE].join(',')}\n${rows.map(row => row.join(',')).join('\n')}\n`
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)

/**
 * The growth of each curve column from the second round on: the least-squares slope, in the unit of
 * the column per round (R2-D85 reports the bytes with their growth rate).
 */
function growthOf(rows: readonly number[][]): Record<CurveColumn, number> {
  const later = rows.slice(1)
  const x = later.map(row => row[0] ?? 0)
  const meanX = mean(x)
  const spread = x.reduce((total, value) => total + (value - meanX) ** 2, 0)
  const slope = (column: number): number => {
    const y = later.map(row => row[column] ?? 0)
    const meanY = mean(y)
    const joint = x.reduce(
      (total, value, at) => total + (value - meanX) * ((y[at] ?? 0) - meanY),
      0,
    )
    return spread === 0 ? 0 : Math.round((joint / spread) * 10) / 10
  }
  return Object.fromEntries(CURVE.map((name, at) => [name, slope(at + 1)])) as Record<
    CurveColumn,
    number
  >
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
    const curve = curveRows(table, w.counters.partsRounds)
    const growth = growthOf(curve)
    // The evidence directory is not tracked: create it before the first write.
    mkdirSync(OUT, { recursive: true })
    writeFileSync(new URL(`counts-${shape}.json`, OUT), JSON.stringify(table, null, 1))
    writeFileSync(new URL(`j6-curve-${shape}.csv`, OUT), curveOf(curve))
    writeFileSync(new URL(`j6-growth-${shape}.json`, OUT), JSON.stringify(growth, null, 1))
    // The log carries the curve, with the Session snapshot bytes of every round, and the growth rates.
    console.log(`J6-CURVE ${shape}\n${curveOf(curve)}J6-GROWTH ${shape} ${JSON.stringify(growth)}`)
    writeFileSync(new URL(`e9-events-${shape}.jsonl`, OUT), events.lines())
    writeFileSync(
      new URL(`j6-limit-${shape}.json`, OUT),
      JSON.stringify(
        {
          shape,
          completed: failed === null ? table.length : failed - 1,
          failedRound: failed,
          refusedReads: w.counters.refusedReads.slice(0, 3),
          // What the world saw of the round that did not end: the failures of the Model result saves,
          // the errors it logged, and how the last Tool push stood (a pending one is `pending`).
          receivedFailures: w.receivedFailures.slice(-3),
          errors: w.errors.slice(-3),
          warnings: w.warnings.slice(-5),
          // The Session snapshot read once more, uncounted, after the round that did not end.
          readWorkAfter: await w.probe
            .readWork(intakeAccess)
            .then(answer => ('failure' in answer ? answer.failure : 'ok'))
            .catch((error: unknown) => ({ threw: String(error) })),
          lastToolPush: await Promise.race([
            w.toolPushes.at(-1)?.then(
              value => value,
              (error: unknown) => ({ rejected: String(error) }),
            ) ?? 'none',
            new Promise(resolve => setTimeout(() => resolve('pending'), 200)),
          ]),
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
    'J6 plain shape: 200 rounds, the timed counts do not grow with the rounds and the other counts of rounds 181-200 equal those of rounds 11-30',
    { timeout: 3_600_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('plain'),
      })
      worlds.push(w)
      const { completed } = await runToLimit('plain', w)
      expect(completed.length).toBe(MAX_ROUNDS)

      // One Model result is received per round and nothing else.
      for (const count of completed)
        expect(count).toMatchObject({ modelReceives: 1, toolReceives: 0 })
      // The parts calls stay within their named bound (R2-D85).
      expect(partsOverBound('plain', completed, w.counters.partsRounds)).toEqual([])
      // The timed counts do not grow with the number of rounds, and the negative control does (R2-D118).
      expect(timedGrowth('plain', completed)).toEqual({ growing: [], controlMissed: [] })
      // The windows: no other item may differ between rounds 11-30 and 181-200.
      const early = completed.slice(EARLY_FROM, EARLY_FROM + WINDOW).map(stable)
      const late = completed.slice(-WINDOW).map(stable)
      expect(late).toEqual(early)
    },
  )

  it(
    'J6 tool shape: 200 rounds, two Model results and one Tool result each round, the timed counts do not grow with the rounds and the other counts of rounds 181-200 equal those of rounds 11-30',
    { timeout: 3_600_000 },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('tool'),
      })
      worlds.push(w)
      const { completed } = await runToLimit('tool', w)
      expect(completed.length).toBe(MAX_ROUNDS)
      for (const count of completed)
        expect(count).toMatchObject({
          modelRequests: 2,
          toolInvokes: 1,
          modelReceives: 2,
          toolReceives: 1,
        })
      expect(partsOverBound('tool', completed, w.counters.partsRounds)).toEqual([])
      expect(timedGrowth('tool', completed)).toEqual({ growing: [], controlMissed: [] })
      const early = completed.slice(EARLY_FROM, EARLY_FROM + WINDOW).map(stable)
      const late = completed.slice(-WINDOW).map(stable)
      expect(late).toEqual(early)
    },
  )
})
