// The history index that the pure layer reads from a snapshot (session-contract SPEC FR-01,
// SessionHistoryIndex), assembled inside the commit transaction (or one read snapshot) from the
// rows of both participants of the Session log combination. The Session side comes from the
// Session log: the routed inputs, and each attempt with the Run it started under. The Agent side
// (K-5) comes from the same-root index tables of `execution-record`: the execution boundaries,
// the fact boundaries, the batches and the original input directory. The root position is the
// common log root of both participants (log-root.ts).
//
// The index covers only the relations of this decision (FR-01: "集合只需覆盖本次决定及其完整批次
// 涉及的关系"): the inputs of the scope, the executions that admitted them, the executions the
// caller names (the execution of a log observation), and the inputs of the batches of those
// executions, to closure. Every Agent row is read by a point or range lookup on its key; no
// statement reads every execution of the session. A relation that cannot be proved is left out,
// so the pure layer answers `unavailable` for it; nothing is guessed from the current advance.
//
// The Session side is kept per session in this Worker module and grows by the rows after its
// cursor only (C-WORKCACHE A3): the Session log is append-only and a stored row does not change,
// so the rows folded once stay true. Each use proves the cursor first, and a fold never keeps rows
// of a transaction that has not committed. See `sessionRows`.
import {
  executionReadThrough,
  type DurableEvidence,
  type ExecutionHistoryBoundary,
  type HistoryEntry,
  type InputAdmissionBoundary,
  type InputAdmissionPage,
  type InputId,
  type RunId,
  type SessionAttemptRecord,
  type SessionBatchRecord,
  type SessionExecutionPrefix,
  type SessionFactBoundary,
  type SessionHistoryIndex,
  type SessionHistoryReads,
  type SessionInputAdmission,
  type SessionInputScope,
  type SessionControlOrigin,
  type SessionFactKind,
  type SessionLogRoot,
  type SessionOperationId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, plainOf, sha256 } from '../codec.ts'
import { logRoot } from './log-root.ts'
import { big, oneRow, rowsOf, text, type Executor, type Row } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_ROWS = 100_000
/** The page of the backward scan for the latest interpretation row of one Run. */
const PROGRESS_PAGE = 16

/**
 * The kinds a fact boundary may carry: the consequence kinds, and `deferred` for a control event
 * whose consequences Session decides when it interprets it. A row with another kind is not a
 * boundary.
 */
const CONSEQUENCE_KINDS: Readonly<Record<SessionFactKind, true>> = {
  'call-registration': true,
  'call-association': true,
  'registered-waiting': true,
  'input-taken': true,
  call: true,
  producer: true,
  waiting: true,
  control: true,
  ended: true,
  observed: true,
  deferred: true,
}
const isConsequenceKind = (kind: unknown): kind is SessionFactKind =>
  typeof kind === 'string' && Object.hasOwn(CONSEQUENCE_KINDS, kind)

/**
 * What the decision names beyond its input scope: the executions it reads itself (the execution of
 * a log observation), and the event of that observation, whose fact row is read even when its
 * sequence is already interpreted (the pure layer recalls it against that row).
 */
export type HistoryFocus = Readonly<{
  executions: readonly string[]
  event: Readonly<{ execution: string; sequence: string }> | null
}>

export const NO_FOCUS: HistoryFocus = { executions: [], event: null }

export type SessionHistory = Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>

type Planted = Readonly<{
  id: string
  revision: string
  entry: HistoryEntry
  data: Record<string, unknown>
}>
type Start = Readonly<{ run: RunId; started: DurableEvidence }>
type Scope = Readonly<{ tenant: string; session: string }>

/** Raised when the rows of one index exceed the read bound: the index would be partial. */
class TooMany extends Error {}

/**
 * Every statement reads at most what is left of one shared row bound, and counts against it. A
 * statement with its own `page` reads at most that many rows and is complete at fewer. Each
 * statement ends with `LIMIT ?`, and the reader binds that last parameter. `charge` counts rows
 * that the index holds already as if this call read them, so the bound answers as a whole read.
 */
