// The diagnostics read face of the Model records: `ModelDiagnostics.list` (model-contract, chapter
// "供应商尝试诊断") over the same `md_call` and `md_dispatch` rows the commands write. The worker half
// is the read handler `model.diagnostics`; the main-thread half checks the qualification, opens and
// signs the cursor, and projects each stored dispatch onto the whitelist `ModelAttemptDiagnostic`.
// The projection copies named fields only: the vendor text of a fault (`fault.diagnostic`) never
// leaves this file. Design: RFC-0013 "A 线", `ModelDiagnostics` 怎样实现; behavior: SPEC "诊断读面".
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeRevision,
  type Adoption,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type ModelAttemptDiagnostic,
  type ModelCallId,
  type ModelDiagnosticCursor,
  type ModelDiagnostics,
  type ModelDiagnosticsPage,
  type ModelFailure,
  type Termination,
} from '@omne-harness/model-contract'
import type { ModelCommandsAuthority } from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { ReadHandlerModule, ReadPort, SqlCell } from '@omne-harness/sql-contract/worker'
import { domainOf, unavailable } from './reads.ts'
import { PROTOCOL } from './schema.ts'

export const DIAGNOSTICS_HANDLER = 'model.diagnostics'
/** The largest `limit` of one `list`. A call seldom has more than a few dispatches. */
export const DIAGNOSTICS_PAGE_MAX = 100
/** `maxRowsRead` of `model.diagnostics`: the call row and one page plus one dispatch row. */
export const DIAGNOSTICS_READ_MAX_ROWS = DIAGNOSTICS_PAGE_MAX + 2
/** `maxOutputBytes` of `model.diagnostics`: 4 MiB, at most the provider's `maxReadResultBytes`. */
export const DIAGNOSTICS_READ_MAX_OUTPUT_BYTES = 4 * 1024 * 1024

/** The `action` of every `denied` this face answers. */
const DENIED_ACTION = 'diagnostics'
const EVIDENCE_OWNER = 'model-records'
const CURSOR_PREFIX = 'mdcur_'
const ID_PREFIX = 'mdiag_'
/** The base64url text of a SHA-256 HMAC: 32 bytes without padding. */
const MAC_LENGTH = 43

// --- Worker half ---------------------------------------------------------------------------

type Cell = string | number | null

/** A cell as JSON: INTEGER as a safe integer, TEXT as text. A blob or a large integer stops. */
function jsonCell(cell: SqlCell | undefined): Cell {
  if (cell === null || cell === undefined || typeof cell === 'string') return cell ?? null
  const value = typeof cell === 'bigint' ? Number(cell) : cell
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('a cell is not a safe integer or text')
  return value
}

function rows(port: ReadPort, sql: string, params: readonly (string | bigint)[]) {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, at) => [name, jsonCell(cells[at])])),
  )
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textInput(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value === '') throw new Error(`invalid input ${key}`)
  return value
}

function countInput(input: Readonly<Record<string, unknown>>, key: string, max: number): number {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error(`invalid input ${key}`)
  return value
}

const validLimit = (limit: number): boolean =>
  Number.isSafeInteger(limit) && limit >= 1 && limit <= DIAGNOSTICS_PAGE_MAX

/**
 * The call's row version and the dispatch rows after `after` (a `seq`, or null for the first
 * page) in `seq` order, one more than `limit` so the main thread knows whether a next page exists.
 * Only the key columns and the columns the projection reads travel: `tenant`, `call`, `seq`,
 * `dispatch`, `record`, `logical_terminal`.
 */
function readDiagnosticRows(input: JsonValue, port: ReadPort): JsonValue {
  if (!isObject(input)) throw new Error('invalid input')
  const tenant = textInput(input, 'tenant')
  const call = textInput(input, 'call')
  const after = input['after'] === null ? -1 : countInput(input, 'after', Number.MAX_SAFE_INTEGER)
  const limit = countInput(input, 'limit', DIAGNOSTICS_PAGE_MAX)
  if (limit < 1) throw new Error('invalid input limit')
  const head = rows(port, 'SELECT row_version FROM md_call WHERE tenant = ? AND call = ? LIMIT 1', [
    tenant,
    call,
  ])[0]
  if (head === undefined) return { call: null, dispatches: [] }
  const dispatches = rows(
    port,
    `SELECT tenant, call, seq, dispatch, record, logical_terminal FROM md_dispatch
      WHERE tenant = ? AND call = ? AND seq > ? ORDER BY seq LIMIT ?`,
    [tenant, call, BigInt(after), BigInt(limit + 1)],
  )
  return { call: head, dispatches }
}

