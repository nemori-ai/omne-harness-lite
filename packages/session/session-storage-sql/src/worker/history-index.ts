import {
  executionReadThrough,
  uninterpretedCalls,
  type DurableEvidence,
  type ExecutionHistoryBoundary,
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
  type SessionLogConsequence,
  type SessionLogRoot,
  type SessionOperationId,
  type SessionUninterpretedCall,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SqlCell } from '@omne-harness/sql-contract/worker'
import { canonicalText, sha256 } from '../codec.ts'
import {
  boundedReader,
  evidenceOf,
  optionalText,
  plant,
  readable,
  rowEvidence,
  TooMany,
  type Planted,
  type Reader,
  type Scope,
} from './history-rows.ts'
import { logRoot } from './log-root.ts'
import { big, oneRow, packed, rowsOf, text, type Executor, type Row } from './support.ts'

const MAX_ROWS = 100_000
const PROGRESS_PAGE = 16

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

export type HistoryFocus = Readonly<{
  executions: readonly string[]
  event: Readonly<{ execution: string; sequence: string }> | null
}>

export const NO_FOCUS: HistoryFocus = { executions: [], event: null }

export type HistoryBasis = Readonly<{ scope: SessionInputScope; focus: HistoryFocus }>

type ExecutionReference = Readonly<{ execution: string; readThrough: string }>

export type WorkIndexInput = Readonly<{
  tenant: WorkSnapshot['tenant']
  session: WorkSnapshot['session']
  revision: WorkSnapshot['revision']
  pending: WorkSnapshot['pending']
  run:
    | Readonly<{ kind: 'active'; run: RunId; execution: ExecutionReference }>
    | Readonly<{ kind: Exclude<WorkSnapshot['run']['kind'], 'active'> }>
  executions?: readonly Readonly<{ run: RunId; execution: ExecutionReference }>[]
}>

export type SessionHistory = Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>

type Start = Readonly<{ run: RunId; started: DurableEvidence }>

export class BelowKept extends Error {}

export class LogGap extends Error {}

type AttemptRow = Readonly<{
  run: unknown
  attempt: unknown
  ordinal: string
  started: DurableEvidence
  grant?: DurableEvidence
}>

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

type SessionRowsView = Readonly<{
  routed: ReadonlyMap<string, DurableEvidence>
  starts: ReadonlyMap<string, Start>
  attempts: SessionAttemptRecord[]
  attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>
  controls: SessionControlOrigin[]
}>

const INDEX_CACHE_SESSIONS = 256
const INDEX_CACHE_ROWS = 262_144

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
        ...(row.grant === undefined ? {} : { grant: row.grant }),
      })
}

function addAttempt(index: SessionRowsIndex, record: SessionAttemptRecord): void {
  index.attempts.push(record)
  const list = index.attemptsByRun.get(record.run)
  if (list === undefined) index.attemptsByRun.set(record.run, [record])
  else list.push(record)
}

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
    ...(row.grant === undefined ? {} : { grant: Object.freeze(row.grant) }),
  })
}

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

function anchorAt(port: Executor, scope: Scope, position: bigint): string | null {
  const row = oneRow(
    port,
    'SELECT revision, kind, entry FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
    [scope.tenant, scope.session, position],
  )
  return row === undefined
    ? null
    : `${text(row['revision'])}/${text(row['kind'])}/${sha256(packed(row['entry']))}`
}

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

// Rows at or below the journal tail count as committed only because the session participant is grouping: 'singleton'; a groupable participant needs another cache design first.
// Rows past the tail belong to the open transaction: fold them into a copy and never keep them.
function sessionRows(
  read: Reader,
  port: Executor,
  scope: Scope,
  upto?: bigint,
  page?: number,
): SessionRowsView {
  if (upto !== undefined) return sessionRowsThrough(read, port, scope, upto)
  const { key, base, after } = loadBase(read, port, scope, undefined, page)
  if (after.added === 0n) {
    if (base === undefined) return viewOf(emptyIndex())
    keep(key, base)
    return viewOf(base)
  }
  const planted = after.rows.map(row => plant(row, after.grants))
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
  if (after.more) throw new TooMany()
  return viewOf(index)
}

