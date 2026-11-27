import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isUnknown } from '../environment/field.ts'
import { comparable } from '../judgment/comparable.ts'
import type { Blocked } from '../judgment/growth.ts'
import { FACILITY, headOf, type Reading, type Result } from './result.ts'

export type Baseline = Readonly<{
  schema: 1
  facilityMajor: number
  suite: string
  tier: string
  workload: string
  assembly: string
  commit: string
  counts: Readonly<Record<string, number>>
  digests: readonly string[]
}>

export const baselineFile = (directory: string, suite: string, tier: string): string =>
  join(directory, `${suite}.${tier}.json`)

const countsOf = (readings: readonly Reading[]): Record<string, number> =>
  Object.fromEntries(
    readings
      .filter(reading => reading.kind === 'count')
      .map(reading => [reading.name, reading.value] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )

export function baselineOf(result: Result): Baseline | Blocked {
  const { commit, dirty } = result.environment.subject
  if (isUnknown(commit))
    return { state: 'blocked', reason: 'the commit of the result is not known' }
  if (dirty !== false)
    return {
      state: 'blocked',
      reason: 'the working tree was not clean: the result cannot be a baseline',
    }
  return {
    schema: 1,
    facilityMajor: result.facility.major,
    suite: result.suite,
    tier: result.tier,
    workload: result.ids.workload,
    assembly: result.ids.assembly,
    commit,
    counts: countsOf(result.readings),
    digests: result.digests,
  }
}

export function writeBaseline(directory: string, baseline: Baseline): string {
  const file = baselineFile(directory, baseline.suite, baseline.tier)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`)
  return file
}

export function readBaseline(directory: string, suite: string, tier: string): Baseline | null {
  try {
    const parsed = JSON.parse(
      readFileSync(baselineFile(directory, suite, tier), 'utf8'),
    ) as Baseline
    return parsed.schema === 1 ? parsed : null
  } catch {
    return null
  }
}

export type Difference = Readonly<{ name: string; base: number | null; now: number | null }>

export type CountComparison =
  | Blocked
  | Readonly<{ state: 'refused'; reason: string }>
  | Readonly<{ state: 'equal'; against: string; compared: number }>
  | Readonly<{ state: 'different'; against: string; differences: readonly Difference[] }>

export function compareCounts(baseline: Baseline | null, result: Result): CountComparison {
  if (baseline === null) return { state: 'blocked', reason: 'no baseline to compare with' }
  const head = headOf(result)
  const verdict = comparable(
    'count',
    {
      ...head,
      workload: baseline.workload,
      assembly: baseline.assembly,
      facilityMajor: baseline.facilityMajor,
    },
    head,
  )
  if (verdict.verdict === 'refused') return { state: 'refused', reason: verdict.reason }
  const now = countsOf(result.readings)
  const names = [...new Set([...Object.keys(baseline.counts), ...Object.keys(now)])].sort()
  const differences = names
    .map(name => ({ name, base: baseline.counts[name] ?? null, now: now[name] ?? null }))
    .filter(item => item.base !== item.now)
  return differences.length === 0
    ? { state: 'equal', against: baseline.commit, compared: names.length }
    : { state: 'different', against: baseline.commit, differences }
}

type Side = 'base' | 'candidate'

function steady(side: Side, baseline: Baseline, again: Result): CountComparison {
  const self = compareCounts(baseline, again)
  if (self.state !== 'different') return self
  const moved = self.differences.map(item => item.name).join(', ')
  return {
    state: 'blocked',
    reason: `the ${side} differs from itself in ${moved}: what moves between two runs of one commit is not a count of steps`,
  }
}

export function steadyOf(side: Side, first: Result, again: Result): CountComparison {
  const baseline = baselineOf(first)
  return 'state' in baseline ? baseline : steady(side, baseline, again)
}

export function compareSteady(base: Result, again: Result, candidate: Result): CountComparison {
  const baseline = baselineOf(base)
  if ('state' in baseline) return baseline
  const self = steady('base', baseline, again)
  return self.state === 'equal' ? compareCounts(baseline, candidate) : self
}

export const FACILITY_MAJOR = FACILITY.major
