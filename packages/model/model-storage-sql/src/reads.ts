// The read handlers of the Model records and the main-thread reads over them. The handler
// halves run in the provider's read Worker and carry the tenant condition in every statement;
// the main-thread halves resolve the tenant domain and parse the output once (documents.ts).
import { randomUUID } from 'node:crypto'
import {
  decodeModelCallId,
  type FixedModelRequest,
  type ModelCallId,
  type ModelFailure,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import {
  unpackText,
  type ReadHandlerModule,
  type ReadPort,
  type SqlCell,
} from '@omne-harness/sql-contract/worker'
import { parseCallRead, type CallRead } from './documents.ts'
import { PROTOCOL, TABLES, type Table } from './schema.ts'

export const CALL_HANDLER = 'model.call'
export const PENDING_HANDLER = 'model.pending'
export const REQUEST_HANDLER = 'model.request'
/** `maxOutputBytes` of `model.request`: one chunk of a request body and its position. */
export const REQUEST_READ_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
/** `maxRowsRead` of `model.request`: the call row and one chunk row. */
export const REQUEST_READ_MAX_ROWS = 2
/** `maxOutputBytes` of `model.call`: 4 MiB, at most the provider's `maxReadResultBytes`. */
export const CALL_READ_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
/** `maxRowsRead` of `model.call`. Dispatch and part rows above it make the read unavailable. */
export const CALL_READ_MAX_ROWS = 20_000
export const PENDING_READ_MAX_ROWS = 1001
export const PENDING_PAGE_MAX = 1000

const DEPENDENCY = 'model-records'

/**
 * How many calls of one tenant hold a result that is not released: the calls whose request
 * material is held. The read of `model.call` reports it; the participant checks a new call
 * against it.
 */
export const HELD_CALLS_SQL = `SELECT COUNT(*) AS held
  FROM md_call WHERE tenant = ? AND request IS NOT NULL`

export const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: DEPENDENCY,
  diagnostic,
})

// --- Worker half ---------------------------------------------------------------------------

type Cell = string | number | null

/**
 * A cell as JSON: INTEGER as a safe integer, TEXT as text, a BLOB (a `json` column) as its packed
 * text. A large integer stops.
 */
function jsonCell(cell: SqlCell | undefined): Cell {
  if (cell === null || cell === undefined || typeof cell === 'string') return cell ?? null
  if (cell instanceof Uint8Array) return unpackText(cell)
  const value = typeof cell === 'bigint' ? Number(cell) : cell
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('a cell is not a safe integer or text')
  return value
}

const columnList = (table: Table): string => table.columns.map(item => item.name).join(', ')

function rows(port: ReadPort, sql: string, params: readonly (string | bigint)[]) {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, at) => [name, jsonCell(cells[at])])),
  )
}

function textInput(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value === '') throw new Error(`invalid input ${key}`)
  return value
}

function isObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(input: JsonValue): Readonly<Record<string, unknown>> {
  if (!isObject(input)) throw new Error('invalid input')
  return input
}

function readCallRows(input: JsonValue, port: ReadPort): JsonValue {
  const scope = record(input)
  const tenant = textInput(scope, 'tenant')
  const call = textInput(scope, 'call')
  const operation = scope['operation'] === null ? null : textInput(scope, 'operation')
  const head = rows(
    port,
    `SELECT ${columnList(TABLES.call)} FROM md_call WHERE tenant = ? AND call = ? LIMIT 1`,
    [tenant, call],
  )[0]
  const bound =
    operation === null
      ? undefined
      : rows(
          port,
          `SELECT ${columnList(TABLES.operation)} FROM md_operation
            WHERE tenant = ? AND operation = ? LIMIT 1`,
          [tenant, operation],
        )[0]
  // The read port demands a LIMIT on every statement; the aggregate gives one row.
  const held = rows(port, `${HELD_CALLS_SQL} LIMIT 1`, [tenant])[0]?.['held'] ?? 0
  const operationRow = bound ?? null
  if (head === undefined)
    return { call: null, dispatches: [], parts: [], operation: operationRow, held }
  // Three rows are read above; the rest of the budget is for dispatches and parts together.
  const budget = CALL_READ_MAX_ROWS - 3
  const dispatches = rows(
    port,
    `SELECT ${columnList(TABLES.dispatch)} FROM md_dispatch
      WHERE tenant = ? AND call = ? ORDER BY seq LIMIT ?`,
    [tenant, call, BigInt(budget + 1)],
  )
  const parts = rows(
    port,
    `SELECT ${columnList(TABLES.part)} FROM md_part
      WHERE tenant = ? AND call = ? ORDER BY seq, block, part LIMIT ?`,
    [tenant, call, BigInt(budget - dispatches.length + 1)],
  )
  if (dispatches.length + parts.length > budget) throw new Error('the call exceeds the row bound')
  return { call: head, dispatches, parts, operation: operationRow, held }
}

