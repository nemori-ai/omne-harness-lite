// The stored Model call document, its rows and the parse from rows to the document. Rows enter
// here only: the read output of `model.call` is parsed once into typed values, and the encoders
// give the rows that the participant writes. The column sets come from `TABLES` in schema.ts.
import {
  tenantCodec,
  tenantEquals,
  workspaceCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
  type CallState,
  type DispatchId,
  type DispatchRecord,
  type DurableEvidence,
  type FixedModelRequest,
  type GrowingContentKind,
  type ModelBlock,
  type ModelCallId,
  type ModelOperationId,
  type OutputCursor,
  type ResultCapacity,
  type ResultTrim,
  type Revision,
  type RetryDecision,
  type RetryPosition,
  type Termination,
} from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  ModelConsumerOwnerDeclaration,
  ProviderDiagnostic,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import { TABLES, type Table } from './schema.ts'

// --- The document --------------------------------------------------------------------------

/** The tenant a storage transaction is bound to. */
export type TenantRef = TenantId

export type ResultPaging = Readonly<{ resultPageParts: number; resultPageTargetBytes: number }>
/** The call has work for recovery since `at`, caused by `operation`. */
export type PendingMark = Readonly<{ operation: ModelOperationId; at: string }>
/** The head of the latest confirmed snapshot. Its blocks are the parts of the call. */
export type SnapshotHead = Readonly<{
  dispatch: DispatchId
  cursor: OutputCursor
  state: CallState
}>

/** One `md_call` row. The request material is released when `request` is null. */
export type StoredCall = Readonly<{
  call: ModelCallId
  admission: ModelOperationId
  owner: ModelConsumerOwnerDeclaration
  initiator: ActorRef
  request: FixedModelRequest | null
  requestDigest: string
  capacity: ResultCapacity
  state: CallState
  execution: ExecutionRef | null
  retry: RetryDecision | null
  retryPosition: RetryPosition | null
  retrySource: DurableEvidence | null
  cursor: OutputCursor
  snapshot: SnapshotHead | null
  paging: ResultPaging
  cleanupFailure: string | null
  pending: PendingMark | null
}>

export type WindowState = 'open' | 'closed' | 'unproven'

/** One `md_dispatch` row. `seq` is the order of the dispatch in its call, from 0. */
export type StoredDispatch = Readonly<{
  seq: number
  record: DispatchRecord
  logicalTerminal: Termination | null
  windows: readonly (readonly [string, WindowState])[]
  events: readonly (readonly [string, string])[]
  nextSeq: readonly (readonly [string, string])[]
  trims: readonly (readonly [string, readonly ResultTrim[]])[]
  hadContent: readonly string[]
  diagnostics: readonly ProviderDiagnostic[]
}>

/** The key of one block part: the dispatch `seq`, the block `index` and the `part` number. */
export type PartKey = Readonly<{ seq: number; index: string; part: number }>

/** What one part holds. A block is `open`, then `append` or `replace` pieces, then `seal`. */
export type PartBody =
  | Readonly<{ kind: 'open'; mode: 'append' | 'replace'; content: GrowingContentKind }>
  | Readonly<{ kind: 'append'; delta: string }>
  | Readonly<{ kind: 'replace'; value: string }>
  | Readonly<{ kind: 'seal'; block: ModelBlock }>

/** One `md_part` row: a piece of one block body, folded in key order. */
export type StoredPart = PartKey & PartBody

/** One `md_operation` row: the operation is bound to `call` by a committed write of `method`. */
export type StoredBinding = Readonly<{
  operation: ModelOperationId
  call: ModelCallId
  method: string
  fingerprint: string
  revision: Revision
  receipt: JsonValue
}>

/**
 * The call document as one storage transaction sees it. `version` is the CAS token
 * (`md_call.row_version`). `binding` is the row of the operation that the transaction reads,
 * when that operation is bound to this call.
 */
export type StoredModelDocument = Readonly<{
  version: number
  call: StoredCall
  dispatches: readonly StoredDispatch[]
  parts: readonly StoredPart[]
  binding: StoredBinding | null
}>

export type ConflictReason = 'version' | 'operation-bound' | 'call-exists'