/** `model.diagnostics`: the row version of one call and one page of its dispatch rows. */
export const diagnosticsHandler: ReadHandlerModule = {
  handler: DIAGNOSTICS_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    try {
      return { kind: 'read', output: readDiagnosticRows(input, port) }
    } catch (error) {
      return {
        kind: 'failed',
        diagnostic: error instanceof Error ? error.message : 'read failed',
      }
    }
  },
}

// --- Main-thread half: the stored attempts ------------------------------------------------

/** The fields of one stored dispatch that the projection reads. */
type StoredAttempt = Readonly<{
  seq: number
  dispatch: DispatchId
  adapter: Adoption
  send: DispatchRecord['send']
  firstContent: DispatchRecord['firstContent']
  /** The logical terminal when the commands recorded one, else the record's terminal. */
  terminal: Termination | null
}>

/** One read of a call: its row version (0 when the call does not exist) and the rows read. */
type AttemptsRead = Readonly<{ revision: number; attempts: readonly StoredAttempt[] }>

const NO_CALL: AttemptsRead = { revision: 0, attempts: [] }

class StoredError extends Error {
  constructor(field: string, reason: string) {
    super(`${field}: ${reason}`)
  }
}

function cell<T extends 'string' | 'number'>(
  row: Readonly<Record<string, unknown>>,
  name: string,
  kind: T,
): T extends 'string' ? string : number {
  const value = row[name]
  if (typeof value !== kind) throw new StoredError(`md_dispatch.${name}`, 'cell-kind')
  // `typeof` narrowed `value` to the primitive `kind` names; the conditional type says the same.
  return value as T extends 'string' ? string : number
}

/**
 * The value of a JSON column. Only the `model` participant writes these rows, from values that
 * documents.ts encoded, so the nested contract shape is trusted here as documents.ts trusts it.
 * The identity, the key columns and every field the projection copies are checked below.
 */
function stored<T>(text: string, field: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new StoredError(field, 'json')
  }
}

const SENDS = [
  'prepared',
  'started',
  'unknown',
  'not-sent',
] as const satisfies readonly DispatchRecord['send'][]
const FIRST_CONTENTS = [
  'none-proven',
  'observed',
  'uncertain',
] as const satisfies readonly DispatchRecord['firstContent'][]
const TERMINAL_KINDS = [
  'completed',
  'failed',
  'interrupted',
] as const satisfies readonly Termination['kind'][]

function oneOf<T extends string>(value: unknown, choices: readonly T[], field: string): T {
  const found = choices.find(choice => choice === value)
  if (found === undefined) throw new StoredError(field, 'value')
  return found
}

function adoptionOf(value: unknown, field: string): Adoption {
  if (!isObject(value)) throw new StoredError(field, 'payload')
  const text = (key: string): string => {
    const member = value[key]
    if (typeof member !== 'string') throw new StoredError(`${field}.${key}`, 'cell-kind')
    return member
  }
  return {
    owner: text('owner'),
    name: text('name'),
    revision: text('revision'),
    digest: text('digest'),
  }
}

function terminalOf(value: unknown, field: string): Termination | null {
  if (value === null) return null
  if (!isObject(value)) throw new StoredError(field, 'payload')
  // The fields the outcome copies are checked; the rest of the terminal stays as stored. A kind
  // outside the contract would reach the exhaustive default of outcomeOf, which copies it whole.
  const kind = oneOf(value['kind'], TERMINAL_KINDS, `${field}.kind`)
  if (kind === 'failed') {
    const fault = value['fault']
    if (!isObject(fault) || typeof fault['cause'] !== 'string')
      throw new StoredError(field, 'fault')
    if (fault['upstreamStatus'] !== null && typeof fault['upstreamStatus'] !== 'string')
      throw new StoredError(field, 'upstream-status')
  }
  return value as Termination
}

