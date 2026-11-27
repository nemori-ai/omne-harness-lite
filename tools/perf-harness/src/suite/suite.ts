import type { Json } from '../environment/ids.ts'
import type { CommitSettings } from '../environment/probes.ts'
import type { Control, Gate, Reading } from '../result/result.ts'
import type { Sample } from './paired-run.ts'

export type Measured = Readonly<{
  readings: readonly Reading[]
  gates: readonly Gate[]
  controls: readonly Control[]
  digests: readonly string[]
}>

export type Plan = Readonly<{
  /** what is asked: the parameters, the seeds, the repeats */
  workload: Json
  /** how the measured object is put together */
  assembly: Json
  /** the settings a commit of the measured object runs under, for the commit probe */
  settings: CommitSettings
  release: boolean
}>

/** One question asked of the measured object. The facility knows nothing else about what it measures. */
export type Suite = Readonly<{
  id: string
  title: string
  tiers: readonly string[]
  /** a change under one of these paths may move the readings of this suite */
  paths: readonly string[]
  limits: readonly string[]
  plan: (tier: string) => Plan
  /** everything the gates need, under a data directory the suite may fill */
  measure: (tier: string, input: Place) => Promise<Measured>
  /** the work of the tier once, in a new process, timed: one side of one round of a paired comparison */
  sample: (tier: string, input: Place) => Promise<Sample>
}>

/** Where a suite runs: the checkout the measured object is built in, and a directory for its data. */
export type Place = Readonly<{ root: string; dataDirectory: string }>

const under = (file: string, path: string): boolean =>
  file === path || file.startsWith(path.endsWith('/') ? path : `${path}/`)

/** The suites a set of changed files may move. */
export const affected = (suites: readonly Suite[], changed: readonly string[]): readonly Suite[] =>
  suites.filter(suite => changed.some(file => suite.paths.some(path => under(file, path))))

export type Selection =
  | Readonly<{ suites: readonly Suite[] }>
  | Readonly<{ unknown: readonly string[] }>

/** The suites a caller named, all of them when it named none. */
export function select(suites: readonly Suite[], names: readonly string[]): Selection {
  if (names.length === 0) return { suites }
  const unknown = names.filter(name => !suites.some(suite => suite.id === name))
  return unknown.length > 0
    ? { unknown }
    : { suites: suites.filter(suite => names.includes(suite.id)) }
}