export type ModelStorageFailure =
  /** The stored document moved, the operation is bound elsewhere, or the call already exists. */
  | Readonly<{ kind: 'conflict'; reason: ConflictReason }>
  /** The tenant share does not hold the call. Not retried. */
  | Readonly<{ kind: 'capacity' }>
  /** The transaction is bound to another tenant, call or operation than the one asked for. */
  | Readonly<{ kind: 'out-of-scope'; field: 'tenant' | 'call' | 'operation' }>
  /** A row or a document that does not have the stored shape. */
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  /** The commit was sent and its outcome is not known. */
  | Readonly<{ kind: 'commit-unknown'; operation: ModelOperationId }>

/**
 * The storage face of one transaction, with synchronous semantics. The commit loop of this member
 * gives the asynchronous boundary: it reads, runs the work on this face, then commits with CAS.
 */
export interface ModelStorageTransaction {
  read(
    tenant: TenantRef,
    operation: ModelOperationId,
  ): Outcome<StoredModelDocument | undefined, ModelStorageFailure>
  /**
   * Writes `next.call` and `next.dispatches` when the stored version is `expected` (null: the call
   * does not exist yet), and binds `operation` with `next.binding`. `next.version` and `next.parts`
   * are not written: the version is assigned, and parts change only through `appendPart`.
   */
  write(
    tenant: TenantRef,
    operation: ModelOperationId,
    expected: number | null,
    next: StoredModelDocument,
  ): Outcome<number, ModelStorageFailure>
  capacity(tenant: TenantRef): Outcome<ResultCapacity, ModelStorageFailure>
  pending(
    tenant: TenantRef,
    operation: ModelOperationId,
    at: string,
  ): Outcome<void, ModelStorageFailure>
  appendPart(
    tenant: TenantRef,
    operation: ModelOperationId,
    part: StoredPart,
  ): Outcome<void, ModelStorageFailure>
}

// --- Values inside JSON columns ------------------------------------------------------------

const TENANT = '$tenant'
const WORKSPACE = '$workspace'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

class RowError extends Error {
  readonly field: string
  readonly reason: string

  constructor(field: string, reason: string) {
    super(`${field}: ${reason}`)
    this.field = field
    this.reason = reason
  }
}

/** Strict JSON of a stored value. A minted tenant or workspace travels as marked text. */
function encodeValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RowError('value', 'non-finite-number')
    return value
  }
  if (Array.isArray(value)) return value.map(item => encodeValue(item))
  if (!isRecord(value)) throw new RowError('value', `not-json-${typeof value}`)
  if (value['name'] === 'TenantId') {
    const text = tenantCodec.encode(value as never)
    if (!text.ok) throw new RowError('value', 'tenant-not-minted')
    return { [TENANT]: text.value }
  }
  if (value['name'] === 'WorkspaceId') {
    const text = workspaceCodec.encode(value as never)
    if (!text.ok) throw new RowError('value', 'workspace-not-minted')
    return { [WORKSPACE]: text.value }
  }
  const out: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value)) {
    if (key === TENANT || key === WORKSPACE) throw new RowError('value', 'reserved-member')
    if (member !== undefined) out[key] = encodeValue(member)
  }
  return out
}

function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => decodeValue(item))
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === TENANT) {
    const parsed = tenantCodec.parse(String(value[TENANT]))
    if (!parsed.ok) throw new RowError('value', 'tenant-text')
    return parsed.value
  }
  if (keys.length === 1 && keys[0] === WORKSPACE) {
    const parsed = workspaceCodec.parse(String(value[WORKSPACE]))
    if (!parsed.ok) throw new RowError('value', 'workspace-text')
    return parsed.value
  }
  const out: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) out[key] = decodeValue(member)
  return out
}

/**
 * The value of a JSON column. Only the `model` participant writes these tables (they are its
 * owned tables), from values this file encoded, so the nested contract shape is not checked again
 * here. The identity and key columns around it are checked; see `parseCallRead`.
 */
function stored<T>(text: string, field: string): T {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new RowError(field, 'json')
  }
  return decodeValue(raw) as T
}

const jsonText = (value: unknown): string => JSON.stringify(encodeValue(value))

// --- Rows ----------------------------------------------------------------------------------

