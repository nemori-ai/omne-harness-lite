import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isUnknown } from '../environment/field.ts'
import { comparable } from '../judgment/comparable.ts'
import type { Blocked } from '../judgment/growth.ts'
import { FACILITY, headOf, type Reading, type Result } from './result.ts'

/** The counts of one suite at one tier, as a commit left them: what a later run is held against, item by item. */
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
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )

/** The baseline a result would make, or why it cannot be one. */
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

/** Counts a step decides are compared item by item, and only when the two sides asked the same question of the same assembly. */
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
  if (verdict.verdict !== 'comparable')
    return { state: 'refused', reason: 'reason' in verdict ? verdict.reason : 'not comparable' }
  const now = countsOf(result.readings)
  const names = [...new Set([...Object.keys(baseline.counts), ...Object.keys(now)])].sort()
  const differences = names
    .map(name => ({ name, base: baseline.counts[name] ?? null, now: now[name] ?? null }))
    .filter(item => item.base !== item.now)
  return differences.length === 0
    ? { state: 'equal', against: baseline.commit, compared: names.length }
    : { state: 'different', against: baseline.commit, differences }
}

export const FACILITY_MAJOR = FACILITY.major