function attemptOf(
  raw: unknown,
  scope: Readonly<{ tenant: string; call: ModelCallId }>,
): StoredAttempt {
  if (!isObject(raw)) throw new StoredError('md_dispatch', 'not-a-row')
  if (cell(raw, 'tenant', 'string') !== scope.tenant || cell(raw, 'call', 'string') !== scope.call)
    throw new StoredError('md_dispatch.tenant', 'scope')
  const id = decodeDispatchId(cell(raw, 'dispatch', 'string'))
  if ('failure' in id) throw new StoredError('md_dispatch.dispatch', 'identity')
  const record = stored<DispatchRecord>(cell(raw, 'record', 'string'), 'md_dispatch.record')
  if (!isObject(record) || record.dispatch !== id.ok)
    throw new StoredError('md_dispatch.record', 'dispatch')
  if (!isObject(record.supplier)) throw new StoredError('md_dispatch.record', 'supplier')
  const logicalTerminal = raw['logical_terminal']
  return {
    seq: cell(raw, 'seq', 'number'),
    dispatch: id.ok,
    adapter: adoptionOf(record.supplier.adoption, 'md_dispatch.record.supplier.adoption'),
    send: oneOf(record.send, SENDS, 'md_dispatch.record.send'),
    firstContent: oneOf(record.firstContent, FIRST_CONTENTS, 'md_dispatch.record.firstContent'),
    terminal:
      logicalTerminal === null
        ? terminalOf(record.terminal, 'md_dispatch.record.terminal')
        : terminalOf(
            stored<unknown>(
              cell(raw, 'logical_terminal', 'string'),
              'md_dispatch.logical_terminal',
            ),
            'md_dispatch.logical_terminal',
          ),
  }
}

function parseAttempts(
  output: JsonValue,
  scope: Readonly<{ tenant: string; call: ModelCallId }>,
  after: number | null,
): AttemptsRead {
  if (!isObject(output) || !Array.isArray(output['dispatches']))
    throw new StoredError('read', 'shape')
  const head = output['call']
  if (head === null) {
    if (output['dispatches'].length > 0) throw new StoredError('read', 'orphan-rows')
    return NO_CALL
  }
  if (!isObject(head)) throw new StoredError('md_call', 'not-a-row')
  const revision = cell(head, 'row_version', 'number')
  if (revision < 1) throw new StoredError('md_call.row_version', 'value')
  const attempts = output['dispatches'].map(row => attemptOf(row, scope))
  attempts.forEach((item, at) => {
    const floor = at === 0 ? (after ?? -1) : (attempts[at - 1]?.seq ?? -1)
    if (item.seq <= floor) throw new StoredError('md_dispatch.seq', 'order')
  })
  return { revision, attempts }
}

async function readAttempts(
  storage: SqlStorage,
  domain: DomainRef,
  scope: Readonly<{ tenant: string; call: ModelCallId }>,
  after: number | null,
  limit: number,
): Promise<Outcome<AttemptsRead, ModelFailure>> {
  const result = await storage.read({
    domain,
    handler: DIAGNOSTICS_HANDLER,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input: { tenant: scope.tenant, call: scope.call, after, limit },
  })
  if (result.kind !== 'read')
    return fail(
      unavailable(
        `read ${DIAGNOSTICS_HANDLER}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`,
      ),
    )
  try {
    return succeed(parseAttempts(result.output, scope, after))
  } catch (error) {
    if (error instanceof StoredError) return fail(unavailable(`stored row ${error.message}`))
    throw error
  }
}

// --- Main-thread half: the projection -----------------------------------------------------

/** The tenant text, the call and the retention adoption that a cursor is bound to. */
type CursorScope = Readonly<{ tenant: string; call: ModelCallId; retention: Adoption }>
/** What a cursor carries: the row version it was taken at and the last `seq` of its page. */
type CursorBody = Readonly<{ revision: number; seq: number }>

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')

/** A minted identity this file produced; its text always has the shape the decoder checks. */
function minted<T>(result: Outcome<T, unknown>): T {
  if ('failure' in result) throw new Error('a minted identity does not decode')
  return result.ok
}

const diagnosticIdOf = (call: ModelCallId, dispatch: DispatchId) =>
  minted(decodeModelDiagnosticId(`${ID_PREFIX}${sha256(`${call}\n${dispatch}`)}`))

function snapshotOf(scope: CursorScope, revision: number): DurableEvidence {
  return {
    owner: EVIDENCE_OWNER,
    record: scope.call,
    revision: String(revision),
    digest: sha256(`${scope.tenant}\n${scope.call}\n${revision}`),
  }
}

function macOf(key: Uint8Array, scope: CursorScope, payload: string): string {
  return base64url(
    createHmac('sha256', key)
      .update(`${scope.tenant}\n${scope.call}\n${scope.retention.digest}\n${payload}`)
      .digest(),
  )
}

