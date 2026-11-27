import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Environment, Fitness, Ids } from '../environment/record.ts'
import type { ReadingKind, ResultHead } from '../judgment/comparable.ts'
import type { Blocked } from '../judgment/growth.ts'

export const FACILITY = { name: '@omne-harness/perf-harness', major: 1 } as const

export type Reading = Readonly<{
  name: string
  kind: ReadingKind
  unit: string
  value: number
}>

export type Acceptance = Readonly<{ card: string; reason: string }>

export type GateState = 'pass' | 'fail' | 'blocked'

export type Gate = Readonly<{
  name: string
  from: string
  state: GateState
  detail: string
  known?: Acceptance
}>

export type Control = Readonly<{
  gate: string
  expected: 'pass' | 'fail'
  state: GateState
  detail: string
}>

export type Result = Readonly<{
  schema: 1
  facility: typeof FACILITY
  suite: string
  tier: string
  ids: Ids
  environment: Environment
  fitness: Fitness
  readings: readonly Reading[]
  gates: readonly Gate[]
  controls: readonly Control[]
  digests: readonly string[]
  limits: readonly string[]
}>

export const headOf = (result: Result): ResultHead => ({
  workload: result.ids.workload,
  assembly: result.ids.assembly,
  facilityMajor: result.facility.major,
  machine: result.ids.config,
  stateQualified: result.fitness.stateQualified,
  probesHold: result.fitness.probesHold !== false,
})

export type Outcome = 'pass' | 'fail' | 'blocked'

const gateOutcome = (
  gate: Gate,
  controls: readonly Control[],
): Readonly<{ outcome: Outcome; note: string }> => {
  const broken = controls.find(
    control => control.gate === gate.name && control.state !== control.expected,
  )
  if (broken !== undefined)
    return {
      outcome: 'blocked',
      note: `its ${broken.expected === 'fail' ? 'must-fail' : 'must-pass'} sample came out ${broken.state}`,
    }
  if (gate.state === 'blocked') return { outcome: 'blocked', note: gate.detail }
  if (gate.known === undefined) return { outcome: gate.state, note: gate.detail }
  return gate.state === 'fail'
    ? {
        outcome: 'pass',
        note: `known failure, accepted in ${gate.known.card}: ${gate.known.reason} (${gate.detail})`,
      }
    : {
        outcome: 'fail',
        note: `no longer fails: remove the acceptance of ${gate.known.card} (${gate.detail})`,
      }
}

export type Judged = Readonly<{ gate: Gate; outcome: Outcome; note: string }>

export const judged = (result: Pick<Result, 'gates' | 'controls'>): readonly Judged[] =>
  result.gates.map(gate => ({ gate, ...gateOutcome(gate, result.controls) }))

export function outcomeOf(result: Pick<Result, 'gates' | 'controls'>): Outcome {
  const outcomes = judged(result).map(item => item.outcome)
  if (outcomes.includes('fail')) return 'fail'
  return outcomes.length === 0 || outcomes.includes('blocked') ? 'blocked' : 'pass'
}

const FILE = 'result.json'

export function writeResult(directory: string, result: Result): string {
  mkdirSync(directory, { recursive: true })
  const file = join(directory, FILE)
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
  return file
}

export function readResult(directory: string): Result | Blocked {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(directory, FILE), 'utf8'))
  } catch {
    return { state: 'blocked', reason: `no readable ${FILE} in ${directory}` }
  }
  const result = parsed as Partial<Result> | null
  if (result?.schema !== 1 || result.facility?.name !== FACILITY.name)
    return { state: 'blocked', reason: `${FILE} in ${directory} is not a result of this facility` }
  return result as Result
}
