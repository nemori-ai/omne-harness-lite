import { judge, type Measured, type Turn } from './measure.ts'
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

// These inexpensive counterparts exercise Messages, Chat Completions and Responses.
const haiku = 'anthropic/claude-haiku-5.5'
const luna = 'openai/gpt-6-luna'
const switchingPeers = [haiku, 'qwen/qwen3.8-omni-flash', luna]
const protocolRepresentatives = new Map([
  ['@omne-harness/pi-ai-anthropic', haiku],
  ['@omne-harness/pi-ai-openai', luna],
])

export function liveCells(
  models: readonly LiveModel[],
  peerRoutes: readonly string[] = switchingPeers,
): readonly LiveCell[] {
  const sorted = [...models].sort(byRoute)
  const singles = sorted.map(model => ({
    id: `single:${model.route}`,
    kind: 'single' as const,
    turns: [model.route, model.route, model.route],
  }))
  const families = new Set(sorted.map(model => model.family))
  if (families.size < 2) return singles
  for (const [family, route] of protocolRepresentatives) {
    if (
      families.has(family) &&
      !sorted.some(model => model.family === family && model.route === route)
    )
      throw new Error('Missing inexpensive protocol representative: ' + route)
  }
  const peers = peerRoutes.flatMap(route => sorted.filter(model => model.route === route))
  const alternates = sorted.flatMap(model => {
    const representative = protocolRepresentatives.get(model.family)
    if (representative !== undefined && model.route !== representative) return []
    const partner = peers.find(other => other.family !== model.family)
    if (partner === undefined) throw new Error('No inexpensive switching peer for ' + model.route)
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

function entryProblems(
  cell: LiveCell,
  models: readonly LiveModel[],
  entry: BaselineEntry | undefined,
): string[] {
  if (entry === undefined) return [`${cell.id}: no expectation; run the live matrix and record it`]
  const problems: string[] = []
  const revisions = revisionsOf(cell, models)
  for (const [route, revision] of Object.entries(revisions)) {
    if (revision === '' || entry.revisions[route] !== revision)
      problems.push(
        `${cell.id}: measured ${route} at revision ${String(entry.revisions[route])}, the record is at ${revision}`,
      )
  }
  for (const route of Object.keys(entry.revisions)) {
    if (!Object.hasOwn(revisions, route))
      problems.push(`${cell.id}: unexpected revision for ${route}`)
  }
  if (
    !Number.isFinite(Date.parse(entry.measuredOn)) ||
    (entry.hitRate !== null &&
      (!Number.isFinite(entry.hitRate) || entry.hitRate < 0 || entry.hitRate > 1)) ||
    entry.dropped !== 0 ||
    !Number.isFinite(entry.costUsd) ||
    entry.costUsd < 0
  )
    problems.push(`${cell.id}: invalid baseline measurement`)
  return problems
}

/** Both the offline check and the incremental run apply the same entry requirements. */
export function baselineProblems(
  cells: readonly LiveCell[],
  models: readonly LiveModel[],
  baseline: Baseline,
): readonly string[] {
  const problems = cells.flatMap(cell => entryProblems(cell, models, baseline.cells[cell.id]))
  const ids = new Set(cells.map(cell => cell.id))
  for (const id of Object.keys(baseline.cells))
    if (!ids.has(id)) problems.push(`${id}: no such cell among the current records`)
  return problems
}

export function requiredCells(
  cells: readonly LiveCell[],
  models: readonly LiveModel[],
  baseline: Baseline,
): readonly LiveCell[] {
  return cells.filter(cell => entryProblems(cell, models, baseline.cells[cell.id]).length > 0)
}

export type MatrixRow = Readonly<{
  cell: string
  state: 'green' | 'red' | 'error' | 'not-run'
  reasons: readonly string[]
  measured: Measured | null
  turns?: readonly Turn[]
}>

export function recordBaseline(
  cells: readonly LiveCell[],
  models: readonly LiveModel[],
  baseline: Baseline,
  required: readonly LiveCell[],
  rows: readonly MatrixRow[],
  measuredOn: string,
): Baseline {
  const ids = new Set(required.map(cell => cell.id))
  if (
    ids.size === 0 ||
    ids.size !== required.length ||
    rows.length !== ids.size ||
    new Set(rows.map(row => row.cell)).size !== ids.size ||
    rows.some(row => !ids.has(row.cell))
  )
    throw new Error('matrix results must match the nonempty required cell set exactly')
  const recorded: Record<string, BaselineEntry> = {}
  for (const cell of cells) {
    const entry = baseline.cells[cell.id]
    if (entry !== undefined && entryProblems(cell, models, entry).length === 0)
      recorded[cell.id] = entry
  }
  for (const row of rows) {
    const cell = cells.find(item => item.id === row.cell)
    const measured = row.measured
    if (
      cell === undefined ||
      row.state !== 'green' ||
      row.reasons.length !== 0 ||
      measured === null ||
      measured.costUsd === null ||
      !Number.isFinite(measured.costUsd) ||
      measured.costUsd < 0 ||
      measured.unanswered !== 0 ||
      measured.misrouted !== 0 ||
      measured.dropped !== 0 ||
      judge(measured, baseline.cells[row.cell]).length !== 0
    )
      throw new Error(`cannot record incomplete or non-green cell ${row.cell}`)
    recorded[row.cell] = {
      measuredOn,
      revisions: revisionsOf(cell, models),
      hitRate: measured.hitRate === null ? null : Number(measured.hitRate.toFixed(3)),
      dropped: measured.dropped,
      costUsd: Number(measured.costUsd.toFixed(6)),
    }
  }
  const next = {
    cells: Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => (a < b ? -1 : 1))),
  }
  if (requiredCells(cells, models, next).length > 0)
    throw new Error('matrix baseline would be incomplete')
  return next
}
