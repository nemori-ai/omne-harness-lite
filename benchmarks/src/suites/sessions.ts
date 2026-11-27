import type { Measured, Plan, Suite } from '@omne-harness/perf-harness'
import { LIST, type RoundShape } from '../script.ts'
import { runRounds, type Step, type Trajectory } from '../trajectory.ts'
import { floorOf, gatesOf, readingsOf, sampleOf, timesOf, type Axis } from './scale.ts'

const GENERATOR = 1

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
  'The tool is the listing of a directory with one file: large results, background calls and attachments are not in this workload.',
  'Counts are those of the storage port: SQL statements, pages and system calls under a read or a commit are not counted.',
  'Times are those of one run on one machine and gate nothing.',
]

export type Tier = Readonly<{ rounds: readonly RoundShape[]; scales: readonly number[] }>

type Definition = Readonly<{
  id: string
  title: string
  tiers: Readonly<Record<string, Tier>>
  axis: (tier: Tier) => Axis
}>

const planOf = (definition: Definition, tier: string): Plan => {
  const shape = definition.tiers[tier]
  if (shape === undefined) throw new Error(`${definition.id} has no tier ${tier}`)
  return {
    workload: {
      suite: definition.id,
      generator: GENERATOR,
      tier,
      rounds: shape.rounds.map(round => round.steps.map(calls => calls.map(call => call.tool))),
      scales: [...shape.scales],
    },
    assembly: ASSEMBLY,
    settings: SETTINGS,
    release: true,
  }
}

export function measuredOf(trajectory: Trajectory, axis: Axis): Measured {
  const steps: readonly Step[] = trajectory.steps
  return {
    readings: [...readingsOf(steps, axis), ...floorOf(steps), ...timesOf(trajectory)],
    ...gatesOf(steps, axis),
    digests: trajectory.digests,
  }
}

function suiteOf(definition: Definition): Suite {
  const tierOf = (tier: string): Tier => {
    const shape = definition.tiers[tier]
    if (shape === undefined) throw new Error(`${definition.id} has no tier ${tier}`)
    return shape
  }
  return {
    id: definition.id,
    title: definition.title,
    tiers: Object.keys(definition.tiers),
    paths: PATHS,
    limits: LIMITS,
    plan: tier => planOf(definition, tier),
    measure: async (tier, place) => {
      const shape = tierOf(tier)
      return measuredOf(await runRounds(place, shape.rounds), definition.axis(shape))
    },
    sample: async (tier, place) => sampleOf(await runRounds(place, tierOf(tier).rounds)),
  }
}

const NEXT_RUN =
  'the fourth run of #1667 makes what a step reads and writes independent of the length of the log'

const steps = (count: number): RoundShape => ({
  steps: Array.from({ length: count }, () => [LIST]),
})
const rounds = (count: number): RoundShape[] => Array.from({ length: count }, () => steps(1))

export const MULTI_STEP = suiteOf({
  id: 'multi-step',
  title: 'one round of many steps: what a step costs as the round grows longer',
  tiers: {
    short: { rounds: [steps(32)], scales: [4, 8, 16, 32] },
    full: { rounds: [steps(64)], scales: [8, 16, 32, 64] },
  },
  axis: tier => ({
    name: 'step',
    from: 'multi-step: a step reads and commits the same whichever step of the round it is',
    scales: tier.scales,
    placeOf: step => step.step,
    known: {
      'commit bytes of a step': {
        card: '#1752',
        reason: `a step commits a few kilobytes more with every step before it; ${NEXT_RUN}`,
      },
    },
  }),
})

export const MULTI_ROUND = suiteOf({
  id: 'multi-round',
  title: 'many rounds of one step: what a step costs as the session grows older',
  tiers: {
    short: { rounds: rounds(16), scales: [2, 4, 8, 16] },
    full: { rounds: rounds(64), scales: [8, 16, 32, 64] },
  },
  axis: tier => ({
    name: 'round',
    from: 'multi-round: a step reads and commits the same however many rounds came before',
    scales: tier.scales,
    placeOf: step => step.round,
    known: {
      'commit bytes of a step': {
        card: '#1752',
        reason: `a step commits a few kilobytes more with every round before it; ${NEXT_RUN}`,
      },
      'reads of a step': {
        card: '#1752',
        reason: `the reads of the model call records and of the standing of the account rise with every round; ${NEXT_RUN}`,
      },
    },
  }),
})