type Reader = ((sql: string, params: readonly SqlValue[], page?: number) => Row[]) &
  Readonly<{ charge(rows: number): void }>

function boundedReader(port: Executor, limit: number): Reader {
  let left = limit
  const read = (sql: string, params: readonly SqlValue[], page?: number): Row[] => {
    const cap = page === undefined || page > left ? left + 1 : page
    const rows = rowsOf(port, sql, [...params, BigInt(cap)])
    if (rows.length > left) throw new TooMany()
    left -= rows.length
    return rows
  }
  return Object.assign(read, {
    charge(rows: number) {
      if (rows > left) throw new TooMany()
      left -= rows
    },
  })
}

const parsed = (cell: SqlCell | undefined): unknown =>
  decodeValue(JSON.parse(text(cell)) as JsonValue)

/** The decoded JSON of a cell, or `undefined` when it does not parse. */
function readable(cell: SqlCell | undefined): unknown {
  try {
    return parsed(cell)
  } catch {
    return undefined
  }
}

/** The text of a nullable column: null for an absent value (a legacy row) and for an empty one. */
const optionalText = (cell: SqlCell | undefined): string | null =>
  cell === null || cell === undefined || text(cell) === '' ? null : text(cell)

/** A complete durable evidence: four non-empty texts. */
function evidenceOf(value: unknown): DurableEvidence | null {
  if (typeof value !== 'object' || value === null) return null
  const { owner, record, revision, digest } = value as Record<string, unknown>
  return [owner, record, revision, digest].every(part => typeof part === 'string' && part !== '')
    ? ({ owner, record, revision, digest } as DurableEvidence)
    : null
}

/**
 * The evidence of one Session log row: its position, revision and the digest of its content. The
 * receipt of a log commit names its interpretation row with this function, so the saved fact and
 * the index agree.
 */
export function entryEvidence(
  tenant: string,
  session: string,
  entry: HistoryEntry,
): DurableEvidence {
  return {
    owner: OWNER,
    record: `${tenant}/${session}/entry/${entry.id}`,
    revision: entry.revision,
    digest: `sha256:${sha256(canonicalText(entry))}`,
  }
}

const rowEvidence = (scope: Scope, row: Planted): DurableEvidence =>
  entryEvidence(scope.tenant, scope.session, row.entry)

function plant(row: Row): Planted {
  const entry = decodeValue(JSON.parse(text(row['entry'])) as JsonValue) as HistoryEntry
  return {
    id: text(row['position']),
    revision: text(row['revision']),
    entry,
    data: (plainOf(entry.payload) ?? {}) as Record<string, unknown>,
  }
}

/** One SE15 row as folded: its Run is resolved against the SE13 rows when the index is answered. */
type AttemptRow = Readonly<{
  run: unknown
  attempt: unknown
  ordinal: string
  started: DurableEvidence
}>

/**
 * The Session rows of the index of one session, folded in log order up to `through` (C-WORKCACHE
 * A3). `anchor` is the fingerprint of the log row at `through`; `count` is the number of rows of
 * the five kinds folded in, which the row bound of a call counts as if it read them again.
 * `active` is the execution of the Run active after the last folded row (SE24). An SE15 row whose
 * Run has no SE13 is kept in `attemptRows` and left out of `attempts`, as a whole read leaves it
 * out; an SE13 row that comes later resolves it.
 */
type SessionRowsIndex = {
  through: bigint
  anchor: string
  count: number
  routed: Map<string, DurableEvidence>
  starts: Map<string, Start>
  runs: Map<string, string>
  attemptRows: AttemptRow[]
  attempts: SessionAttemptRecord[]
  attemptsByRun: Map<unknown, SessionAttemptRecord[]>
  controls: SessionControlOrigin[]
  active: string | null
}

/** What one decision reads of the Session rows. The maps are read only; the arrays are its own. */
type SessionRowsView = Readonly<{
  routed: ReadonlyMap<string, DurableEvidence>
  starts: ReadonlyMap<string, Start>
  attempts: SessionAttemptRecord[]
  attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>
  controls: SessionControlOrigin[]
}>

