import {
  judgeCount,
  type Acceptance,
  type Measured,
  type Plan,
  type Suite,
} from '@omne-harness/perf-harness'
import { coverageGate } from '../coverage.ts'
import { BACKGROUND, LIST, readOf, SUMMARY_WORDS, type RoundShape } from '../script.ts'
import {
  runRounds,
  type Opening,
  type Setup,
  type Step,
  type Trajectory,
  type Watching,
} from '../trajectory.ts'
import {
  clocked,
  COMMIT_BYTES,
  COMMITS,
  floorOf,
  gatesOf,
  READS,
  readingsOf,
  sampleOf,
  timesOf,
  type Axis,
} from './scale.ts'
import { SERIES_ROUNDS, seriesGatesOf, seriesReadingsOf } from './series.ts'

const GENERATOR = 2

const ASSEMBLY = {
  server: 'harness-server-lab',
  definition: 'coding',
  model: 'scripted gateway',
  storage: { backend: 'sqlite', journalMode: 'wal', synchronous: 'full' },
} as const

const SETTINGS = { journalMode: 'wal', synchronous: 'full' } as const

const PATHS = [
  'packages/session',
  'packages/agent',
  'packages/context',
  'packages/model',
  'packages/tool',
  'packages/storage',
  'packages/identity',
  'apps/harness-server/src',
  'benchmarks/src',
]

const LIMITS = [
  'The model is a script on this machine: nothing here says what a provider costs.',
  'Counts are those of the storage port: SQL statements, pages and system calls under a read or a commit are not counted.',
  'Times are those of one run on one machine and gate nothing.',
]

export type Tier = Readonly<{
  rounds: readonly RoundShape[]
  scales: readonly number[]
  setup?: Setup
}>

type Judged = Omit<Measured, 'digests'>

type Definition = Readonly<{
  id: string
  title: string
  limits: readonly string[]
  tiers: Readonly<Record<string, Tier>>
  judge: (trajectory: Trajectory, tier: Tier) => Judged
}>

const planOf = (definition: Definition, name: string, tier: Tier): Plan => ({
  workload: {
    suite: definition.id,
    generator: GENERATOR,
    tier: name,
    rounds: tier.rounds.map(round => ({
      steps: round.steps.map(calls => calls.map(call => JSON.stringify(call))),
      inputBytes: round.inputBytes ?? null,
      attachBytes: round.attachBytes ?? null,
    })),
    scales: [...tier.scales],
    files: tier.setup?.files ?? null,
    restartBefore: [...(tier.setup?.restartBefore ?? [])],
    watchAfter: [...(tier.setup?.watchAfter ?? [])],
  },
  assembly: { ...ASSEMBLY, compactionTrigger: tier.setup?.compactionTrigger ?? 'release' },
  settings: SETTINGS,
  release: true,
})

function suiteOf(definition: Definition): Suite {
  const tierOf = (tier: string): Tier => {
    const shape = definition.tiers[tier]
    if (shape === undefined) throw new Error(`${definition.id} has no tier ${tier}`)
    return shape
  }
  const run = (tier: Tier, place: Parameters<Suite['measure']>[1]): Promise<Trajectory> =>
    runRounds(place, tier.rounds, tier.setup)
  return {
    id: definition.id,
    title: definition.title,
    tiers: Object.keys(definition.tiers),
    paths: PATHS,
    limits: [...definition.limits, ...LIMITS],
    plan: tier => planOf(definition, tier, tierOf(tier)),
    measure: async (name, place) => {
      const tier = tierOf(name)
      const trajectory = await run(tier, place)
      const judged = definition.judge(trajectory, tier)
      return {
        ...judged,
        gates: [
          ...judged.gates,
          coverageGate(trajectory.entryKinds, Object.keys(trajectory.kinds)),
        ],
        digests: trajectory.digests,
      }
    },
    sample: async (name, place) => sampleOf(await run(tierOf(name), place)),
  }
}

export function measuredOf(
  trajectory: Trajectory,
  axis: Axis,
  series?: Readonly<Record<string, Acceptance>>,
): Judged {
  const steps: readonly Step[] = trajectory.steps
  const scale = gatesOf(steps, axis)
  const over =
    series !== undefined && trajectory.rounds.length === SERIES_ROUNDS
      ? seriesGatesOf(trajectory.rounds, series)
      : { gates: [], controls: [] }
  return {
    readings: [
      ...readingsOf(steps, axis),
      ...floorOf(steps),
      ...(series === undefined ? [] : seriesReadingsOf(trajectory.rounds)),
      ...timesOf(trajectory),
    ],
    gates: [...scale.gates, ...over.gates],
    controls: [...scale.controls, ...over.controls],
  }
}