function readPendingRows(input: JsonValue, port: ReadPort): JsonValue {
  const scope = record(input)
  const tenant = textInput(scope, 'tenant')
  const after = scope['after'] === null ? null : textInput(scope, 'after')
  const limit = scope['limit']
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > PENDING_PAGE_MAX
  )
    throw new Error('invalid input limit')
  const found = rows(
    port,
    `SELECT call FROM md_call
      WHERE tenant = ? AND pending = 1 ${after === null ? '' : 'AND call > ?'}
      ORDER BY call LIMIT ?`,
    [tenant, ...(after === null ? [] : [after]), BigInt(limit + 1)],
  )
  return {
    calls: found.slice(0, limit).map(row => String(row['call'])),
    more: found.length > limit,
  }
}

/**
 * One chunk of the body of the call that holds its material. `seq` names the chunk. The answer is
 * null when no call holds material under this identity, or when the chunk is not there.
 */
function readRequestChunk(input: JsonValue, port: ReadPort): JsonValue {
  const scope = record(input)
  const tenant = textInput(scope, 'tenant')
  const call = textInput(scope, 'call')
  const seq = scope['seq']
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0)
    throw new Error('invalid input seq')
  const held = rows(
    port,
    'SELECT request_digest FROM md_call WHERE tenant = ? AND call = ? AND request IS NOT NULL LIMIT 1',
    [tenant, call],
  )[0]
  if (held === undefined) return { chunk: null }
  const chunk = rows(
    port,
    `SELECT total, body FROM md_request
      WHERE tenant = ? AND call = ? AND digest = ? AND seq = ? LIMIT 1`,
    [tenant, call, String(held['request_digest']), BigInt(seq)],
  )[0]
  return {
    chunk:
      chunk === undefined ? null : { total: chunk['total'] ?? null, body: chunk['body'] ?? null },
  }
}

function handler(
  name: string,
  read: (input: JsonValue, port: ReadPort) => JsonValue,
): ReadHandlerModule {
  return {
    handler: name,
    protocol: PROTOCOL,
    read(input, port) {
      try {
        return { kind: 'read', output: read(input, port) }
      } catch (error) {
        return {
          kind: 'failed',
          diagnostic: error instanceof Error ? error.message : 'read failed',
        }
      }
    },
  }
}

/** `model.call`: the call row, its dispatches and parts, the operation row and the tenant share used. */
export const callHandler: ReadHandlerModule = handler(CALL_HANDLER, readCallRows)
/** `model.request`: one chunk of the request body of a call that holds its material. */
export const requestHandler: ReadHandlerModule = handler(REQUEST_HANDLER, readRequestChunk)
/** `model.pending`: one page of the calls of a tenant that carry a pending mark, by call. */
export const pendingHandler: ReadHandlerModule = handler(PENDING_HANDLER, readPendingRows)

// --- Main-thread half ----------------------------------------------------------------------

export type DomainOf =
  | Readonly<{ kind: 'ready'; domain: DomainRef }>
  | Readonly<{ kind: 'unregistered' }>

/** The domain of one tenant text. A directory answer for another tenant is refused, never used. */
export async function domainOf(
  domains: TenantDomainLookup,
  tenant: string,
): Promise<Outcome<DomainOf, ModelFailure>> {
  const found = await domains.lookup({ tenant })
  if (found.kind === 'unavailable') return fail(unavailable(`tenant domain: ${found.diagnostic}`))
  if (found.kind === 'unregistered') return succeed({ kind: 'unregistered' })
  const scope = found.domain.scope
  if (scope.kind !== 'tenant' || scope.tenant !== tenant)
    return fail(unavailable('the tenant domain lookup answered another scope'))
  return succeed({ kind: 'ready', domain: found.domain })
}