/** The sessions whose Session rows this Worker keeps. Over the bound the least recently used goes. */
const INDEX_CACHE_SESSIONS = 256
/** The rows of the five kinds that this Worker keeps over all sessions. */
const INDEX_CACHE_ROWS = 262_144

/** The kept Session rows by `[tenant, session]`, in least recently used order (C-WORKCACHE A3). */
const kept = new Map<string, SessionRowsIndex>()

const INDEXED_KINDS =
  "('intake.routed', 'run.started', 'run.attempt-started', 'run.terminal', 'control.requested')"

function emptyIndex(): SessionRowsIndex {
  return {
    through: 0n,
    anchor: '',
    count: 0,
    routed: new Map(),
    starts: new Map(),
    runs: new Map(),
    attemptRows: [],
    attempts: [],
    attemptsByRun: new Map(),
    controls: [],
    active: null,
  }
}

function cloneIndex(index: SessionRowsIndex): SessionRowsIndex {
  return {
    ...index,
    routed: new Map(index.routed),
    starts: new Map(index.starts),
    runs: new Map(index.runs),
    attemptRows: [...index.attemptRows],
    attempts: [...index.attempts],
    attemptsByRun: new Map([...index.attemptsByRun].map(([run, list]) => [run, [...list]])),
    controls: [...index.controls],
  }
}

/** Resolves one SE15 row against the SE13 rows folded so far; null while its Run has none. */
function resolved(index: SessionRowsIndex, row: AttemptRow): SessionAttemptRecord | null {
  const execution = index.runs.get(String(row.run))
  return execution === undefined
    ? null
    : Object.freeze({
        run: row.run as never,
        attempt: row.attempt as never,
        execution,
        ordinal: row.ordinal,
        started: row.started,
      })
}

function addAttempt(index: SessionRowsIndex, record: SessionAttemptRecord): void {
  index.attempts.push(record)
  const list = index.attemptsByRun.get(record.run)
  if (list === undefined) index.attemptsByRun.set(record.run, [record])
  else list.push(record)
}

/**
 * Folds `rows` (after `index.through`, in log order) into `index`. An SE13 row of a Run that
 * already has SE15 rows changes how those resolve, so every SE15 row is resolved again then.
 */
function fold(index: SessionRowsIndex, scope: Scope, rows: readonly Planted[]): void {
  const added: AttemptRow[] = []
  let again = false
  for (const row of rows) {
    if (foldRow(index, scope, row, added)) again = true
    index.count += 1
  }
  if (again) {
    index.attempts = []
    index.attemptsByRun = new Map()
  }
  for (const row of again ? index.attemptRows : added) {
    const record = resolved(index, row)
    if (record !== null) addAttempt(index, record)
  }
}

/**
 * Folds one row into `index`; an SE15 row goes to `added` too. True for an SE13 row of a Run that
 * already has SE15 rows: those resolve otherwise now.
 */
function foldRow(
  index: SessionRowsIndex,
  scope: Scope,
  row: Planted,
  added: AttemptRow[],
): boolean {
  switch (row.entry.kind) {
    case 'intake.routed':
      index.routed.set(String(row.data['input']), Object.freeze(rowEvidence(scope, row)))
      return false
    case 'run.started':
      return foldStart(index, scope, row)
    case 'run.attempt-started': {
      const attempt = attemptRowOf(scope, row)
      index.attemptRows.push(attempt)
      added.push(attempt)
      return false
    }
    case 'run.terminal':
      index.active = null
      return false
    case 'control.requested':
      foldControl(index, row)
      return false
  }
  return false
}

/** An SE13 row: the Run starts its execution, which is active from now on. */
function foldStart(index: SessionRowsIndex, scope: Scope, row: Planted): boolean {
  const { data } = row
  const run = String(data['run'])
  const execution = String(data['execution'])
  index.starts.set(
    execution,
    Object.freeze({
      run: data['run'] as RunId,
      started: Object.freeze(rowEvidence(scope, row)),
    }),
  )
  const again = index.attemptRows.some(item => String(item.run) === run)
  index.runs.set(run, execution)
  index.active = execution
  return again
}