export function openingsMeasured(
  trajectory: Trajectory,
  axis: Axis<Opening>,
  chosen: (opening: Opening) => boolean,
): Judged {
  const openings = trajectory.openings.filter(chosen)
  return {
    readings: [...readingsOf(openings, axis), ...timesOf(trajectory)],
    ...gatesOf(openings, axis),
  }
}

const NEXT_RUN =
  'the fourth run of #1667 makes what a step reads and writes independent of the length of the log'

const accepted = (reason: string): Acceptance => ({
  card: '#1752',
  reason: `${reason}; ${NEXT_RUN}`,
})

const SMALL_TOOL =
  'The tool is the listing of a directory with one file: large results, background calls and attachments are in their own suites.'

const steps = (count: number): RoundShape => ({
  steps: Array.from({ length: count }, () => [LIST]),
})
const rounds = (count: number): RoundShape[] => Array.from({ length: count }, () => steps(1))

export const MULTI_STEP = suiteOf({
  id: 'multi-step',
  title: 'one round of many steps: what a step costs as the round grows longer',
  limits: [SMALL_TOOL],
  tiers: {
    short: { rounds: [steps(32)], scales: [4, 8, 16, 32] },
    full: { rounds: [steps(64)], scales: [8, 16, 32, 64] },
  },
  judge: (trajectory, tier) =>
    measuredOf(trajectory, {
      name: 'step',
      from: 'multi-step: a step reads and commits the same whichever step of the round it is',
      scales: tier.scales,
      placeOf: step => step.step,
      known: {
        'commit bytes of a step': accepted(
          'a step commits a few kilobytes more with every step before it',
        ),
      },
    }),
})

export const MULTI_ROUND = suiteOf({
  id: 'multi-round',
  title: 'many rounds of one step: what a step costs as the session grows older',
  limits: [SMALL_TOOL],
  tiers: {
    short: { rounds: rounds(16), scales: [2, 4, 8, 16] },
    full: { rounds: rounds(SERIES_ROUNDS), scales: [25, 50, 100, 200] },
  },
  judge: (trajectory, tier) =>
    measuredOf(
      trajectory,
      {
        name: 'round',
        from: 'multi-round: a step reads and commits the same however many rounds came before',
        scales: tier.scales,
        placeOf: step => step.round,
        known: {
          'commit bytes of a step': accepted(
            'a step commits a few kilobytes more with every round before it',
          ),
          'reads of a step': accepted(
            'the reads of the model call records and of the standing of the account rise with every round',
          ),
        },
      },
      {},
    ),
})

const KIB = 1024
const SIZES = [1, 2, 4, 8]
const sized = (cycles: number): RoundShape => ({
  steps: Array.from({ length: cycles * SIZES.length }, (_, index) => [
    readOf(`sized-${String(SIZES[index % SIZES.length])}k.txt`),
  ]),
})
const sizeAt = (step: Step): number => SIZES[(step.step - 1) % SIZES.length] ?? 0

export const TOOL_RESULT = suiteOf({
  id: 'tool-result',
  title: 'results of doubling size: what a step costs as its tool result grows',
  limits: [
    'Results stay under the size the product keeps inline: a result it keeps apart takes another path, with more commits.',
  ],
  tiers: {
    short: {
      rounds: [sized(4)],
      scales: SIZES,
      setup: {
        files: Object.fromEntries(SIZES.map(size => [`sized-${String(size)}k.txt`, size * KIB])),
      },
    },
    full: {
      rounds: [sized(16)],
      scales: SIZES,
      setup: {
        files: Object.fromEntries(SIZES.map(size => [`sized-${String(size)}k.txt`, size * KIB])),
      },
    },
  },
  judge: (trajectory, tier) =>
    measuredOf(trajectory, {
      name: 'result KiB',
      from: 'tool-result: a step reads and commits as often whatever the size of its result',
      scales: tier.scales,
      placeOf: sizeAt,
      gated: [COMMITS, READS],
      mustFail: { what: 'the size of the result, which doubles', of: sizeAt },
      known: {},
    }),
})

const launching = (count: number): RoundShape => ({
  steps: Array.from({ length: count }, () => [BACKGROUND]),
})