/** The cursor of the next page: the body, signed for this tenant, call and retention adoption. */
function signCursor(key: Uint8Array, scope: CursorScope, body: CursorBody): ModelDiagnosticCursor {
  const payload = base64url(Buffer.from(JSON.stringify([body.revision, body.seq])))
  return minted(
    decodeModelDiagnosticCursor(`${CURSOR_PREFIX}${payload}${macOf(key, scope, payload)}`),
  )
}

const invalidCursor = (reason: string): ModelFailure => ({
  kind: 'invalid',
  field: 'after',
  reason,
})

function cursorBody(payload: string): CursorBody | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null
  const [revision, seq] = parsed
  const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  return isCount(revision) && isCount(seq) ? { revision, seq } : null
}

/** The body of a cursor of this scope. Any other text, signed or not, is `invalid`. */
function openCursor(
  key: Uint8Array,
  scope: CursorScope,
  cursor: ModelDiagnosticCursor,
): Outcome<CursorBody, ModelFailure> {
  const text = cursor.startsWith(CURSOR_PREFIX) ? cursor.slice(CURSOR_PREFIX.length) : ''
  if (text.length <= MAC_LENGTH) return fail(invalidCursor('cursor'))
  const payload = text.slice(0, -MAC_LENGTH)
  const given = Buffer.from(text.slice(-MAC_LENGTH))
  const expected = Buffer.from(macOf(key, scope, payload))
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return fail(invalidCursor('cursor'))
  const body = cursorBody(payload)
  return body === null ? fail(invalidCursor('cursor')) : succeed(body)
}

const SEND_OF: Readonly<Record<DispatchRecord['send'], ModelAttemptDiagnostic['send']>> = {
  // A prepared dispatch is a local intent; it does not prove that anything was sent.
  prepared: 'not-sent',
  started: 'sent',
  unknown: 'unknown',
  'not-sent': 'not-sent',
}

/** The outcome of one attempt: only the named fields; the fault text stays in storage. */
function outcomeOf(terminal: Termination | null): ModelAttemptDiagnostic['outcome'] {
  if (terminal === null) return { kind: 'pending' }
  switch (terminal.kind) {
    case 'completed':
      return { kind: 'completed', reason: terminal.reason }
    case 'interrupted':
      return { kind: 'interrupted' }
    case 'failed':
      return {
        kind: 'failed',
        cause: terminal.fault.cause,
        upstreamStatus: terminal.fault.upstreamStatus,
      }
    default: {
      const exhaustive: never = terminal
      return exhaustive
    }
  }
}

const UNKNOWN_DURATION = { kind: 'unknown' } as const

function attemptDiagnostic(
  scope: CursorScope,
  revision: number,
  attempt: StoredAttempt,
): ModelAttemptDiagnostic {
  return {
    id: diagnosticIdOf(scope.call, attempt.dispatch),
    call: scope.call,
    dispatch: attempt.dispatch,
    revision: minted(decodeRevision(String(revision))),
    adapter: attempt.adapter,
    send: SEND_OF[attempt.send],
    firstContent: attempt.firstContent,
    outcome: outcomeOf(attempt.terminal),
    // The storage holds no phase times (RFC-0013 DA6). Unknown is the honest answer.
    timing: {
      materialize: UNKNOWN_DURATION,
      sendToFirstContent: UNKNOWN_DURATION,
      execution: UNKNOWN_DURATION,
    },
  }
}

// --- Main-thread half: the face --------------------------------------------------------------

/** The adopted qualification mappings. `tenant-self`: a principal that acts for the tenant may read. */
export type DiagnosticsReadMapping = 'tenant-self'

export type SqlModelDiagnosticsOptions<P> = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  /** The qualification port of the records; `tenant-self` asks it whether the principal acts for the tenant. */
  authority: Pick<ModelCommandsAuthority<P>, 'authorize'>
  diagnosticsRead: DiagnosticsReadMapping
  /** The retention adoption of the deployment. `null`: the whole read face is unavailable. */
  retention: Adoption | null
  /** The key that signs cursors. Default: 32 random bytes per instance, so a cursor lives one instance. */
  cursorKey?: Uint8Array
}>

/**
 * The qualification of one read under the adopted mapping. The mapping is a deployment's explicit
 * adoption, not an extension of the ordinary call read qualification: `tenant-self` asks the
 * records authority one tenant-level question and never names the call.
 */
