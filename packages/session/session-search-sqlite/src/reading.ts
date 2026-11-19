import { existsSync } from 'node:fs'
import type { GramPlan } from '@omne-harness/session-search'
import { buildingOf, directoryOf, fileOf, pointerOf } from './files.ts'
import type { Handle, Handles } from './handles.ts'
import { ALL, matchOf } from './match.ts'
import { LAYOUT, SERIALS, dayOf, docOf } from './numbers.ts'

export type ReadContext = Readonly<{
  root: string
  extraction: number
  vocabularyLimit: number
  boot: number
  handles: Handles
}>

export type StoreState =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'ready'; generation: number }>
  | Readonly<{
      kind: 'rebuilding'
      generation: number | null
      building: number
      indexed: number
      total: number
    }>
  | Readonly<{ kind: 'broken'; diagnostic: string }>

export type StoreFailure = 'generation-gone' | 'unavailable'
export type StoreCandidates = Readonly<{
  covered: readonly Readonly<{ session: string; through: string; at: number }>[]
  rows: readonly Readonly<{ doc: string; session: string; position: string }>[]
}>
export type StoreCandidateRequest = Readonly<{
  tenant: string
  generation: number
  plan: GramPlan
  sessions: readonly string[] | null
  window: Readonly<{ from: number | null; to: number | null }>
  before: string | null
  limit: number
}>
/** Testing only: called between the two reads of a candidate query. */
export type CandidateFaults = Readonly<{ betweenReads?: () => void }>

const FOREVER = 1n << 62n

function brokenCurrent(context: ReadContext, file: string): string | null {
  try {
    if (!existsSync(file)) return 'the index file is missing'
    const rows = context.handles.prepared(file, 'SELECT key, value FROM meta').all()
    const meta = new Map(rows.map(row => [String(row['key']), Number(row['value'])]))
    if (meta.get('layout') !== LAYOUT) return 'the index file has another layout'
    return meta.get('extraction') === context.extraction
      ? null
      : 'the index was built with other text rules'
  } catch (cause) {
    context.handles.release(file)
    return `the index cannot be opened: ${String(cause)}`
  }
}

export function stateOf(context: ReadContext, tenant: string): StoreState {
  const directory = directoryOf(context.root, tenant)
  const pointer = pointerOf(directory)
  const building = buildingOf(directory, context.boot)
  if (pointer !== null) {
    const diagnostic = brokenCurrent(context, fileOf(directory, pointer.generation))
    if (diagnostic !== null) return { kind: 'broken', diagnostic }
  }
  const current = pointer?.generation ?? null
  if (building === null)
    return current === null ? { kind: 'absent' } : { kind: 'ready', generation: current }
  try {
    const file = fileOf(directory, building.generation)
    const row = context.handles.prepared(file, 'SELECT count(*) AS n FROM session').get()
    const indexed = Number(row?.['n'] ?? 0)
    return {
      kind: 'rebuilding',
      generation: current,
      building: building.generation,
      indexed,
      total: building.total,
    }
  } catch {
    return { kind: 'broken', diagnostic: 'the index being built cannot be opened' }
  }
}

type Scope = readonly number[] | null

const ROW = 'd.id AS id, d.at AS at, d.position AS position, s.id AS session'
const INSIDE =
  'd.at >= ? AND d.at <= ? AND (d.at < ? OR (d.at = ? AND d.id < ?)) ORDER BY d.at DESC, d.id DESC LIMIT ?'
const WALK = {
  newest: 'SELECT max(id) AS id FROM doc WHERE id < ?',
  day: `SELECT ${ROW} FROM doc d JOIN session s ON s.ordinal = d.session WHERE d.id >= ? AND d.id < ? AND ${INSIDE}`,
}
const MATCH = {
  newest:
    'SELECT rowid AS id FROM grams WHERE grams MATCH ? AND rowid < ? ORDER BY rowid DESC LIMIT 1',
  day: `SELECT ${ROW} FROM grams CROSS JOIN doc d ON d.id = grams.rowid JOIN session s ON s.ordinal = d.session WHERE grams MATCH ? AND grams.rowid >= ? AND grams.rowid < ? AND ${INSIDE}`,
}