export const BACKGROUND_CALLS = suiteOf({
  id: 'background-calls',
  title: 'commands left running in the background: what a step costs as more of them are open',
  limits: [
    'The commands sleep: none of them ends, writes output or wakes the session while the suite runs.',
  ],
  tiers: {
    short: { rounds: [launching(16)], scales: [2, 4, 8, 16] },
    full: { rounds: [launching(32)], scales: [4, 8, 16, 32] },
  },
  judge: (trajectory, tier) =>
    measuredOf(trajectory, {
      name: 'open background calls',
      from: 'background-calls: a step reads and commits the same however many calls are open in the background',
      scales: tier.scales,
      placeOf: step => step.step,
      gated: [COMMITS, READS],
      known: {},
    }),
})

const ATTACHED_KIB = [64, 128, 256, 512]
const attaching = (cycles: number): RoundShape[] => [
  { steps: [[LIST]] },
  ...Array.from({ length: cycles }, (_, cycle) =>
    (cycle % 2 === 0 ? ATTACHED_KIB : ATTACHED_KIB.toReversed()).map(size => ({
      steps: [[LIST]],
      attachBytes: size * KIB,
    })),
  ).flat(),
]
const attachedIn =
  (tier: Tier) =>
  (opening: Opening): number =>
    (tier.rounds[opening.round - 1]?.attachBytes ?? 0) / KIB

export const ATTACHMENTS = suiteOf({
  id: 'attachments',
  title: 'inputs with a file of doubling size: what taking the input costs as the file grows',
  limits: [
    'The file is a document of filler text sent with the input; images, audio and what a tool or a model produces are not in this workload.',
    'A file goes up in parts, each a commit: the commits of taking an input rise by design with the parts and are read, not held.',
    SMALL_TOOL,
  ],
  tiers: {
    short: { rounds: attaching(2), scales: ATTACHED_KIB },
    full: { rounds: attaching(6), scales: ATTACHED_KIB },
  },
  judge: (trajectory, tier) =>
    openingsMeasured(
      trajectory,
      {
        name: 'attached KiB',
        span: 'taking an input',
        from: 'attachments: taking an input reads as often whatever the size of the file with it',
        scales: tier.scales,
        placeOf: attachedIn(tier),
        gated: [READS],
        mustFail: { what: 'the size of the file, which doubles', of: attachedIn(tier) },
        known: {},
      },
      () => true,
    ),
})

const LONG_INPUT = 100_000
const TRIGGER = '20'
const longRounds = (count: number): RoundShape[] =>
  Array.from({ length: count }, () => ({ steps: [[LIST]], inputBytes: LONG_INPUT }))
const SUMMARY = { when: { has: [SUMMARY_WORDS] }, text: { seed: 9, bytes: 2000 } }

function compactionsOf(trajectory: Trajectory): Opening[] {
  let ordinal = 0
  return trajectory.openings
    .filter(opening => opening.otherRequests > 0)
    .map(opening => ({ ...opening, round: (ordinal += 1) }))
}

export const COMPACTION = suiteOf({
  id: 'compaction',
  title: 'a session that compacts again and again: what a compaction costs as more came before it',
  limits: [
    'A compaction is due at a fifth of the window of the model, not at the four fifths of the release, so that a run of minutes reaches several.',
    'The summary is generated text of a fixed size: what a model would write is not measured.',
    SMALL_TOOL,
  ],
  tiers: {
    short: {
      rounds: longRounds(14),
      scales: [1, 2, 4],
      setup: { compactionTrigger: TRIGGER, rules: [SUMMARY] },
    },
    full: {
      rounds: longRounds(24),
      scales: [1, 2, 4, 8],
      setup: { compactionTrigger: TRIGGER, rules: [SUMMARY] },
    },
  },
  judge: (trajectory, tier) => {
    const compactions = compactionsOf(trajectory)
    const axis: Axis<Opening> = {
      name: 'compaction',
      span: 'taking an input that compacts',
      from: 'compaction: a compaction reads as often however many compactions came before it',
      scales: tier.scales,
      placeOf: opening => opening.round,
      gated: [READS],
      mustFail: {
        what: 'the number of the compaction, which doubles',
        of: opening => opening.round,
      },
      known: {
        'reads of taking an input that compacts': accepted(
          'a compaction reads a few hundred times more than the one before it',
        ),
      },
    }
    return {
      readings: [...readingsOf(compactions, axis), ...timesOf(trajectory)],
      ...gatesOf(compactions, axis),
    }
  },
})

const COLD_AFTER = [2, 4, 8, 16]
const RESTARTED = [clocked(COMMITS), clocked(COMMIT_BYTES), READS]