/** One row as it crosses the SQL boundary: TEXT cells as strings, INTEGER cells as safe integers. */
export type Row = Readonly<Record<string, string | number | null>>
type Cells = Readonly<Record<string, string | number | null>>

/** The cells of a row: exactly the columns of `table`, each of its declared kind. */
function cellsOf(table: Table, raw: unknown): Cells {
  if (!isRecord(raw)) throw new RowError(table.name, 'not-a-row')
  for (const key of Object.keys(raw))
    if (!table.columns.some(item => item.name === key))
      throw new RowError(`${table.name}.${key}`, 'extra-column')
  for (const item of table.columns) {
    const field = `${table.name}.${item.name}`
    if (!Object.hasOwn(raw, item.name)) throw new RowError(field, 'missing-column')
    const cell = raw[item.name]
    if (cell === null) {
      if (!item.nullable) throw new RowError(field, 'null')
      continue
    }
    if (item.kind === 'int' ? !Number.isSafeInteger(cell) : typeof cell !== 'string')
      throw new RowError(field, 'cell-kind')
  }
  return raw as Cells
}

const str = (cells: Cells, name: string): string => cells[name] as string
const int = (cells: Cells, name: string): number => cells[name] as number
const optional = <T>(cells: Cells, name: string, read: (text: string) => T): T | null => {
  const cell = cells[name]
  return cell === null || cell === undefined ? null : read(cell as string)
}

function identity<T>(result: Outcome<T, unknown>, field: string): T {
  if ('failure' in result) throw new RowError(field, 'identity')
  return result.ok
}

const DECIMAL = /^(0|[1-9][0-9]*)$/

function decimal(value: string, field: string): number {
  const parsed = Number(value)
  if (!DECIMAL.test(value) || !Number.isSafeInteger(parsed)) throw new RowError(field, 'decimal')
  return parsed
}

export type CallRowScope = Readonly<{ tenant: string; call: ModelCallId }>

function parseCallRow(raw: unknown, scope: CallRowScope): { version: number; call: StoredCall } {
  const cells = cellsOf(TABLES.call, raw)
  if (str(cells, 'tenant') !== scope.tenant) throw new RowError('md_call.tenant', 'scope')
  const call = identity(decodeModelCallId(str(cells, 'call')), 'md_call.call')
  if (call !== scope.call) throw new RowError('md_call.call', 'scope')
  const state = stored<CallState>(str(cells, 'state'), 'md_call.state')
  if (state.call !== call) throw new RowError('md_call.state', 'call')
  const execution = optional(cells, 'execution', text =>
    stored<ExecutionRef>(text, 'md_call.execution'),
  )
  if (execution !== null) {
    const owner = tenantCodec.encode(execution.tenant)
    if (execution.call !== call || !owner.ok || owner.value !== scope.tenant)
      throw new RowError('md_call.execution', 'scope')
  }
  const snapshot = optional(cells, 'snapshot', text =>
    stored<SnapshotHead>(text, 'md_call.snapshot'),
  )
  if (snapshot !== null && snapshot.state.call !== call)
    throw new RowError('md_call.snapshot', 'call')
  const pendingOperation = optional(cells, 'pending_operation', text =>
    identity(decodeModelOperationId(text), 'md_call.pending_operation'),
  )
  const pendingAt = optional(cells, 'pending_at', text => text)
  if ((pendingOperation === null) !== (pendingAt === null))
    throw new RowError('md_call.pending_at', 'pair')
  return {
    version: int(cells, 'row_version'),
    call: {
      call,
      admission: identity(decodeModelOperationId(str(cells, 'admission')), 'md_call.admission'),
      owner: stored(str(cells, 'owner'), 'md_call.owner'),
      initiator: stored(str(cells, 'initiator'), 'md_call.initiator'),
      request: optional(cells, 'request', text =>
        stored<FixedModelRequest>(text, 'md_call.request'),
      ),
      requestDigest: str(cells, 'request_digest'),
      capacity: {
        bytes: String(int(cells, 'cap_bytes')),
        blocks: String(int(cells, 'cap_blocks')),
        attachmentBytes: String(int(cells, 'cap_attachment')),
      },
      state,
      execution,
      retry: optional(cells, 'retry', text => stored<RetryDecision>(text, 'md_call.retry')),
      retryPosition: optional(cells, 'retry_position', text =>
        stored<RetryPosition>(text, 'md_call.retry_position'),
      ),
      retrySource: optional(cells, 'retry_source', text =>
        stored<DurableEvidence>(text, 'md_call.retry_source'),
      ),
      cursor: identity(decodeOutputCursor(str(cells, 'cursor')), 'md_call.cursor'),
      snapshot,
      paging: stored(str(cells, 'paging'), 'md_call.paging'),
      cleanupFailure: optional(cells, 'cleanup_failure', text => text),
      pending:
        pendingOperation === null || pendingAt === null
          ? null
          : { operation: pendingOperation, at: pendingAt },
    },
  }
}