function sessionRowsThrough(
  read: Reader,
  port: Executor,
  scope: Scope,
  upto: bigint,
): SessionRowsView {
  const { base, after } = loadBase(read, port, scope, upto)
  if (after.added === 0n) return viewOf(base ?? emptyIndex())
  const index = base === undefined ? emptyIndex() : cloneIndex(base)
  fold(
    index,
    scope,
    after.rows.map(row => plant(row, after.grants)),
  )
  return viewOf(index)
}

type Loaded = Readonly<{ key: string; base: SessionRowsIndex | undefined; after: RowsAfter }>

function loadBase(
  read: Reader,
  port: Executor,
  scope: Scope,
  upto?: bigint,
  page?: number,
): Loaded {
  const key = JSON.stringify([scope.tenant, scope.session])
  const base = provenBase(port, scope, key)
  if (upto !== undefined && base !== undefined && base.through > upto)
    throw new BelowKept(`the kept index is past position ${String(upto)}`)
  const from = base?.through ?? 0n
  read.charge(base?.count ?? 0)
  const after = rowsAfter(read, port, scope, from, upto, page)
  if (base !== undefined && after.last - from !== after.added) {
    if (upto === undefined) kept.delete(key)
    throw new LogGap(
      `the history index found a gap in the Session log after position ${String(from)}: ${String(after.added)} rows up to position ${String(after.last)}`,
    )
  }
  return { key, base, after }
}

function provenBase(port: Executor, scope: Scope, key: string): SessionRowsIndex | undefined {
  const base = kept.get(key)
  if (base === undefined || anchorAt(port, scope, base.through) === base.anchor) return base
  kept.delete(key)
  return undefined
}

type RowsAfter = Readonly<{
  rows: readonly Row[]
  grants: ReadonlyMap<string, DurableEvidence>
  added: bigint
  last: bigint
  top: bigint
  more: boolean
}>

type Paged = Readonly<{ rows: readonly Row[]; end: bigint | undefined }>

const INDEXED_AFTER = `FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind IN ${INDEXED_KINDS} AND position > ?`

function pagedRows(port: Executor, scope: Scope, from: bigint, page: number): Paged {
  const rows = rowsOf(
    port,
    `SELECT position, revision, entry ${INDEXED_AFTER} ORDER BY position LIMIT ?`,
    [scope.tenant, scope.session, from, BigInt(page + 1)],
  )
  if (rows.length <= page) return { rows, end: undefined }
  const kept = rows.slice(0, page)
  return { rows: kept, end: big(kept[page - 1]?.['position']) }
}

function grantsAfter(
  read: Reader,
  scope: Scope,
  from: bigint,
  upto?: bigint,
): ReadonlyMap<string, DurableEvidence> {
  const bounded = upto === undefined ? '' : ' AND position <= ?'
  const bounds = upto === undefined ? [from] : [from, upto]
  const rows = read(
    `SELECT position, grant FROM sl_attempt_grant
      WHERE tenant = ? AND session = ? AND position > ?${bounded}
      ORDER BY position LIMIT ?`,
    [scope.tenant, scope.session, ...bounds],
  )
  const grants = new Map<string, DurableEvidence>()
  for (const row of rows) {
    const grant = evidenceOf(readable(row['grant']))
    if (grant !== null) grants.set(text(row['position']), grant)
  }
  return grants
}

function rowsAfter(
  read: Reader,
  port: Executor,
  scope: Scope,
  from: bigint,
  upto?: bigint,
  page?: number,
): RowsAfter {
  const paged = page === undefined ? undefined : pagedRows(port, scope, from, page)
  const end = paged?.end ?? upto
  const bounded = end === undefined ? '' : ' AND position <= ?'
  const bounds = end === undefined ? [from] : [from, end]
  const rows =
    paged?.rows ??
    read(`SELECT position, revision, entry ${INDEXED_AFTER}${bounded} ORDER BY position LIMIT ?`, [
      scope.tenant,
      scope.session,
      ...bounds,
    ])
  const after = oneRow(
    port,
    `SELECT COUNT(*) AS n, MAX(position) AS last, MAX(revision) AS top FROM sl_entry
      WHERE tenant = ? AND session = ? AND position > ?${bounded} LIMIT 1`,
    [scope.tenant, scope.session, ...bounds],
  )
  const added = after === undefined ? 0n : big(after['n'])
  const grants = rows.length === 0 ? new Map() : grantsAfter(read, scope, from, end)
  const more = paged?.end !== undefined
  return added === 0n
    ? { rows, grants, added, last: from, top: 0n, more }
    : { rows, grants, added, last: big(after?.['last']), top: big(after?.['top']), more }
}