function qualify<P>(
  options: SqlModelDiagnosticsOptions<P>,
  access: Access<P>,
): Outcome<null, ModelFailure> {
  switch (options.diagnosticsRead) {
    case 'tenant-self': {
      const result = options.authority.authorize({
        action: 'inspect',
        access: { principal: access.principal, tenant: access.tenant },
        resource: { kind: 'tenant' },
      })
      if ('ok' in result) return succeed(null)
      return result.failure.kind === 'denied'
        ? fail({ kind: 'denied', action: DENIED_ACTION })
        : result
    }
    default: {
      const exhaustive: never = options.diagnosticsRead
      return exhaustive
    }
  }
}

type ListInput<P> = Parameters<ModelDiagnostics<P>['list']>[0]

/** The scope of one admitted read and the opened cursor, if the input carried one. */
type AdmittedList = Readonly<{ scope: CursorScope; after: CursorBody | null }>

/** The checks before any row is read: tenant text, qualification, `limit`, then the cursor. */
function admitList<P>(
  options: SqlModelDiagnosticsOptions<P>,
  key: Uint8Array,
  retention: Adoption,
  input: ListInput<P>,
): Outcome<AdmittedList, ModelFailure> {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail({ kind: 'denied', action: DENIED_ACTION })
  const qualified = qualify(options, input)
  if ('failure' in qualified) return qualified
  if (!validLimit(input.limit))
    return fail({ kind: 'invalid', field: 'limit', reason: 'out-of-range' })
  const scope: CursorScope = { tenant: tenant.value, call: input.call, retention }
  if (input.after === null) return succeed({ scope, after: null })
  const after = openCursor(key, scope, input.after)
  return 'failure' in after ? after : succeed({ scope, after: after.ok })
}

/** The rows of the scope; a tenant without a domain reads as a call that does not exist. */
async function readScope<P>(
  options: SqlModelDiagnosticsOptions<P>,
  scope: CursorScope,
  after: number | null,
  limit: number,
): Promise<Outcome<AttemptsRead, ModelFailure>> {
  const domain = await domainOf(options.domains, scope.tenant)
  if ('failure' in domain) return domain
  if (domain.ok.kind === 'unregistered') return succeed(NO_CALL)
  return readAttempts(options.storage, domain.ok.domain, scope, after, limit)
}

function pageOf(
  key: Uint8Array,
  scope: CursorScope,
  read: AttemptsRead,
  limit: number,
): ModelDiagnosticsPage {
  const { revision, attempts } = read
  const page = attempts.slice(0, limit)
  const last = page[page.length - 1]
  return {
    entries: page.map(attempt => attemptDiagnostic(scope, revision, attempt)),
    next:
      attempts.length > limit && last !== undefined
        ? signCursor(key, scope, { revision, seq: last.seq })
        : null,
    snapshot: snapshotOf(scope, revision),
    retention: scope.retention,
    // No cleanup exists yet, so every page is complete through its snapshot (RFC-0013).
    coverage: 'complete-through-snapshot',
  }
}

async function listAttempts<P>(
  options: SqlModelDiagnosticsOptions<P>,
  key: Uint8Array,
  retention: Adoption,
  input: ListInput<P>,
): Promise<Outcome<ModelDiagnosticsPage, ModelFailure>> {
  const admitted = admitList(options, key, retention, input)
  if ('failure' in admitted) return admitted
  const { scope, after } = admitted.ok
  const read = await readScope(options, scope, after?.seq ?? null, input.limit)
  if ('failure' in read) return read
  if (after !== null && after.revision !== read.ok.revision)
    return fail(invalidCursor('snapshot-superseded'))
  return succeed(pageOf(key, scope, read.ok, input.limit))
}

/**
 * `ModelDiagnostics.list` over the SQL records. Order of checks: retention adopted, tenant text,
 * qualification, `limit`, cursor, then the read. A denied principal learns nothing about the call,
 * the cursor or the limit. A tenant without a domain and a call that does not exist both answer the
 * empty complete page.
 */
export function createSqlModelDiagnostics<P>(
  options: SqlModelDiagnosticsOptions<P>,
): ModelDiagnostics<P> {
  const key = options.cursorKey ?? randomBytes(32)
  return {
    list(input) {
      if (options.retention === null)
        return Promise.resolve(fail(unavailable('diagnostics retention not adopted')))
      return listAttempts(options, key, options.retention, input)
    },
  }
}
