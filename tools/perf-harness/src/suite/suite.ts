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
  workload: Json
  assembly: Json
  settings: CommitSettings
  release: boolean
}>

export type Suite = Readonly<{
  id: string
  title: string
  tiers: readonly string[]
  paths: readonly string[]
  limits: readonly string[]
  changes?: Readonly<Record<string, number>>
  plan: (tier: string) => Plan
  measure: (tier: string, input: Place) => Promise<Measured>
  sample: (tier: string, input: Place) => Promise<Sample>
}>

export type Place = Readonly<{ root: string; dataDirectory: string }>

const under = (file: string, path: string): boolean =>
  file === path || file.startsWith(path.endsWith('/') ? path : `${path}/`)

export const affected = (suites: readonly Suite[], changed: readonly string[]): readonly Suite[] =>
  suites.filter(suite => changed.some(file => suite.paths.some(path => under(file, path))))

export type Selection =
  | Readonly<{ suites: readonly Suite[] }>
  | Readonly<{ unknown: readonly string[] }>

export function select(suites: readonly Suite[], names: readonly string[]): Selection {
  if (names.length === 0) return { suites }
  const unknown = names.filter(name => !suites.some(suite => suite.id === name))
  return unknown.length > 0
    ? { unknown }
    : { suites: suites.filter(suite => names.includes(suite.id)) }
}