function attemptRowOf(scope: Scope, row: Planted): AttemptRow {
  const { data } = row
  return Object.freeze({
    run: data['run'],
    attempt: data['attempt'],
    ordinal: String(data['ordinal']),
    started: Object.freeze(rowEvidence(scope, row)),
  })
}

/** A Session control names the execution active when it was requested. */
function foldControl(index: SessionRowsIndex, row: Planted): void {
  const progress = row.data['progress'] as { operation?: unknown } | undefined
  if (typeof progress?.operation === 'string')
    index.controls.push(
      Object.freeze({
        operation: progress.operation as SessionOperationId,
        execution: index.active,
      }),
    )
}

/** The fingerprint of the log row at `position`: its revision, kind and the digest of its text. */
function anchorAt(port: Executor, scope: Scope, position: bigint): string | null {
  const row = oneRow(
    port,
    'SELECT revision, kind, entry FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
    [scope.tenant, scope.session, position],
  )
  return row === undefined
    ? null
    : `${text(row['revision'])}/${text(row['kind'])}/${sha256(text(row['entry']))}`
}

/** Keeps `index` as the most recently used, then drops the least recently used over the bounds. */
function keep(key: string, index: SessionRowsIndex): void {
  kept.delete(key)
  if (index.count > INDEX_CACHE_ROWS) return
  kept.set(key, index)
  let rows = 0
  for (const item of kept.values()) rows += item.count
  for (const [oldest, item] of kept) {
    if (kept.size <= INDEX_CACHE_SESSIONS && rows <= INDEX_CACHE_ROWS) break
    kept.delete(oldest)
    rows -= item.count
  }
}

const viewOf = (index: SessionRowsIndex): SessionRowsView => ({
  routed: index.routed,
  starts: index.starts,
  attempts: [...index.attempts],
  attemptsByRun: index.attemptsByRun,
  controls: [...index.controls],
})

/**
 * The Session rows of the index: the routed inputs, the SE13 of each execution, the SE15 rows, and
 * the original execution of each Session control (C-WORKCACHE A3, R2-D90).
 *
 * The rows of the five kinds after the kept cursor are read and folded into the kept index; the
 * answer is the one a read of every row gives (the row bound counts the kept rows too). The kept
 * index is used only when the log row at its cursor still has the fingerprint it had: otherwise
 * this Worker sees another log than it folded (a database replaced or rolled back, or one module
 * that serves several databases), and the index is built again from the first row. The log rows
 * after the cursor must continue it without a gap; a gap is a log that was not only appended to,
 * so the kept index is dropped and the call fails (a commit rolls back, a read is unavailable);
 * the next call builds again. Rows of a revision past the journal tail are rows of the open
 * transaction: they are folded into a copy for this call and never kept, since that transaction
 * may still roll back.
 *
 * A row whose revision is not past the journal tail is taken as committed. That holds only because
 * the `session` participant is `grouping: 'singleton'`: each write transaction carries one
 * operation, and the participant reads the index before it moves the tail. In a group commit a
 * later operation would see the tail that an earlier operation of the group moved, and keep rows
 * that the group can still roll back. A groupable `session` participant needs another design of
 * this cache first (SPEC 已知限制第 21 条).
 */
function sessionRows(read: Reader, port: Executor, scope: Scope): SessionRowsView {
  const key = JSON.stringify([scope.tenant, scope.session])
  const base = provenBase(port, scope, key)
  const from = base?.through ?? 0n
  read.charge(base?.count ?? 0)
  const after = rowsAfter(read, port, scope, from)
  if (after.added === 0n) {
    if (base === undefined) return viewOf(emptyIndex())
    keep(key, base)
    return viewOf(base)
  }
  if (base !== undefined && after.last - from !== after.added) {
    kept.delete(key)
    throw new Error(
      `the history index found a gap in the Session log after position ${String(from)}: ${String(after.added)} rows up to position ${String(after.last)}`,
    )
  }
  const planted = after.rows.map(plant)
  const committed = after.top <= journalTail(port, scope)
  const index = base === undefined ? emptyIndex() : committed ? base : cloneIndex(base)
  try {
    fold(index, scope, planted)
    index.through = after.last
    index.anchor = anchorAt(port, scope, after.last) ?? ''
  } catch (error) {
    if (index === base) kept.delete(key)
    throw error
  }
  if (committed) keep(key, index)
  return viewOf(index)
}