function parseDispatchRow(raw: unknown, scope: CallRowScope): StoredDispatch {
  const cells = cellsOf(TABLES.dispatch, raw)
  if (str(cells, 'tenant') !== scope.tenant || str(cells, 'call') !== scope.call)
    throw new RowError('md_dispatch.tenant', 'scope')
  const dispatch = identity(decodeDispatchId(str(cells, 'dispatch')), 'md_dispatch.dispatch')
  const record = stored<DispatchRecord>(str(cells, 'record'), 'md_dispatch.record')
  if (record.dispatch !== dispatch) throw new RowError('md_dispatch.record', 'dispatch')
  return {
    seq: int(cells, 'seq'),
    record,
    logicalTerminal: optional(cells, 'logical_terminal', text =>
      stored<Termination>(text, 'md_dispatch.logical_terminal'),
    ),
    windows: stored(str(cells, 'windows'), 'md_dispatch.windows'),
    events: stored(str(cells, 'events'), 'md_dispatch.events'),
    nextSeq: stored(str(cells, 'next_seq'), 'md_dispatch.next_seq'),
    trims: stored(str(cells, 'trims'), 'md_dispatch.trims'),
    hadContent: stored(str(cells, 'had_content'), 'md_dispatch.had_content'),
    diagnostics: stored(str(cells, 'diagnostics'), 'md_dispatch.diagnostics'),
  }
}

const GROWING = [
  'text',
  'thinking',
  'tool-arguments',
  'voice',
] as const satisfies readonly GrowingContentKind[]
const isGrowing = (value: unknown): value is GrowingContentKind =>
  GROWING.some(kind => kind === value)

function exactKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new RowError(field, 'payload')
  const own = Object.keys(value)
  if (own.length !== keys.length || !keys.every(key => Object.hasOwn(value, key)))
    throw new RowError(field, 'payload')
  return value
}

function partBody(kind: string, payload: unknown): PartBody {
  const field = 'md_part.payload'
  switch (kind) {
    case 'open': {
      const value = exactKeys(payload, ['mode', 'content'], field)
      const { mode, content } = value
      if ((mode !== 'append' && mode !== 'replace') || !isGrowing(content))
        throw new RowError(field, 'open')
      return { kind, mode, content }
    }
    case 'append': {
      const value = exactKeys(payload, ['delta'], field)
      if (typeof value['delta'] !== 'string') throw new RowError(field, 'append')
      return { kind, delta: value['delta'] }
    }
    case 'replace': {
      const value = exactKeys(payload, ['value'], field)
      if (typeof value['value'] !== 'string') throw new RowError(field, 'replace')
      return { kind, value: value['value'] }
    }
    case 'seal': {
      const value = exactKeys(payload, ['block'], field)
      if (!isRecord(value['block'])) throw new RowError(field, 'seal')
      return { kind, block: value['block'] as ModelBlock }
    }
    default:
      throw new RowError('md_part.kind', 'kind')
  }
}

function parsePartRow(raw: unknown, scope: CallRowScope): StoredPart {
  const cells = cellsOf(TABLES.part, raw)
  if (str(cells, 'tenant') !== scope.tenant || str(cells, 'call') !== scope.call)
    throw new RowError('md_part.tenant', 'scope')
  const body = partBody(str(cells, 'kind'), stored(str(cells, 'payload'), 'md_part.payload'))
  return {
    seq: int(cells, 'seq'),
    index: String(int(cells, 'block')),
    part: int(cells, 'part'),
    ...body,
  }
}

