import type { Adoption } from '@omne-harness/model-contract'
import { officialProfileAdoption, officialProfiles } from '@omne-harness/model-host-local'

// The cells of the live model matrix come from the official profiles, never from a hand list:
// a new record adds its cells, a withdrawn one takes them away.

export type LiveModel = Readonly<{ route: string; revision: string; family: string }>

export type LiveCell = Readonly<{
  id: string
  kind: 'single' | 'alternate'
  /** The model each turn of the session runs on, in order. */
  turns: readonly string[]
}>

export type BaselineEntry = Readonly<{
  measuredOn: string
  revisions: Readonly<Record<string, string>>
  hitRate: number | null
  dropped: number
  costUsd: number
}>

export type Baseline = Readonly<{ cells: Readonly<Record<string, BaselineEntry>> }>

// Only the record names and revisions matter here; these two inputs shape other parts of a profile.
const PROFILE_INPUT = {
  retryPolicy: {
    owner: 'live-matrix',
    name: 'retry',
    revision: '1',
    digest: '0'.repeat(64),
  } satisfies Adoption,
  compactionTriggerPercent: '80',
}

const byRoute = (left: LiveModel, right: LiveModel) =>
  left.route < right.route ? -1 : left.route > right.route ? 1 : 0

export function currentModels(): readonly LiveModel[] {
  return officialProfiles(PROFILE_INPUT)
    .map(officialProfileAdoption)
    .map(adoption => ({
      route: adoption.name,
      revision: adoption.revision,
      family: adoption.owner,
    }))
    .sort(byRoute)
}

/**
 * One single-model cell per model, and one alternating cell that leads with it: model i of a family
 * is paired with model i modulo n of the other families, both lists sorted by route.
 */
export function liveCells(models: readonly LiveModel[]): readonly LiveCell[] {
  const sorted = [...models].sort(byRoute)
  const singles = sorted.map(model => ({
    id: `single:${model.route}`,
    kind: 'single' as const,
    turns: [model.route, model.route, model.route],
  }))
  const alternates = sorted.flatMap(model => {
    const own = sorted.filter(other => other.family === model.family)
    const others = sorted.filter(other => other.family !== model.family)
    const partner = others[own.indexOf(model) % Math.max(others.length, 1)]
    if (partner === undefined) return []
    return [
      {
        id: `alternate:${model.route}~${partner.route}`,
        kind: 'alternate' as const,
        turns: [model.route, partner.route, model.route],
      },
    ]
  })
  return [...singles, ...alternates]
}

export function revisionsOf(
  cell: LiveCell,
  models: readonly LiveModel[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...new Set(cell.turns)].map(route => [
      route,
      models.find(model => model.route === route)?.revision ?? '',
    ]),
  )
}

/** What keeps the expectations in step with the records; empty when they agree. */
export function baselineProblems(
  cells: readonly LiveCell[],
  models: readonly LiveModel[],
  baseline: Baseline,
): readonly string[] {
  const problems: string[] = []
  for (const cell of cells) {
    const entry = baseline.cells[cell.id]
    if (entry === undefined) {
      problems.push(`${cell.id}: no expectation; run the live matrix and record it`)
      continue
    }
    for (const [route, revision] of Object.entries(revisionsOf(cell, models)))
      if (entry.revisions[route] !== revision)
        problems.push(
          `${cell.id}: measured ${route} at revision ${String(entry.revisions[route])}, the record is at ${revision}`,
        )
  }
  const ids = new Set(cells.map(cell => cell.id))
  for (const id of Object.keys(baseline.cells))
    if (!ids.has(id)) problems.push(`${id}: no such cell among the current records`)
  return problems
}