/** The kept index of `key` when the log row at its cursor still has its fingerprint; else none. */
function provenBase(port: Executor, scope: Scope, key: string): SessionRowsIndex | undefined {
  const base = kept.get(key)
  if (base === undefined || anchorAt(port, scope, base.through) === base.anchor) return base
  kept.delete(key)
  return undefined
}

/** The rows after `from`: those of the five kinds, and the count, last position and top revision of all. */
type RowsAfter = Readonly<{ rows: readonly Row[]; added: bigint; last: bigint; top: bigint }>

function rowsAfter(read: Reader, port: Executor, scope: Scope, from: bigint): RowsAfter {
  const rows = read(
    `SELECT position, revision, entry FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind IN ${INDEXED_KINDS} AND position > ?
      ORDER BY position LIMIT ?`,
    [scope.tenant, scope.session, from],
  )
  const after = oneRow(
    port,
    `SELECT COUNT(*) AS n, MAX(position) AS last, MAX(revision) AS top FROM sl_entry
      WHERE tenant = ? AND session = ? AND position > ? LIMIT 1`,
    [scope.tenant, scope.session, from],
  )
  const added = after === undefined ? 0n : big(after['n'])
  return added === 0n
    ? { rows, added, last: from, top: 0n }
    : { rows, added, last: big(after?.['last']), top: big(after?.['top']) }
}

function journalTail(port: Executor, scope: Scope): bigint {
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  return journal === undefined ? 0n : big(journal['tail'])
}

/**
 * The evidence of the latest interpretation row (`history.annotated` with an execution) of `run`:
 * the saved fact that the execution progress of the snapshot came from. Read backward in pages.
 */
function interpretedOf(read: Reader, scope: Scope, run: RunId): DurableEvidence | null {
  let before: bigint | null = null
  for (;;) {
    const rows = read(
      `SELECT position, revision, entry FROM sl_entry
        WHERE tenant = ? AND session = ? AND kind = 'history.annotated'${before === null ? '' : ' AND position < ?'}
        ORDER BY position DESC LIMIT ?`,
      before === null ? [scope.tenant, scope.session] : [scope.tenant, scope.session, before],
      PROGRESS_PAGE,
    )
    for (const row of rows) {
      const planted = plant(row)
      if (planted.data['run'] === run && typeof planted.data['execution'] === 'object')
        return rowEvidence(scope, planted)
    }
    if (rows.length < PROGRESS_PAGE) return null
    before = BigInt(text(rows[rows.length - 1]?.['position']))
  }
}

/** The facts of one execution: a row with an unknown kind is not a boundary, so it fails the execution. */
function factsOf(rows: readonly Row[]): SessionFactBoundary[] | null {
  const facts: SessionFactBoundary[] = []
  for (const row of rows) {
    const kinds = readable(row['kinds'])
    if (!Array.isArray(kinds) || !kinds.every(isConsequenceKind)) return null
    const source = readable(row['source'])
    // An unreadable source is a missing row: the range has a gap there.
    if (source === undefined) continue
    facts.push({ sequence: text(row['sequence']), source: source as DurableEvidence, kinds })
  }
  return facts
}

function endedOf(cell: SqlCell | undefined): ExecutionHistoryBoundary['ended'] | 'malformed' {
  if (cell === null || cell === undefined) return null
  const value = readable(cell) as Record<string, unknown> | null | undefined
  if (value === undefined) return 'malformed'
  if (value === null) return null
  const source = evidenceOf(value['source'])
  return typeof value['sequence'] === 'string' && source !== null
    ? { sequence: value['sequence'], source }
    : 'malformed'
}

