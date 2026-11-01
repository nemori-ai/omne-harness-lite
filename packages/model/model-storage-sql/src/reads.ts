// The two read handlers of the Model records and the main-thread reads over them. The handler
// halves run in the provider's read Worker and carry the tenant condition in every statement;
// the main-thread halves resolve the tenant domain and parse the output once (documents.ts).
import { randomUUID } from 'node:crypto'
import {
  decodeModelCallId,
  type ModelCallId,
  type ModelFailure,
  type ModelOperationId,
  type ResultCapacity,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { ReadHandlerModule, ReadPort, SqlCell } from '@omne-harness/sql-contract/worker'
import { parseCallRead, type CallRead } from './documents.ts'
import { PROTOCOL, TABLES, type Table } from './schema.ts'

export const CALL_HANDLER = 'model.call'
export const PENDING_HANDLER = 'model.pending'
/** `maxOutputBytes` of `model.call`: 4 MiB, at most the provider's `maxReadResultBytes`. */
export const CALL_READ_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
/** `maxRowsRead` of `model.call`. Dispatch and part rows above it make the read unavailable. */
export const CALL_READ_MAX_ROWS = 20_000
export const PENDING_READ_MAX_ROWS = 1001
export const PENDING_PAGE_MAX = 1000

const DEPENDENCY = 'model-records'

/**
 * The share that the calls of one tenant hold: the capacity of every call whose request material
 * is held. The read of `model.call` reports it; the participant checks a new call against it.
 */
export const HELD_SHARE_SQL = `SELECT COALESCE(SUM(cap_bytes), 0) AS bytes,
    COALESCE(SUM(cap_blocks), 0) AS blocks, COALESCE(SUM(cap_attachment), 0) AS attachment
  FROM md_call WHERE tenant = ? AND request IS NOT NULL`

export const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: DEPENDENCY,
  diagnostic,
})

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
  const held = rows(port, HELD_SHARE_SQL, [tenant])[0]
  const capacity = {
    bytes: String(held?.['bytes'] ?? 0),
    blocks: String(held?.['blocks'] ?? 0),
    attachmentBytes: String(held?.['attachment'] ?? 0),
  }
  const operationRow = bound ?? null
  if (head === undefined)
    return { call: null, dispatches: [], parts: [], operation: operationRow, capacity }
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
  return { call: head, dispatches, parts, operation: operationRow, capacity }
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

const NO_CAPACITY: ResultCapacity = { bytes: '0', blocks: '0', attachmentBytes: '0' }

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
  if (domain.kind === 'unregistered')
    return succeed({ record: undefined, binding: null, capacity: NO_CAPACITY })
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
