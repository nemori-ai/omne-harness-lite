// @module-tag slow
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

const MEASURED = (() => {
  const asked = process.env['OMNE_J6_ROUNDS']
  if (asked === undefined || asked === '') return false
  if (asked !== '200') throw new Error(`OMNE_J6_ROUNDS is 200 or unset, not ${asked}`)
  return true
})()
const OUT = new URL(
  MEASURED
    ? '../../../../../tmp/line-session-run/w2/C-JOINT/'
    : '../../../../../tmp/line-session-run/w2/C-JOINT/short/',
  import.meta.url,
)
const RUN = MEASURED
  ? { rounds: 200, window: 20, earlyFrom: 10, timeout: 3_600_000 }
  : { rounds: 20, window: 6, earlyFrom: 4, timeout: 300_000 }
const MAX_ROUNDS = RUN.rounds
const WINDOW = RUN.window
const EARLY_FROM = RUN.earlyFrom
const WINDOWS = `rounds ${String(MAX_ROUNDS - WINDOW + 1)}-${String(MAX_ROUNDS)} equal those of rounds ${String(EARLY_FROM + 1)}-${String(EARLY_FROM + WINDOW)}`
const GROWTH_TITLE = MEASURED ? 'the timed counts do not grow with the rounds and ' : ''
const timedGrowthOf = (shape: Shape, completed: readonly RoundCount[]) =>
  MEASURED ? timedGrowth(shape, completed) : { growing: [], controlMissed: [] }
const stable = ({
  round: _round,
  storageRollbacks: _rollbacks,
  ad02Refused: _refused,
  maxCommitBytes: _maxCommit,
  maxReadBytes: _maxRead,
  storageCommitBytes: _commitBytes,
  ad02Commits: _ad02Commits,
  storageCommitTotal: _commitTotal,
  storageCommits,
  storageReads: { [PARTS_HANDLER]: _partsCalls, ...reads },
  storageReadRows,
  ...rest
}: RoundCount) => ({
  ...rest,
  storageCommits: Object.fromEntries(
    Object.entries(storageCommits).filter(
      ([participant]) => !SESSION_COMMITS.includes(participant),
    ),
  ),
  storageReads: untimed(reads),
  storageReadRows: untimed(storageReadRows),
})

const SESSION_COMMITS: readonly string[] = ['session', 'session-ordinary-basis']
const SESSION_COMMIT_SPREAD = 1
const SESSION_COMMIT_NAMES = [
  'storageCommitTotal',
  ...SESSION_COMMITS.map(participant => `storageCommits.${participant}`),
]

function sessionCommitsOffBound(rounds: readonly RoundCount[]): string[] {
  return SESSION_COMMIT_NAMES.flatMap(name => {
    const values = rounds.map(count => timedOf(count)[name]!)
    const largest = Math.max(...values)
    return rounds.flatMap((count, at) =>
      largest - values[at]! > SESSION_COMMIT_SPREAD
        ? [
            `round ${String(count.round)}: ${name} ${String(values[at])}, largest ${String(largest)}`,
          ]
        : [],
    )
  })
}

const windowsOf = (completed: readonly RoundCount[]) => [
  ...completed.slice(EARLY_FROM, EARLY_FROM + WINDOW),
  ...completed.slice(-WINDOW),
]

const TIMED_HANDLERS: readonly string[] = [
  'session.work',
  'session.work-index',
  'session.work-reads',
  'session.work-version',
  'session.history',
  'session.history-root',
  'execution-record.events',
]

const untimed = (counts: Readonly<Record<string, number>>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(counts).filter(([handler]) => !TIMED_HANDLERS.includes(handler)),
  )

function timedOf(count: RoundCount): Record<string, number> {
  const timed: Record<string, number> = {
    ad02Commits: count.ad02Commits ?? 0,
    storageCommitTotal: count.storageCommitTotal,
  }
  for (const participant of SESSION_COMMITS)
    timed[`storageCommits.${participant}`] = count.storageCommits[participant] ?? 0
  for (const handler of TIMED_HANDLERS) {
    timed[`storageReads.${handler}`] = count.storageReads[handler] ?? 0
    timed[`storageReadRows.${handler}`] = count.storageReadRows[handler] ?? 0
  }
  return timed
}

type TimedJudgement = Readonly<{ measured: Growth; control: Growth }>

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

const verdictOf = (judged: Readonly<Record<string, TimedJudgement>>) => {
  const names = Object.keys(judged)
  return {
    growing: names.filter(name => judged[name]!.measured.grows),
    controlMissed: names.filter(name => !judged[name]!.control.grows),
  }
}

function writeTimedGrowth(shape: Shape, judged: Readonly<Record<string, TimedJudgement>>): void {
  writeFileSync(new URL(`j6-timed-growth-${shape}.json`, OUT), JSON.stringify(judged, null, 1))
}

function timedGrowth(shape: Shape, completed: readonly RoundCount[]) {
  const judged = judgeTimedGrowth(completed)
  writeTimedGrowth(shape, judged)
  return verdictOf(judged)
}

type Shape = 'tool' | 'plain'

const AD02_READS: Readonly<Record<Shape, number>> = { plain: 19, tool: 46 }

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
    mkdirSync(OUT, { recursive: true })
    writeFileSync(new URL(`counts-${shape}.json`, OUT), JSON.stringify(table, null, 1))
    writeFileSync(new URL(`j6-curve-${shape}.csv`, OUT), curveOf(curve))
    writeFileSync(new URL(`j6-growth-${shape}.json`, OUT), JSON.stringify(growth, null, 1))
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
          receivedFailures: w.receivedFailures.slice(-3),
          errors: w.errors.slice(-3),
          warnings: w.warnings.slice(-5),
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
    `J6 plain shape: ${String(MAX_ROUNDS)} rounds, ${GROWTH_TITLE}the other counts of ${WINDOWS}`,
    { timeout: RUN.timeout },
    async () => {
      const w = await openW2World({
        earlier: 'session',
        receiverRecords: 1200,
        model: scriptOf('plain'),
      })
      worlds.push(w)
      const { completed } = await runToLimit('plain', w)
      expect(completed.length).toBe(MAX_ROUNDS)

      for (const count of completed)
        expect(count).toMatchObject({ modelReceives: 1, toolReceives: 0 })
      expect(partsOverBound('plain', completed, w.counters.partsRounds)).toEqual([])
      expect(timedGrowthOf('plain', completed)).toEqual({ growing: [], controlMissed: [] })
      expect(sessionCommitsOffBound(windowsOf(completed))).toEqual([])
      const early = completed.slice(EARLY_FROM, EARLY_FROM + WINDOW).map(stable)
      const late = completed.slice(-WINDOW).map(stable)
      expect(late).toEqual(early)
    },
  )

  it(
    `J6 tool shape: ${String(MAX_ROUNDS)} rounds, two Model results and one Tool result each round, ${GROWTH_TITLE}the other counts of ${WINDOWS}`,
    { timeout: RUN.timeout },
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
      expect(timedGrowthOf('tool', completed)).toEqual({ growing: [], controlMissed: [] })
      expect(sessionCommitsOffBound(windowsOf(completed))).toEqual([])
      const early = completed.slice(EARLY_FROM, EARLY_FROM + WINDOW).map(stable)
      const late = completed.slice(-WINDOW).map(stable)
      expect(late).toEqual(early)
    },
  )
})