type Context = Readonly<{
  read: Reader
  scope: Scope
  snapshot: WorkSnapshot
  starts: ReadonlyMap<string, Start>
  focus: HistoryFocus
}>

/** The sequence below the unread range that this decision still reads: the focused event, or none. */
function focusedSequence(context: Context, execution: string): bigint {
  const event = context.focus.event
  return event !== null && event.execution === execution ? BigInt(event.sequence) : -1n
}

/**
 * The execution boundary of one execution, from its row in `er_execution` (a point lookup) and the
 * unread facts in `er_fact_idx`. Left out (null) when it has no SE13 in this session, its head
 * receipt is a placeholder (digest `unknown`) or does not parse, its ended event does not parse,
 * a fact names an unknown kind, or the progress has no interpretation row.
 */
function boundaryOf(context: Context, execution: string): ExecutionHistoryBoundary | null {
  const { read, scope, snapshot } = context
  const start = context.starts.get(execution)
  if (start === undefined) return null
  const row = read(
    `SELECT revision, receipt, emitted_through, ended FROM er_execution
      WHERE tenant = ? AND execution = ? AND session = ? LIMIT ?`,
    [scope.tenant, execution, scope.session],
  )[0]
  if (row === undefined) return null
  const receipt = evidenceOf(readable(row['receipt']))
  if (receipt === null || receipt.digest === 'unknown') return null
  const ended = endedOf(row['ended'])
  if (ended === 'malformed') return null
  const readThrough = executionReadThrough(snapshot, start.run, execution) ?? '0'
  const facts = factsOf(
    read(
      `SELECT sequence, source, kinds FROM er_fact_idx
        WHERE tenant = ? AND execution = ? AND session = ? AND (sequence > ? OR sequence = ?)
        ORDER BY sequence LIMIT ?`,
      [
        scope.tenant,
        execution,
        scope.session,
        BigInt(readThrough),
        focusedSequence(context, execution),
      ],
    ),
  )
  if (facts === null) return null
  const interpreted = readThrough === '0' ? null : interpretedOf(read, scope, start.run)
  if (readThrough !== '0' && interpreted === null) return null
  return {
    run: start.run,
    execution,
    started: start.started,
    revision: text(row['revision']),
    executionEvidence: receipt,
    emittedThrough: text(row['emitted_through']),
    readThrough,
    interpreted,
    ended,
    facts,
  }
}

/**
 * The batches of one execution that are not interpreted yet, and the batch of the focused event.
 * An interpreted batch is not listed: its taken effect is not indexed in this wave (`taken` stays
 * empty), and a listed batch without its taken effect reads as a contradiction.
 */
function batchesOf(context: Context, boundary: ExecutionHistoryBoundary): SessionBatchRecord[] {
  const { read, scope } = context
  return read(
    `SELECT sequence, source, batch FROM er_batch_idx
      WHERE tenant = ? AND execution = ? AND session = ? AND (sequence > ? OR sequence = ?)
      ORDER BY sequence LIMIT ?`,
    [
      scope.tenant,
      boundary.execution,
      scope.session,
      BigInt(boundary.readThrough),
      focusedSequence(context, boundary.execution),
    ],
  ).flatMap(row => {
    const source = readable(row['source'])
    const batch = readable(row['batch']) as SessionBatchRecord['batch'] | undefined
    return source === undefined || !Array.isArray(batch?.ordered)
      ? []
      : [
          {
            run: boundary.run,
            execution: boundary.execution,
            sequence: text(row['sequence']),
            source: source as DurableEvidence,
            batch,
          },
        ]
  })
}

type Closure = {
  admissions: Map<string, Row[]>
  executions: Map<string, ExecutionHistoryBoundary | null>
  batches: SessionBatchRecord[]
}