function parseOperationRow(
  raw: unknown,
  tenant: string,
  operation: ModelOperationId,
): StoredBinding {
  const cells = cellsOf(TABLES.operation, raw)
  if (str(cells, 'tenant') !== tenant) throw new RowError('md_operation.tenant', 'scope')
  const bound = identity(decodeModelOperationId(str(cells, 'operation')), 'md_operation.operation')
  if (bound !== operation) throw new RowError('md_operation.operation', 'scope')
  return {
    operation: bound,
    call: identity(decodeModelCallId(str(cells, 'call')), 'md_operation.call'),
    method: str(cells, 'method'),
    fingerprint: str(cells, 'fingerprint'),
    revision: identity(decodeRevision(str(cells, 'revision')), 'md_operation.revision'),
    receipt: stored<JsonValue>(str(cells, 'receipt'), 'md_operation.receipt'),
  }
}

function parseCapacity(raw: unknown): ResultCapacity {
  const value = exactKeys(raw, ['bytes', 'blocks', 'attachmentBytes'], 'capacity')
  const cell = (key: string): string => {
    const text = value[key]
    if (typeof text !== 'string' || !DECIMAL.test(text))
      throw new RowError(`capacity.${key}`, 'decimal')
    return text
  }
  return { bytes: cell('bytes'), blocks: cell('blocks'), attachmentBytes: cell('attachmentBytes') }
}

const compareKey = (left: PartKey, right: PartKey): number =>
  left.seq - right.seq || Number(left.index) - Number(right.index) || left.part - right.part

/** What one `model.call` read gives: the document, if the call exists, and the tenant share used. */
export type CallRead = Readonly<{
  document: StoredModelDocument | undefined
  /** The binding of the read operation, also when it names another call. */
  binding: StoredBinding | null
  /** The capacity of every call of the tenant whose request material is held. */
  capacity: ResultCapacity
}>

function parseRead(
  output: unknown,
  scope: CallRowScope & { operation: ModelOperationId },
): CallRead {
  const value = exactKeys(output, ['call', 'dispatches', 'parts', 'operation', 'capacity'], 'read')
  const { dispatches, parts } = value
  if (!Array.isArray(dispatches) || !Array.isArray(parts)) throw new RowError('read', 'rows')
  const binding =
    value['operation'] === null
      ? null
      : parseOperationRow(value['operation'], scope.tenant, scope.operation)
  const capacity = parseCapacity(value['capacity'])
  if (value['call'] === null) {
    if (dispatches.length > 0 || parts.length > 0) throw new RowError('read', 'orphan-rows')
    return { document: undefined, binding, capacity }
  }
  const head = parseCallRow(value['call'], scope)
  const parsedDispatches = dispatches.map(row => parseDispatchRow(row, scope))
  parsedDispatches.forEach((item, at) => {
    if (item.seq !== at) throw new RowError('md_dispatch.seq', 'order')
  })
  const parsedParts = parts.map(row => parsePartRow(row, scope))
  parsedParts.forEach((item, at) => {
    const previous = parsedParts[at - 1]
    if (previous !== undefined && compareKey(previous, item) >= 0)
      throw new RowError('md_part.part', 'order')
    if (item.seq >= parsedDispatches.length) throw new RowError('md_part.seq', 'dispatch')
  })
  return {
    document: {
      version: head.version,
      call: head.call,
      dispatches: parsedDispatches,
      parts: parsedParts,
      binding: binding !== null && binding.call === scope.call ? binding : null,
    },
    binding,
    capacity,
  }
}

const invalid = (field: string, reason: string): ModelStorageFailure => ({
  kind: 'invalid',
  field,
  reason,
})

function guarded<T>(work: () => T): Outcome<T, ModelStorageFailure> {
  try {
    return succeed(work())
  } catch (error) {
    if (error instanceof RowError) return fail(invalid(error.field, error.reason))
    throw error
  }
}

/** Parses the output of one `model.call` read, for exactly the tenant, call and operation asked. */
export function parseCallRead(
  output: JsonValue,
  scope: CallRowScope & { operation: ModelOperationId },
): Outcome<CallRead, ModelStorageFailure> {
  return guarded(() => parseRead(output, scope))
}

