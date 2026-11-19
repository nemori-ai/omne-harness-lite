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
export type StoreStamp = Readonly<{ sessions: number; total: string }>
export type StoreCandidates = Readonly<{
  stamp: StoreStamp
  covered: readonly Readonly<{ session: string; through: string; at: number }>[] | null
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
  known: StoreStamp | null
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
const FROM_DOC = 'doc d JOIN session s ON s.ordinal = d.session'
const INSIDE =
  'd.at >= ? AND d.at <= ? AND (d.at < ? OR (d.at = ? AND d.id < ?)) ORDER BY d.at DESC, d.id DESC LIMIT ?'
const ONE = `SELECT ${ROW} FROM ${FROM_DOC} WHERE d.id = ?`
const WALK = {
  top: 'SELECT id FROM doc WHERE id < ? ORDER BY id DESC LIMIT ?',
  day: `SELECT ${ROW} FROM ${FROM_DOC} WHERE d.id >= ? AND d.id < ? AND ${INSIDE}`,
}
const MATCH = {
  top: 'SELECT rowid AS id FROM grams WHERE grams MATCH ? AND rowid < ? ORDER BY rowid DESC LIMIT ?',
  day: `SELECT ${ROW} FROM grams CROSS JOIN doc d ON d.id = grams.rowid JOIN session s ON s.ordinal = d.session WHERE grams MATCH ? AND grams.rowid >= ? AND grams.rowid < ? AND ${INSIDE}`,
}

type Found = Readonly<Record<string, unknown>>
const shownRow = (row: Found): StoreCandidates['rows'][number] => ({
  doc: docOf(row['at'] as bigint, row['id'] as bigint),
  session: String(row['session']),
  position: String(row['position']),
})

type Bounds = Readonly<{ low: bigint; high: bigint; beforeAt: bigint; beforeId: bigint }>

function boundsOf(request: StoreCandidateRequest): Bounds {
  const before = request.before === null ? null : BigInt(request.before)
  const beforeAt = before === null ? FOREVER : before / SERIALS
  const beforeId = before === null ? 0n : dayOf(beforeAt) * SERIALS + (before % SERIALS)
  const low = BigInt(request.window.from ?? 0)
  const high = request.window.to === null ? FOREVER : BigInt(request.window.to)
  return { low, high, beforeAt, beforeId }
}

function inside({ low, high, beforeAt, beforeId }: Bounds, row: Found): boolean {
  const [at, id] = [row['at'] as bigint, row['id'] as bigint]
  return at >= low && at <= high && (at < beforeAt || (at === beforeAt && id < beforeId))
}

function newestFirst(left: Found, right: Found): number {
  const [a, b] = [left['at'] as bigint, right['at'] as bigint]
  if (a !== b) return a > b ? -1 : 1
  return (left['id'] as bigint) > (right['id'] as bigint) ? -1 : 1
}

type Asked = readonly [sql: typeof WALK, narrowed: readonly string[]]

function askedOf(
  context: ReadContext,
  handle: Handle,
  request: StoreCandidateRequest,
  scope: Scope,
): Asked | null {
  const { handles, vocabularyLimit: limit } = context
  const expand = (prefix: string): readonly string[] =>
    handles
      .statement(handle, 'SELECT term FROM vocab WHERE term >= ? AND term < ? LIMIT ?')
      .all(prefix, `${prefix}\u{10ffff}`, limit + 1)
      .map(row => String(row['term']))
  const match = matchOf(request.plan, scope, { expand, limit })
  if (match === null) return null
  return match === ALL ? [WALK, []] : [MATCH, [match]]
}

// Of the newest row numbers: the day they were cut short in, if any, and the whole days above it.
function cutOf(ids: readonly bigint[], want: number, floor: bigint) {
  const last = ids.at(-1)
  if (last === undefined) return null
  const open = ids.length > want && last >= floor ? last - (last % SERIALS) : null
  const whole = ids.filter(id => id >= floor && (open === null || id >= open + SERIALS))
  return { open, whole }
}

// The plan is asked once for the newest row numbers. Days lie in the order of time, a day's rows
// as written: whole days are ordered here, a day cut short is read in full by itself.
function rowsOf(
  context: ReadContext,
  handle: Handle,
  request: StoreCandidateRequest,
  scope: Scope,
): StoreCandidates['rows'] {
  const asked = askedOf(context, handle, request, scope)
  if (asked === null) return []
  const [sql, narrowed] = asked
  const statement = (text: string) => context.handles.statement(handle, text)
  const bounds = boundsOf(request)
  const { low, high, beforeAt, beforeId } = bounds
  const floor = dayOf(low) * SERIALS
  const rows: StoreCandidates['rows'][number][] = []
  let ceiling = (dayOf(high < beforeAt ? high : beforeAt) + 1n) * SERIALS
  while (rows.length < request.limit) {
    const want = request.limit - rows.length
    const top = statement(sql.top).all(...narrowed, ceiling, want + 1)
    const cut = cutOf(
      top.map(row => row['id'] as bigint),
      want,
      floor,
    )
    if (cut === null) break
    const found = cut.whole.flatMap((id): Found[] => {
      const row = statement(ONE).get(id)
      return row !== undefined && inside(bounds, row) ? [row] : []
    })
    for (const row of found.sort(newestFirst)) rows.push(shownRow(row))
    const { open } = cut
    if (open === null) break
    const left = request.limit - rows.length
    const args = [...narrowed, open, open + SERIALS, low, high, beforeAt, beforeAt, beforeId, left]
    if (left > 0) for (const row of statement(sql.day).all(...args)) rows.push(shownRow(row))
    ceiling = open
  }
  return rows
}

type CoverRow = NonNullable<StoreCandidates['covered']>[number]

const coversIn = (handles: Handles, handle: Handle): CoverRow[] =>
  handles
    .statement(handle, 'SELECT id, covered, last_at FROM session')
    .all()
    .map(row => ({
      session: String(row['id']),
      through: String(row['covered']),
      at: Number(row['last_at']),
    }))

export function coversOf(
  context: ReadContext,
  tenant: string,
  generation: number,
): readonly CoverRow[] | StoreFailure {
  const directory = directoryOf(context.root, tenant)
  const known = [pointerOf(directory)?.generation, buildingOf(directory, context.boot)?.generation]
  if (!known.includes(generation)) return 'generation-gone'
  try {
    const handle = context.handles.handleOf(fileOf(directory, generation))
    return coversIn(context.handles, handle)
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
  const sum = handles
    .statement(handle, 'SELECT count(*) AS n, coalesce(sum(covered), 0) AS total FROM session')
    .get()!
  const stamp = { sessions: Number(sum['n']), total: String(sum['total']) }
  const { known } = request
  const stands = known?.sessions === stamp.sessions && known.total === stamp.total
  const covered = stands ? null : coversIn(handles, handle)
  const ordinal = handles.statement(handle, 'SELECT ordinal FROM session WHERE id = ?')
  const scope =
    request.sessions?.flatMap(session => {
      const found = ordinal.get(session)
      return found === undefined ? [] : [Number(found['ordinal'])]
    }) ?? null
  faults.betweenReads?.()
  const rows = rowsOf(context, handle, request, scope)
  return { stamp, covered, rows }
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