/** The inputs of the scope, their admitting executions and the batch inputs of those, to closure. */
function closeOver(context: Context, inputs: readonly string[]): Closure {
  const { read, scope } = context
  const closure: Closure = { admissions: new Map(), executions: new Map(), batches: [] }
  const pendingInputs = [...inputs]
  const pendingExecutions = [...context.focus.executions]
  while (pendingInputs.length > 0 || pendingExecutions.length > 0) {
    const input = pendingInputs.shift()
    if (input !== undefined && !closure.admissions.has(input)) {
      const rows = read(
        `SELECT ordinal, execution, operation, accepted, grant_ref, attachment FROM er_admission_idx
          WHERE tenant = ? AND session = ? AND input = ? ORDER BY ordinal LIMIT ?`,
        [scope.tenant, scope.session, input],
      )
      const named = new Map(
        read(
          `SELECT ordinal, attempt FROM er_admission_attempt_idx
            WHERE tenant = ? AND session = ? AND input = ? ORDER BY ordinal LIMIT ?`,
          [scope.tenant, scope.session, input],
        ).map(row => [text(row['ordinal']), text(row['attempt'])] as const),
      )
      closure.admissions.set(
        input,
        rows.map(row => ({ ...row, attempt: named.get(text(row['ordinal'])) ?? null })),
      )
      pendingExecutions.push(...rows.map(row => text(row['execution'])))
    }
    const execution = pendingExecutions.shift()
    if (execution === undefined || closure.executions.has(execution)) continue
    const boundary = boundaryOf(context, execution)
    closure.executions.set(execution, boundary)
    if (boundary === null) continue
    const batches = batchesOf(context, boundary)
    closure.batches.push(...batches)
    for (const batch of batches) pendingInputs.push(...batch.batch.ordered)
  }
  return closure
}

/**
 * The attempt of one admission: the SE15 the row names (`attempt`), else the SE15 whose receipt is
 * the grant, else the only SE15 of the Run. A row that names an attempt is never matched any other
 * way: when that SE15 is not of the Run the admission is not provable. Attempts are never removed,
 * so a Run with one SE15 had that one when the admission was granted.
 */
function attemptOf(
  attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>,
  run: RunId,
  grant: DurableEvidence | null,
  recorded: string | null,
): SessionAttemptRecord | null {
  const ofRun = attemptsByRun.get(run) ?? []
  if (recorded !== null) return ofRun.find(item => item.attempt === recorded) ?? null
  const named =
    grant === null
      ? undefined
      : ofRun.find(item => canonicalText(item.started) === canonicalText(grant))
  return named ?? (ofRun.length === 1 ? (ofRun[0] ?? null) : null)
}

/** The original admissions of one input, or null when one of them names no provable Run or attempt. */
function admissionsOf(
  rows: readonly Row[],
  starts: ReadonlyMap<string, Start>,
  attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>,
): SessionInputAdmission[] | null {
  const records: SessionInputAdmission[] = []
  for (const row of rows) {
    const execution = text(row['execution'])
    const start = starts.get(execution)
    if (start === undefined) return null
    const accepted = evidenceOf(readable(row['accepted']))
    const grant = evidenceOf(readable(row['grant_ref']))
    const attempt = attemptOf(attemptsByRun, start.run, grant, optionalText(row['attempt']))
    if (attempt === null || accepted === null || grant === null) return null
    records.push({
      ordinal: text(row['ordinal']),
      run: start.run,
      execution,
      operation: text(row['operation']),
      accepted,
      attempt: attempt.attempt,
      runStarted: start.started,
      attemptStarted: attempt.started,
      attachment: text(row['attachment']),
      grant,
    })
  }
  return records
}

/**
 * The input directory of every input of the closure. An input whose admissions cannot all be
 * proved is left out of both the index and the reads. A routed input outside the closure is listed
 * with its empty directory only when the session has no admission at all (`unadmitted`): an empty
 * directory is a claim that the input was never admitted, and that row absence proves it.
 */