function journalTail(port: Executor, scope: Scope): bigint {
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  return journal === undefined ? 0n : big(journal['tail'])
}

function interpretedOf(
  read: Reader,
  scope: Scope,
  run: RunId,
  upto?: bigint,
): DurableEvidence | null {
  let before: bigint | null = upto === undefined ? null : upto + 1n
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

function projectionOf(row: Row): Readonly<Record<string, unknown>> | undefined {
  const value = readable(row['event'])
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
}

function factsOf(rows: readonly Row[]): SessionFactBoundary[] | null {
  const facts: SessionFactBoundary[] = []
  for (const row of rows) {
    const kinds = readable(row['kinds'])
    if (!Array.isArray(kinds) || !kinds.every(isConsequenceKind)) return null
    const source = projectionOf(row)?.['source']
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
  snapshot: WorkIndexInput
  starts: ReadonlyMap<string, Start>
  focus: HistoryFocus
  upto?: bigint
}>

function focusedSequence(context: Context, execution: string): bigint {
  const event = context.focus.event
  return event !== null && event.execution === execution ? BigInt(event.sequence) : -1n
}

function boundaryOf(
  context: Context,
  execution: string,
): Readonly<{
  boundary: ExecutionHistoryBoundary
  batches: SessionBatchRecord[]
  calls: SessionUninterpretedCall[]
}> | null {
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
  const readThrough = executionReadThrough(snapshot as WorkSnapshot, start.run, execution) ?? '0'
  const events = read(
    `SELECT eseq AS sequence, event, kinds FROM er_fact
      WHERE tenant = ? AND execution = ? AND session = ? AND (eseq > ? OR eseq = ?)
      ORDER BY eseq LIMIT ?`,
    [
      scope.tenant,
      execution,
      scope.session,
      BigInt(readThrough),
      focusedSequence(context, execution),
    ],
  ).map(row => ({ ...row, event: packed(row['event']) }))
  const facts = factsOf(events)
  if (facts === null) return null
  const interpreted =
    readThrough === '0' ? null : interpretedOf(read, scope, start.run, context.upto)
  if (readThrough !== '0' && interpreted === null) return null
  return {
    boundary: {
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
    },
    batches: batchesOf(events, start.run, execution),
    calls: callsOf(events, execution, readThrough),
  }
}

function callsOf(
  rows: readonly Row[],
  execution: string,
  readThrough: string,
): SessionUninterpretedCall[] {
  const after = BigInt(readThrough)
  return uninterpretedCalls(
    execution,
    rows.flatMap(row => {
      const sequence = text(row['sequence'])
      const consequences = projectionOf(row)?.['consequences']
      return BigInt(sequence) > after && Array.isArray(consequences)
        ? [{ sequence, consequences: consequences as SessionLogConsequence[] }]
        : []
    }),
  )
}

function batchesOf(events: readonly Row[], run: RunId, execution: string): SessionBatchRecord[] {
  return events.flatMap(row => {
    const event = projectionOf(row)
    const source = event?.['source']
    const batch = event?.['batch'] as SessionBatchRecord['batch'] | undefined
    return source === undefined || !Array.isArray(batch?.ordered)
      ? []
      : [
          {
            run,
            execution,
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
  calls: SessionUninterpretedCall[]
}

function admittedBy(context: Context, inputs: readonly string[]): Closure {
  const { read, scope, snapshot } = context
  const admissions = new Map<string, Row[]>()
  const active = snapshot.run.kind === 'active' ? snapshot.run.execution.execution : null
  for (const input of inputs) {
    const where = [scope.tenant, scope.session, input]
    const rows =
      active === null
        ? []
        : read(
            `SELECT ordinal, execution, operation, accepted, grant_ref, attachment FROM er_admission_idx
              WHERE tenant = ? AND session = ? AND input = ? AND execution = ? ORDER BY ordinal LIMIT ?`,
            [...where, active],
          )
    admissions.set(
      input,
      rows.map(row => {
        const [named] = read(
          `SELECT attempt FROM er_admission_attempt_idx
            WHERE tenant = ? AND session = ? AND input = ? AND ordinal = ? LIMIT ?`,
          [...where, big(row['ordinal'])],
        )
        return { ...row, attempt: named === undefined ? null : text(named['attempt']) }
      }),
    )
  }
  return { admissions, executions: new Map(), batches: [], calls: [] }
}

function closeOver(context: Context, inputs: readonly string[]): Closure {
  const { read, scope } = context
  const closure: Closure = { admissions: new Map(), executions: new Map(), batches: [], calls: [] }
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
    const found = boundaryOf(context, execution)
    closure.executions.set(execution, found?.boundary ?? null)
    if (found === null) continue
    const { batches } = found
    closure.batches.push(...batches)
    closure.calls.push(...found.calls)
    for (const batch of batches) pendingInputs.push(...batch.batch.ordered)
  }
  return closure
}

function attemptOf(
  attemptsByRun: ReadonlyMap<unknown, readonly SessionAttemptRecord[]>,
  run: RunId,
  grant: DurableEvidence | null,
  recorded: string | null,
): SessionAttemptRecord | null {
  const ofRun = attemptsByRun.get(run) ?? []
  if (recorded !== null) return ofRun.find(item => item.attempt === recorded) ?? null
  const named = grant === null ? undefined : ofRun.find(item => grantNames(item, grant))
  return named ?? (ofRun.length === 1 ? (ofRun[0] ?? null) : null)
}

export function grantNames(attempt: SessionAttemptRecord, grant: DurableEvidence): boolean {
  const text = canonicalText(grant)
  return (
    (attempt.grant !== undefined && canonicalText(attempt.grant) === text) ||
    canonicalText(attempt.started) === text
  )
}

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

export type HistoryReadOptions = Readonly<{
  limit?: number
  focus?: HistoryFocus
  upto?: bigint
  page?: number
}>

export function readHistory(
  port: Executor,
  tenant: string,
  session: string,
  snapshot: WorkIndexInput,
  scope: SessionInputScope,
  options: HistoryReadOptions = {},
): SessionHistory | 'too-many' {
  const { limit = MAX_ROWS, focus = NO_FOCUS, upto, page } = options
  const where: Scope = { tenant, session }
  const read = boundedReader(port, page === undefined ? limit : Number.MAX_SAFE_INTEGER)
  try {
    const { routed, starts, attempts, attemptsByRun, controls } = sessionRows(
      read,
      port,
      where,
      upto,
      page,
    )
    const common = logRoot(port, tenant, session, snapshot.revision, upto)
    const root: SessionLogRoot = {
      tenant: snapshot.tenant,
      session: snapshot.session,
      position: common.position,
      source: common.source,
    }
    const closure =
      page === undefined
        ? closeOver(
            {
              read,
              scope: where,
              snapshot,
              starts,
              focus,
              ...(upto === undefined ? {} : { upto }),
            },
            scope.inputs,
          )
        : admittedBy({ read, scope: where, snapshot, starts, focus }, scope.inputs)
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
      reads: {
        root,
        scope,
        admissions,
        prefixes,
        attempts,
        taken: [],
        controls,
        uninterpreted: closure.calls,
      },
    }
  } catch (error) {
    if (error instanceof TooMany) return 'too-many'
    throw error
  }
}

const WORK_INDEX_PAGE = 500

export function workIndexOf(
  port: Executor,
  tenant: string,
  session: string,
  snapshot: WorkIndexInput,
  page = WORK_INDEX_PAGE,
): SessionHistory | 'too-many' {
  const scope: SessionInputScope = { kind: 'pending', inputs: snapshot.pending }
  return readHistory(port, tenant, session, snapshot, scope, { page })
}
