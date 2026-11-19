import { existsSync } from 'node:fs'
import type { GramPlan } from '@omne-harness/session-search'
import { buildingOf, directoryOf, fileOf, pointerOf } from './files.ts'
import type { Handle, Handles } from './handles.ts'
import { ALL, matchOf } from './match.ts'

export type ReadContext = Readonly<{
  root: string
  extraction: number
  vocabularyLimit: number
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

export const SERIALS = 1n << 20n
const NEWEST = (1n << 62n).toString()

function brokenCurrent(context: ReadContext, file: string): string | null {
  try {
    if (!existsSync(file)) return 'the index file is missing'
    const row = context.handles
      .prepared(file, `SELECT value FROM meta WHERE key = 'extraction'`)
      .get()
    return Number(row?.['value']) === context.extraction
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
  const building = buildingOf(directory)
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

function windowOf(request: StoreCandidateRequest): Readonly<{ low: bigint; high: bigint }> {
  const { from, to } = request.window
  const before = BigInt(request.before ?? NEWEST)
  const end = to === null ? before : (BigInt(to) + 1n) * SERIALS
  return { low: from === null ? 0n : BigInt(from) * SERIALS, high: end < before ? end : before }
}

type Scope = readonly number[] | null

function idsOf(
  context: ReadContext,
  handle: Handle,
  request: StoreCandidateRequest,
  scope: Scope,
): readonly bigint[] {
  const { handles, vocabularyLimit: limit } = context
  const expand = (prefix: string): readonly string[] =>
    handles
      .statement(handle, 'SELECT term FROM vocab WHERE term >= ? AND term < ? LIMIT ?')
      .all(prefix, `${prefix}\u{10ffff}`, limit + 1)
      .map(row => String(row['term']))
  const match = matchOf(request.plan, scope, { expand, limit })
  if (match === null) return []
  const { low, high } = windowOf(request)
  const rows =
    match === ALL
      ? handles
          .statement(handle, 'SELECT id FROM doc WHERE id >= ? AND id < ? ORDER BY id DESC LIMIT ?')
          .all(low, high, request.limit)
      : handles
          .statement(
            handle,
            'SELECT rowid AS id FROM grams WHERE grams MATCH ? AND rowid >= ? AND rowid < ? ORDER BY rowid DESC LIMIT ?',
          )
          .all(match, low, high, request.limit)
  return rows.map(row => row['id'] as bigint)
}

type CoverRow = StoreCandidates['covered'][number]

/** The covers of a generation that is current or being built. */
export function coversOf(
  context: ReadContext,
  tenant: string,
  generation: number,
): readonly CoverRow[] | StoreFailure {
  const directory = directoryOf(context.root, tenant)
  const known = [pointerOf(directory)?.generation, buildingOf(directory)?.generation]
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
  const locate = handles.statement(
    handle,
    'SELECT s.id AS session, d.position AS position FROM doc d JOIN session s ON s.ordinal = d.session WHERE d.id = ?',
  )
  const rows = idsOf(context, handle, request, scope).flatMap(id => {
    const row = locate.get(id)
    if (row === undefined) return []
    return [
      { doc: id.toString(), session: String(row['session']), position: String(row['position']) },
    ]
  })
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
