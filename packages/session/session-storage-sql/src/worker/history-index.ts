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
  type SessionLogConsequence,
  type SessionLogRoot,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, plainOf, sha256 } from '../codec.ts'
import { logRoot } from './log-root.ts'
import { rowsOf, text, type Executor, type Row } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_ROWS = 100_000
/** The page of the backward scan for the latest interpretation row of one Run. */
const PROGRESS_PAGE = 16

/** The consequence kinds a fact boundary may carry. A row with another kind is not a boundary. */
const CONSEQUENCE_KINDS: Readonly<Record<SessionLogConsequence['kind'], true>> = {
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
}
const isConsequenceKind = (kind: unknown): kind is SessionLogConsequence['kind'] =>
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
 * statement ends with `LIMIT ?`, and the reader binds that last parameter.
 */
type Reader = (sql: string, params: readonly SqlValue[], page?: number) => Row[]

function boundedReader(port: Executor, limit: number): Reader {
  let left = limit
  return (sql, params, page) => {
    const cap = page === undefined || page > left ? left + 1 : page
    const rows = rowsOf(port, sql, [...params, BigInt(cap)])
    if (rows.length > left) throw new TooMany()
    left -= rows.length
    return rows
  }
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

/** The Session rows of the index: the routed inputs, the SE13 of each execution and the SE15 rows. */
function sessionRows(read: Reader, scope: Scope) {
  const rows = read(
    `SELECT position, revision, entry FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind IN ('intake.routed', 'run.started', 'run.attempt-started')
      ORDER BY position LIMIT ?`,
    [scope.tenant, scope.session],
  ).map(plant)
  const of = (kind: string): Planted[] => rows.filter(row => row.entry.kind === kind)
  const routed = new Map<string, DurableEvidence>()
  for (const row of of('intake.routed'))
    routed.set(String(row.data['input']), rowEvidence(scope, row))
  const starts = new Map<string, Start>()
  const runs = new Map<string, string>()
  for (const row of of('run.started')) {
    starts.set(String(row.data['execution']), {
      run: row.data['run'] as RunId,
      started: rowEvidence(scope, row),
    })
    runs.set(String(row.data['run']), String(row.data['execution']))
  }
  const attempts: SessionAttemptRecord[] = of('run.attempt-started').flatMap(row => {
    const execution = runs.get(String(row.data['run']))
    return execution === undefined
      ? []
      : [
          {
            run: row.data['run'] as never,
            attempt: row.data['attempt'] as never,
            execution,
            ordinal: String(row.data['ordinal']),
            started: rowEvidence(scope, row),
          },
        ]
  })
  return { routed, starts, attempts }
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
      closure.admissions.set(input, rows)
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
 * The attempt of one admission: the SE15 whose receipt is the grant, else the only SE15 of the Run.
 * Attempts are never removed, so a Run with one SE15 had that one when the admission was granted.
 */
function attemptOf(
  attempts: readonly SessionAttemptRecord[],
  run: RunId,
  grant: DurableEvidence | null,
): SessionAttemptRecord | null {
  const ofRun = attempts.filter(item => item.run === run)
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
  attempts: readonly SessionAttemptRecord[],
): SessionInputAdmission[] | null {
  const records: SessionInputAdmission[] = []
  for (const row of rows) {
    const execution = text(row['execution'])
    const start = starts.get(execution)
    if (start === undefined) return null
    const accepted = evidenceOf(readable(row['accepted']))
    const grant = evidenceOf(readable(row['grant_ref']))
    const attempt = attemptOf(attempts, start.run, grant)
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
    attempts: readonly SessionAttemptRecord[]
  }>,
) {
  const inputs: InputAdmissionBoundary[] = []
  const admissions: InputAdmissionPage[] = []
  const listed = new Map<string, readonly Row[]>()
  if (sources.unadmitted) for (const input of sources.routed.keys()) listed.set(input, [])
  for (const [input, rows] of closure.admissions) listed.set(input, rows)
  for (const [input, rows] of listed) {
    const records = admissionsOf(rows, relations.starts, relations.attempts)
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
    const { routed, starts, attempts } = sessionRows(read, where)
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
      { starts, attempts },
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
      reads: { root, scope, admissions, prefixes, attempts, taken: [] },
    }
  } catch (error) {
    if (error instanceof TooMany) return 'too-many'
    throw error
  }
}
