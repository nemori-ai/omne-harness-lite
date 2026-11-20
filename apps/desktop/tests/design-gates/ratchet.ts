import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type Census = Map<string, number>

export interface RatchetReport {
  readonly gate: string
  readonly missing: boolean
  readonly added: readonly string[]
  readonly stale: readonly string[]
  readonly summary: string
}

const BASELINES = join(import.meta.dirname, 'baselines')

export function tally(keys: Iterable<string>): Census {
  const census: Census = new Map()
  for (const key of keys) census.set(key, (census.get(key) ?? 0) + 1)
  return census
}

function baselinePath(gate: string): string {
  return join(BASELINES, `${gate}.json`)
}

function readBaseline(path: string): Census {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entries: Record<string, number> }
  return new Map(Object.entries(parsed.entries))
}

function writeBaseline(path: string, gate: string, census: Census): void {
  const entries = Object.fromEntries([...census].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(path, `${JSON.stringify({ gate, entries }, null, 2)}\n`, 'utf8')
}

function total(census: Census): number {
  return [...census.values()].reduce((sum, count) => sum + count, 0)
}

/**
 * A baseline holds how many times each violation key occurs today; a key is a repository path plus a
 * normalised value, never a line number. More than the baseline is a new violation; fewer is a stale
 * entry that fails until the baseline shrinks. A missing baseline fails. `DESIGN_GATES_SEED=1` writes a
 * missing one; `DESIGN_GATES_SHRINK=1` shrinks one when nothing is new. Neither can grow a baseline.
 */
export function ratchet(gate: string, observed: Census): RatchetReport {
  const path = baselinePath(gate)
  if (!existsSync(path) && process.env['DESIGN_GATES_SEED'] === '1')
    writeBaseline(path, gate, observed)
  const missing = !existsSync(path)
  const baseline = missing ? new Map<string, number>() : readBaseline(path)
  const added: string[] = []
  const stale: string[] = []
  for (const [key, count] of observed) {
    const allowed = baseline.get(key) ?? 0
    if (count > allowed) added.push(`${key} (${allowed} -> ${count})`)
  }
  for (const [key, allowed] of baseline) {
    const count = observed.get(key) ?? 0
    if (count < allowed) stale.push(`${key} (${allowed} -> ${count})`)
  }
  if (
    !missing &&
    added.length === 0 &&
    stale.length > 0 &&
    process.env['DESIGN_GATES_SHRINK'] === '1'
  ) {
    writeBaseline(path, gate, observed)
    stale.length = 0
  }
  const summary = `[design-gate ${gate}] ${total(observed)} violations (${observed.size} keys), baseline ${missing ? 'missing' : total(baseline)}; ${added.length} new, ${stale.length} stale`
  process.stderr.write(`${summary}\n`)
  return { gate, missing, added: added.sort(), stale: stale.sort(), summary }
}