// Days are walked from the newest with a row of the plan; a day's rows lie in the order they
// were written, so they are put in the order of their times here.
function rowsOf(
  context: ReadContext,
  handle: Handle,
  request: StoreCandidateRequest,
  scope: Scope,
): StoreCandidates['rows'] {
  const { handles, vocabularyLimit: limit } = context
  const expand = (prefix: string): readonly string[] =>
    handles
      .statement(handle, 'SELECT term FROM vocab WHERE term >= ? AND term < ? LIMIT ?')
      .all(prefix, `${prefix}\u{10ffff}`, limit + 1)
      .map(row => String(row['term']))
  const match = matchOf(request.plan, scope, { expand, limit })
  if (match === null) return []
  const [sql, narrowed] = match === ALL ? [WALK, []] : [MATCH, [match]]
  const before = request.before === null ? null : BigInt(request.before)
  const beforeAt = before === null ? FOREVER : before / SERIALS
  const beforeId = before === null ? 0n : dayOf(beforeAt) * SERIALS + (before % SERIALS)
  const low = BigInt(request.window.from ?? 0)
  const high = request.window.to === null ? FOREVER : BigInt(request.window.to)
  const rows: StoreCandidates['rows'][number][] = []
  let ceiling = (dayOf(high < beforeAt ? high : beforeAt) + 1n) * SERIALS
  while (rows.length < request.limit) {
    const top = handles.statement(handle, sql.newest).get(...narrowed, ceiling)?.['id']
    if (typeof top !== 'bigint' || top < dayOf(low) * SERIALS) break
    ceiling = top - (top % SERIALS)
    const left = request.limit - rows.length
    const found = handles
      .statement(handle, sql.day)
      .all(...narrowed, ceiling, ceiling + SERIALS, low, high, beforeAt, beforeAt, beforeId, left)
    for (const row of found)
      rows.push({
        doc: docOf(row['at'] as bigint, row['id'] as bigint),
        session: String(row['session']),
        position: String(row['position']),
      })
  }
  return rows
}

type CoverRow = StoreCandidates['covered'][number]

export function coversOf(
  context: ReadContext,
  tenant: string,
  generation: number,
): readonly CoverRow[] | StoreFailure {
  const directory = directoryOf(context.root, tenant)
  const known = [pointerOf(directory)?.generation, buildingOf(directory, context.boot)?.generation]
  if (!known.includes(generation)) return 'generation-gone'
  try {
    return context.handles
      .prepared(fileOf(directory, generation), 'SELECT id, covered, last_at FROM session')
      .all()
      .map(row => ({
        session: String(row['id']),
        through: String(row['covered']),
        at: Number(row['last_at']),
      }))
  } catch {
    return 'unavailable'
  }
}

// The cover first, the rows after, in one read transaction: a row is never read without the cover
// that vouches for it.
function readCandidates(
  context: ReadContext,
  handle: Handle,
  request: StoreCandidateRequest,
  faults: CandidateFaults,
): StoreCandidates {
  const { handles } = context
  const sessions = handles
    .statement(handle, 'SELECT ordinal, id, covered, last_at FROM session')
    .all()
  const covered = sessions.map(row => ({
    session: String(row['id']),
    through: String(row['covered']),
    at: Number(row['last_at']),
  }))
  const ordinals = new Map(sessions.map(row => [String(row['id']), Number(row['ordinal'])]))
  const scope =
    request.sessions?.map(session => ordinals.get(session)).filter(found => found !== undefined) ??
    null
  faults.betweenReads?.()
  const rows = rowsOf(context, handle, request, scope)
  return { covered, rows }
}

export function candidatesOf(
  context: ReadContext,
  request: StoreCandidateRequest,
  faults: CandidateFaults = {},
): StoreCandidates | StoreFailure {
  const directory = directoryOf(context.root, request.tenant)
  const file = fileOf(directory, request.generation)
  if (pointerOf(directory)?.generation !== request.generation) {
    context.handles.release(file)
    return 'generation-gone'
  }
  let handle: Handle
  try {
    handle = context.handles.handleOf(file)
    handle.db.exec('BEGIN')
  } catch {
    context.handles.release(file)
    return 'unavailable'
  }
  try {
    return readCandidates(context, handle, request, faults)
  } catch {
    return 'unavailable'
  } finally {
    handle.db.exec('COMMIT')
  }
}