// --- Encoders: the rows the participant writes ---------------------------------------------

/** The cells of one row of `table`: exactly its columns, each of its kind. */
export function parseRow(table: Table, raw: unknown): Outcome<Row, ModelStorageFailure> {
  return guarded(() => cellsOf(table, raw))
}

/** The CAS token after a write: 1 for a new call, one more than the expected version otherwise. */
export const nextVersion = (expected: number | null): number =>
  expected === null ? 1 : expected + 1

/** The tenant text of a minted tenant; the column value of every row of that tenant. */
export function tenantText(tenant: TenantRef): Outcome<string, ModelStorageFailure> {
  const text = tenantCodec.encode(tenant)
  return text.ok ? succeed(text.value) : fail(invalid('tenant', 'not-minted'))
}

export function sameTenant(left: TenantRef, right: TenantRef): boolean {
  return tenantEquals(left, right)
}

function capacityCell(value: string, field: string): number {
  return decimal(value, `md_call.${field}`)
}

export function encodeCallRow(
  tenant: string,
  version: number,
  call: StoredCall,
): Outcome<Row, ModelStorageFailure> {
  return guarded(() => ({
    tenant,
    call: call.call,
    row_version: version,
    admission: call.admission,
    owner: jsonText(call.owner),
    initiator: jsonText(call.initiator),
    request: call.request === null ? null : jsonText(call.request),
    request_digest: call.requestDigest,
    cap_bytes: capacityCell(call.capacity.bytes, 'cap_bytes'),
    cap_blocks: capacityCell(call.capacity.blocks, 'cap_blocks'),
    cap_attachment: capacityCell(call.capacity.attachmentBytes, 'cap_attachment'),
    state: jsonText(call.state),
    execution: call.execution === null ? null : jsonText(call.execution),
    retry: call.retry === null ? null : jsonText(call.retry),
    retry_position: call.retryPosition === null ? null : jsonText(call.retryPosition),
    retry_source: call.retrySource === null ? null : jsonText(call.retrySource),
    cursor: call.cursor,
    snapshot: call.snapshot === null ? null : jsonText(call.snapshot),
    paging: jsonText(call.paging),
    cleanup_failure: call.cleanupFailure,
    pending_operation: call.pending === null ? null : call.pending.operation,
    pending_at: call.pending === null ? null : call.pending.at,
  }))
}

export function encodeDispatchRow(
  tenant: string,
  call: ModelCallId,
  dispatch: StoredDispatch,
): Outcome<Row, ModelStorageFailure> {
  return guarded(() => ({
    tenant,
    call,
    seq: dispatch.seq,
    dispatch: dispatch.record.dispatch,
    record: jsonText(dispatch.record),
    logical_terminal: dispatch.logicalTerminal === null ? null : jsonText(dispatch.logicalTerminal),
    windows: jsonText(dispatch.windows),
    events: jsonText(dispatch.events),
    next_seq: jsonText(dispatch.nextSeq),
    trims: jsonText(dispatch.trims),
    had_content: jsonText(dispatch.hadContent),
    diagnostics: jsonText(dispatch.diagnostics),
  }))
}

function partPayload(part: StoredPart): unknown {
  switch (part.kind) {
    case 'open':
      return { mode: part.mode, content: part.content }
    case 'append':
      return { delta: part.delta }
    case 'replace':
      return { value: part.value }
    case 'seal':
      return { block: part.block }
    default: {
      const exhaustive: never = part
      return exhaustive
    }
  }
}

export function encodePartRow(
  tenant: string,
  call: ModelCallId,
  part: StoredPart,
): Outcome<Row, ModelStorageFailure> {
  return guarded(() => ({
    tenant,
    call,
    seq: part.seq,
    block: decimal(part.index, 'md_part.block'),
    part: part.part,
    kind: part.kind,
    payload: jsonText(partPayload(part)),
  }))
}

export function encodeOperationRow(
  tenant: string,
  binding: StoredBinding,
): Outcome<Row, ModelStorageFailure> {
  return guarded(() => ({
    tenant,
    operation: binding.operation,
    call: binding.call,
    method: binding.method,
    fingerprint: binding.fingerprint,
    revision: binding.revision,
    receipt: jsonText(binding.receipt),
  }))
}