function directoriesOf(
  scope: Scope,
  closure: Closure,
  sources: Readonly<{
    routed: ReadonlyMap<string, DurableEvidence>
    root: DurableEvidence
    unadmitted: boolean
  }>,
  relations: Readonly<{
    starts: ReadonlyMap<string, Start>
    attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>
  }>,
) {
  const inputs: InputAdmissionBoundary[] = []
  const admissions: InputAdmissionPage[] = []
  const listed = new Map<string, readonly Row[]>()
  if (sources.unadmitted) for (const input of sources.routed.keys()) listed.set(input, [])
  for (const [input, rows] of closure.admissions) listed.set(input, rows)
  for (const [input, rows] of listed) {
    const records = admissionsOf(rows, relations.starts, relations.attemptsByRun)
    if (records === null) continue
    const directory = `${scope.tenant}/${scope.session}/${input}`
    const version = String(records.length)
    inputs.push({
      input: input as InputId,
      directory,
      version,
      count: version,
      members: records.map(({ ordinal, run, execution, operation, accepted, attempt }) => ({
        ordinal,
        run,
        execution,
        operation,
        accepted,
        attempt,
      })),
      source: sources.routed.get(input) ?? sources.root,
    })
    if (records.length > 0)
      admissions.push({
        input: input as InputId,
        directory,
        version,
        offset: '0',
        next: null,
        records,
      })
  }
  return { inputs, admissions }
}

/**
 * The observed-only tail of one execution (R2-D28 candidate C): the longest run of facts after its
 * progress that is continuous, has a readable source and only `observed` kinds. Null when the first
 * unread fact is missing, empty, mixed or not observed; the pure layer decides whether it suffices.
 */
export function observedPrefix(
  boundary: Pick<ExecutionHistoryBoundary, 'run' | 'execution' | 'readThrough' | 'facts'>,
): SessionExecutionPrefix | null {
  const after = BigInt(boundary.readThrough)
  const facts: SessionExecutionPrefix['facts'][number][] = []
  let through = after
  for (const fact of boundary.facts) {
    const sequence = BigInt(fact.sequence)
    if (sequence <= after) continue
    if (
      sequence !== through + 1n ||
      fact.kinds.length === 0 ||
      fact.kinds.some(kind => kind !== 'observed') ||
      evidenceOf(fact.source) === null
    )
      break
    facts.push({
      sequence: fact.sequence,
      source: fact.source,
      consequences: fact.kinds.map(() => ({ kind: 'observed' as const })),
    })
    through = sequence
  }
  return facts.length === 0
    ? null
    : {
        execution: boundary.execution,
        run: boundary.run,
        after: boundary.readThrough,
        through: String(through),
        facts,
      }
}

/**
 * The history index and reads of one decision. `scope` is the input range of the decision and
 * `focus` what it names besides; `limit` bounds the rows of every statement together.
 */
export function readHistory(
  port: Executor,
  tenant: string,
  session: string,
  snapshot: WorkSnapshot,
  scope: SessionInputScope,
  limit: number = MAX_ROWS,
  focus: HistoryFocus = NO_FOCUS,
): SessionHistory | 'too-many' {
  const where: Scope = { tenant, session }
  const read = boundedReader(port, limit)
  try {
    const { routed, starts, attempts, attemptsByRun, controls } = sessionRows(read, port, where)
    const common = logRoot(port, tenant, session, snapshot.revision)
    const root: SessionLogRoot = {
      tenant: snapshot.tenant,
      session: snapshot.session,
      position: common.position,
      source: common.source,
    }
    const closure = closeOver({ read, scope: where, snapshot, starts, focus }, scope.inputs)
    const unadmitted =
      read(
        'SELECT input FROM er_admission_idx WHERE tenant = ? AND session = ? LIMIT ?',
        [tenant, session],
        1,
      ).length === 0
    const { inputs, admissions } = directoriesOf(
      where,
      closure,
      { routed, root: root.source, unadmitted },
      { starts, attemptsByRun },
    )
    const executions = [...closure.executions.values()].filter(
      (boundary): boundary is ExecutionHistoryBoundary => boundary !== null,
    )
    const prefixes = executions.flatMap(boundary => {
      const prefix = observedPrefix(boundary)
      return prefix === null ? [] : [prefix]
    })
    return {
      index: { root, inputs, executions, attempts, batches: closure.batches, taken: [] },
      reads: { root, scope, admissions, prefixes, attempts, taken: [], controls },
    }
  } catch (error) {
    if (error instanceof TooMany) return 'too-many'
    throw error
  }
}