export const COLD_OPEN = suiteOf({
  id: 'cold-open',
  title:
    'a server started anew on a session: what taking the next input costs as the session is longer',
  limits: [
    'The session is opened by its next input. A client that only reads or watches the session after the restart is the catch-up suite.',
    'No compaction happens in this workload: the whole history is the current view.',
    'A restart recovers on its own clock. The commits of this span come in steps of five and move by one or two steps from run to run at equal work, so they are read and not held; the bytes and the reads are held with the allowance of the reads.',
    SMALL_TOOL,
  ],
  tiers: {
    short: {
      rounds: rounds(17),
      scales: COLD_AFTER,
      setup: { restartBefore: COLD_AFTER.map(after => after + 1) },
    },
    full: {
      rounds: rounds(65),
      scales: [8, 16, 32, 64],
      setup: { restartBefore: [9, 17, 33, 65] },
    },
  },
  judge: (trajectory, tier) =>
    openingsMeasured(
      trajectory,
      {
        name: 'rounds before the restart',
        span: 'taking the first input after a restart',
        from: 'cold-open: the first input after a restart costs the same however long the session is',
        scales: tier.scales,
        placeOf: opening => opening.round - 1,
        gated: [clocked(COMMIT_BYTES), READS],
        read: RESTARTED,
        known: {
          'commit bytes of taking the first input after a restart': accepted(
            'the first input after a restart commits more bytes the longer the session is',
          ),
          'reads of taking the first input after a restart': accepted(
            'the first input after a restart reads more often the longer the session is',
          ),
        },
      },
      opening => opening.cold,
    ),
})

const WATCH_AFTER = [2, 4, 8, 16]
const NOTHING_WRITTEN = {
  value: 0,
  from: 'catch-up: opening an observation writes nothing',
  budget: 0,
}

export function writesOf(
  trajectory: Pick<Trajectory, 'watchings' | 'steps'>,
): Pick<Measured, 'gates' | 'controls'> {
  const name = 'commits of opening an observation'
  const most = Math.max(...trajectory.watchings.map(watching => watching.commits))
  const held = judgeCount(trajectory.watchings.length === 0 ? Number.NaN : most, NOTHING_WRITTEN)
  const step = judgeCount(trajectory.steps[0]?.commits ?? Number.NaN, NOTHING_WRITTEN)
  const bytes = judgeCount(
    Math.max(...trajectory.watchings.map(watching => watching.commitBytes)),
    NOTHING_WRITTEN,
  )
  const detailOf = (verdict: typeof held): string =>
    verdict.state === 'blocked'
      ? verdict.reason
      : verdict.state === 'fail'
        ? verdict.reason
        : `measured ${String(verdict.measured)}, expected ${String(verdict.expected)}`
  return {
    gates: [{ name, from: NOTHING_WRITTEN.from, state: held.state, detail: detailOf(held) }],
    controls: [
      {
        gate: name,
        expected: 'fail',
        state: step.state,
        detail: `the commits of a step of the same run, which writes: ${detailOf(step)}`,
      },
      {
        gate: name,
        expected: 'pass',
        state: bytes.state,
        detail: 'the bytes committed while the observations opened',
      },
    ],
  }
}

export const CATCH_UP = suiteOf({
  id: 'catch-up',
  title:
    'a client that comes back to a session: what opening an observation costs as the session is longer',
  limits: [
    'The client opens an observation and leaves at its first frame. Reading the history it missed, page by page, is not in this workload.',
    'No round runs while the client comes back: a stream of a reply in progress is not opened.',
    SMALL_TOOL,
  ],
  tiers: {
    short: { rounds: rounds(16), scales: WATCH_AFTER, setup: { watchAfter: WATCH_AFTER } },
    full: {
      rounds: rounds(64),
      scales: [8, 16, 32, 64],
      setup: { watchAfter: [8, 16, 32, 64] },
    },
  },
  judge: (trajectory, tier) => {
    const axis: Axis<Watching> = {
      name: 'rounds before',
      span: 'opening an observation',
      from: 'catch-up: opening an observation reads as often however long the session is',
      scales: tier.scales,
      placeOf: watching => watching.round,
      gated: [READS],
      read: [READS],
      known: {},
    }
    const reads = gatesOf(trajectory.watchings, axis)
    const writes = writesOf(trajectory)
    return {
      readings: [
        ...readingsOf(trajectory.watchings, axis),
        {
          name: 'commits of opening an observation',
          kind: 'count',
          unit: 'commits',
          value: Math.max(...trajectory.watchings.map(watching => watching.commits)),
        },
        ...timesOf(trajectory),
      ],
      gates: [...reads.gates, ...writes.gates],
      controls: [...reads.controls, ...writes.controls],
    }
  },
})