async function readHandler(
  storage: SqlStorage,
  domain: DomainRef,
  name: string,
  input: Readonly<Record<string, JsonValue>>,
): Promise<Outcome<JsonValue, ModelFailure>> {
  const result = await storage.read({
    domain,
    handler: name,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input,
  })
  if (result.kind === 'read') return succeed(result.output)
  return fail(
    unavailable(`read ${name}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`),
  )
}

export type CallReadInput = Readonly<{
  tenant: string
  call: ModelCallId
  operation: ModelOperationId | null
}>

/**
 * One `snapshot` read of a call. A tenant without a domain holds no call: the answer is the same
 * as for a call that does not exist, so it tells nothing about another tenant. A row that does
 * not parse makes the read unavailable.
 */
export async function readCall(
  storage: SqlStorage,
  domain: DomainOf,
  input: CallReadInput,
): Promise<Outcome<CallRead, ModelFailure>> {
  if (domain.kind === 'unregistered') return succeed({ record: undefined, binding: null, held: 0 })
  const output = await readHandler(storage, domain.domain, CALL_HANDLER, {
    tenant: input.tenant,
    call: input.call,
    operation: input.operation,
  })
  if ('failure' in output) return output
  const parsed = parseCallRead(output.ok, input)
  return 'failure' in parsed
    ? fail(unavailable(`stored row ${parsed.failure.field}: ${parsed.failure.reason}`))
    : parsed
}

export type PendingPage = Readonly<{ calls: readonly ModelCallId[]; next: ModelCallId | null }>

/** One page of the pending calls of a tenant, after the call `after`, in call order. */
export async function readPending(
  storage: SqlStorage,
  domain: DomainOf,
  input: Readonly<{ tenant: string; after: ModelCallId | null; limit: number }>,
): Promise<Outcome<PendingPage, ModelFailure>> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > PENDING_PAGE_MAX)
    return fail({ kind: 'invalid', field: 'limit', reason: 'out-of-range' })
  if (domain.kind === 'unregistered') return succeed({ calls: [], next: null })
  const output = await readHandler(storage, domain.domain, PENDING_HANDLER, {
    tenant: input.tenant,
    after: input.after,
    limit: input.limit,
  })
  if ('failure' in output) return output
  const value = output.ok
  if (!isObject(value)) return fail(unavailable('stored row pending: shape'))
  const { calls, more } = value
  if (!Array.isArray(calls) || typeof more !== 'boolean')
    return fail(unavailable('stored row pending: shape'))
  const ids: ModelCallId[] = []
  for (const text of calls) {
    const id = decodeModelCallId(text)
    if ('failure' in id) return fail(unavailable('stored row pending: call'))
    ids.push(id.ok)
  }
  return succeed({ calls: ids, next: more ? (ids[ids.length - 1] ?? null) : null })
}

/**
 * The whole request body of a call, read chunk by chunk and put together. Null when the call
 * holds no material. A body that is not whole, or that does not parse, makes the read unavailable:
 * the participant admits a call only with its whole body, so this is a damaged store.
 */
export async function readRequestBody(
  storage: SqlStorage,
  domain: DomainOf,
  input: Readonly<{ tenant: string; call: ModelCallId }>,
): Promise<Outcome<FixedModelRequest | null, ModelFailure>> {
  if (domain.kind === 'unregistered') return succeed(null)
  const pieces: string[] = []
  for (let seq = 0, total = 1; seq < total; seq += 1) {
    const output = await readHandler(storage, domain.domain, REQUEST_HANDLER, { ...input, seq })
    if ('failure' in output) return output
    const chunk = isObject(output.ok) ? output.ok['chunk'] : undefined
    if (chunk === null && seq === 0) return succeed(null)
    if (chunk === undefined || chunk === null || !isObject(chunk))
      return fail(unavailable('the request body is not whole'))
    const { total: count, body } = chunk
    if (typeof count !== 'number' || count <= seq || typeof body !== 'string')
      return fail(unavailable('a request body chunk does not have the stored shape'))
    total = count
    pieces.push(body)
  }
  try {
    return succeed(JSON.parse(pieces.join('')) as FixedModelRequest)
  } catch {
    return fail(unavailable('the request body does not parse'))
  }
}
