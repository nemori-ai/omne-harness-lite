// The call document of the shared commands core, its rows, and the parse between them. Rows enter
// here only: the output of `model.call` is parsed once into documents, and the encoders give the
// rows that the participant writes. The column sets come from `TABLES` in schema.ts.
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
  type Admission,
  type CallState,
  type DispatchRecord,
  type DurableEvidence,
  type FixedModelRequest,
  type GrowingContentKind,
  type ModelBlock,
  type ModelCallId,
  type ModelFailure,
  type ModelOperationId,
  type OutputCursor,
  type ReadId,
  type ReadState,
  type ResultCapacity,
  type ResultTrim,
  type Revision,
  type RetryDecision,
  type RetryPosition,
  type Settlement,
  type Snapshot,
  type Termination,
  type VisibleBlock,
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

// --- The storage port of the shared commands core ------------------------------------------
// Integration point: these types mirror `packages/model/model/src/commands/{storage,types}.ts`
// (C-CORE, 8ac28f135), which is the authority. They are replaced by imports from
// `@omne-harness/model/commands` when that entry exists. `run` already takes the optional scope
// that C-CORE-2 adds. `DispatchDocument.assembly` is `null` here: the core never sets it to
// anything else, and the storage does not keep a live assembly.

export const MODEL_WRITE_METHODS = [
  'admit',
  'claim',
  'prepareDispatch',
  'recordMaterialization',
  'recordSend',
  'openReceiveWindow',
  'preserve',
  'recordLateFact',
  'prepareRetry',
  'decideRetry',
  'settle',
  'control',
  'acquireRead',
  'handoff',
  'advanceCleanup',
] as const
export type ModelWriteMethod = (typeof MODEL_WRITE_METHODS)[number]
export type Receipt =
  | Readonly<{ kind: 'revision'; revision: Revision }>
  | Readonly<{ kind: 'admit'; admission: Admission }>
  | Readonly<{ kind: 'claim'; instance: string; generation: string }>
  | Readonly<{ kind: 'materialization'; revision: Revision; source: DurableEvidence }>
  | Readonly<{ kind: 'retry'; position: RetryPosition }>
  | Readonly<{ kind: 'settle'; settlement: Settlement }>
  | Readonly<{ kind: 'preserve'; cursor: OutputCursor }>
  | Readonly<{ kind: 'late'; revision: Revision }>
  | Readonly<{ kind: 'read'; read: ReadId | null }>
  | Readonly<{ kind: 'control' | 'handoff' | 'cleanup' }>
export type BindingBase = Readonly<{
  call: ModelCallId
  method: ModelWriteMethod
  fingerprint: string
  revision: Revision
  receipt: Receipt
}>
export type Binding = BindingBase &
  (
    | Readonly<{ status: 'committed' }>
    | Readonly<{ status: 'unknown'; effect: 'applied' | 'not-applied' }>
    | Readonly<{ status: 'rolled-back' | 'not-committed' }>
  )
export type ReadRelation = {
  id: ReadId
  lastProgress: string
  furthest: number
  state: Extract<ReadState, { kind: 'ended' }> | { kind: 'reading'; offset: number }
}
export type ResultPaging = Readonly<{ resultPageParts: number; resultPageTargetBytes: number }>
export type DispatchDocument = {
  record: DispatchRecord
  logicalTerminal: Termination | null
  windows: Map<string, 'open' | 'closed' | 'unproven'>
  events: Map<string, string>
  assembly: null
  blocks: readonly VisibleBlock[]
  nextSeq: Map<string, string>
  trims: Map<string, readonly ResultTrim[]>
  hadContent: Set<string>
  diagnostics: readonly ProviderDiagnostic[]
}
export type CallDocument = {
  state: CallState
  request: FixedModelRequest | null
  requestDigest: string
  capacity: ResultCapacity
  initiator: ActorRef
  admission: ModelOperationId
  owner: ModelConsumerOwnerDeclaration
  execution: ExecutionRef | null
  dispatches: DispatchDocument[]
  retry: RetryDecision | null
  retryPosition: RetryPosition | null
  retrySource: DurableEvidence | null
  cursor: OutputCursor
  snapshots: Map<OutputCursor, Snapshot>
  reads: Map<ReadId, ReadRelation>
  cleanupFailure: string | null
  resultPaging: ResultPaging
}
export type TenantDocuments = Readonly<{
  calls: ReadonlyMap<ModelCallId, CallDocument>
  operations: ReadonlyMap<ModelOperationId, Binding>
}>
export type CommandWrite = Readonly<{
  operation: ModelOperationId
  expected: CallDocument | undefined
  call: CallDocument | undefined
  binding: BindingBase
}>
/** What one run reads before its work: the call, and the operation the work writes, if any. */
export type ModelRunScope = Readonly<{
  /** The canonical tenant text (`tenantCodec`), as in the other methods. */
  tenant: string
  call: ModelCallId
  operation?: ModelOperationId
}>
export interface ModelCommandStorage {
  run<T>(
    work: () => Outcome<T, ModelFailure>,
    scope?: ModelRunScope,
  ): Promise<Outcome<T, ModelFailure>>
  documents(tenant: string): TenantDocuments
  reserved(field: keyof ResultCapacity): bigint
  commit(tenant: string, write: CommandWrite): 'committed' | 'unknown'
  publish(tenant: string, call: CallDocument): void
}

// --- Stored shapes -------------------------------------------------------------------------

/**
 * What one part holds. A block is `open` then `append` or `replace` pieces, or one `seal`. `open`
 * and `seal` carry the block index; `position` in the row key is the place of the block.
 */
export type PartBody =
  | Readonly<{
      kind: 'open'
      index: string
      mode: 'append' | 'replace'
      content: GrowingContentKind
    }>
  | Readonly<{ kind: 'append'; delta: string }>
  | Readonly<{ kind: 'replace'; value: string }>
  | Readonly<{ kind: 'seal'; index: string; block: ModelBlock }>
/** The key of one `md_part` row: dispatch `seq`, block `position` (column `block`), piece `part`. */
export type PartKey = Readonly<{ seq: number; position: number; part: number }>
export type StoredPart = PartKey & PartBody

/** The latest confirmed snapshot. Its blocks are a dispatch's blocks, or kept inline. */
export type SnapshotHead = Readonly<{
  cursor: OutputCursor
  state: CallState
  blocks:
    | Readonly<{ kind: 'dispatch'; seq: number }>
    | Readonly<{ kind: 'inline'; blocks: readonly VisibleBlock[] }>
}>

/** One call as one read sees it: the CAS token, the document and the parts it was folded from. */
export type CallRecord = Readonly<{
  version: number
  pending: boolean
  document: CallDocument
  parts: readonly StoredPart[]
}>

/** The committed binding of one operation, with the operation it binds. */
export type StoredBinding = BindingBase & Readonly<{ operation: ModelOperationId }>

/** What one `model.call` read gives. */
export type CallRead = Readonly<{
  record: CallRecord | undefined
  /** The committed binding of the operation read, also when it names another call. */
  binding: StoredBinding | null
  /** The capacity of every call of the tenant whose request material is held. */
  capacity: ResultCapacity
}>

/** A row or an output that does not have the stored shape. */
export type RowFailure = Readonly<{ field: string; reason: string }>

// --- Values inside JSON columns ------------------------------------------------------------

const TENANT = '$tenant'
const WORKSPACE = '$workspace'
const DECIMAL = /^(0|[1-9][0-9]*)$/

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
  if (value instanceof Map || value instanceof Set) throw new RowError('value', 'collection')
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
 * here. The identity and key columns around it are checked.
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

/** The cells of a row: exactly the columns of `table`, each of its declared kind. */
function cellsOf(table: Table, raw: unknown): Row {
  if (!isRecord(raw)) throw new RowError(table.name, 'not-a-row')
  for (const key of Object.keys(raw))
    if (!table.columns.some(item => item.name === key))
      throw new RowError(`${table.name}.${key}`, 'extra-column')
  const row: Record<string, string | number | null> = {}
  for (const item of table.columns) {
    const field = `${table.name}.${item.name}`
    if (!Object.hasOwn(raw, item.name)) throw new RowError(field, 'missing-column')
    const cell = raw[item.name]
    if (cell === null) {
      if (!item.nullable) throw new RowError(field, 'null')
      row[item.name] = null
    } else if (item.kind === 'int' && typeof cell === 'number' && Number.isSafeInteger(cell))
      row[item.name] = cell
    else if (item.kind !== 'int' && typeof cell === 'string') row[item.name] = cell
    else throw new RowError(field, 'cell-kind')
  }
  return row
}

function str(row: Row, name: string): string {
  const cell = row[name]
  if (typeof cell !== 'string') throw new RowError(name, 'cell-kind')
  return cell
}
function int(row: Row, name: string): number {
  const cell = row[name]
  if (typeof cell !== 'number') throw new RowError(name, 'cell-kind')
  return cell
}
function optional<T>(row: Row, name: string, read: (text: string) => T): T | null {
  const cell = row[name]
  return cell === null || cell === undefined ? null : read(str(row, name))
}

function identity<T>(result: Outcome<T, unknown>, field: string): T {
  if ('failure' in result) throw new RowError(field, 'identity')
  return result.ok
}

function decimal(value: string, field: string): number {
  const parsed = Number(value)
  if (!DECIMAL.test(value) || !Number.isSafeInteger(parsed)) throw new RowError(field, 'decimal')
  return parsed
}

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

export type CallRowScope = Readonly<{ tenant: string; call: ModelCallId }>

type CallHead = Readonly<{
  version: number
  pending: boolean
  head: SnapshotHead | null
  document: Omit<CallDocument, 'dispatches' | 'snapshots'>
}>

function parseCallRow(raw: unknown, scope: CallRowScope): CallHead {
  const row = cellsOf(TABLES.call, raw)
  if (str(row, 'tenant') !== scope.tenant) throw new RowError('md_call.tenant', 'scope')
  const call = identity(decodeModelCallId(str(row, 'call')), 'md_call.call')
  if (call !== scope.call) throw new RowError('md_call.call', 'scope')
  const state = stored<CallState>(str(row, 'state'), 'md_call.state')
  if (state.call !== call) throw new RowError('md_call.state', 'call')
  const execution = optional(row, 'execution', text =>
    stored<ExecutionRef>(text, 'md_call.execution'),
  )
  if (execution !== null) {
    const owner = tenantCodec.encode(execution.tenant)
    if (execution.call !== call || !owner.ok || owner.value !== scope.tenant)
      throw new RowError('md_call.execution', 'scope')
  }
  const pending = int(row, 'pending')
  if (pending !== 0 && pending !== 1) throw new RowError('md_call.pending', 'flag')
  const reads = stored<ReadRelation[]>(str(row, 'reads'), 'md_call.reads')
  if (!Array.isArray(reads)) throw new RowError('md_call.reads', 'array')
  return {
    version: int(row, 'row_version'),
    pending: pending === 1,
    head: optional(row, 'snapshot', text => stored<SnapshotHead>(text, 'md_call.snapshot')),
    document: {
      state,
      request: optional(row, 'request', text => stored<FixedModelRequest>(text, 'md_call.request')),
      requestDigest: str(row, 'request_digest'),
      capacity: {
        bytes: String(int(row, 'cap_bytes')),
        blocks: String(int(row, 'cap_blocks')),
        attachmentBytes: String(int(row, 'cap_attachment')),
      },
      initiator: stored(str(row, 'initiator'), 'md_call.initiator'),
      admission: identity(decodeModelOperationId(str(row, 'admission')), 'md_call.admission'),
      owner: stored(str(row, 'owner'), 'md_call.owner'),
      execution,
      retry: optional(row, 'retry', text => stored<RetryDecision>(text, 'md_call.retry')),
      retryPosition: optional(row, 'retry_position', text =>
        stored<RetryPosition>(text, 'md_call.retry_position'),
      ),
      retrySource: optional(row, 'retry_source', text =>
        stored<DurableEvidence>(text, 'md_call.retry_source'),
      ),
      cursor: identity(decodeOutputCursor(str(row, 'cursor')), 'md_call.cursor'),
      reads: new Map(reads.map(relation => [relation.id, relation])),
      cleanupFailure: optional(row, 'cleanup_failure', text => text),
      resultPaging: stored(str(row, 'paging'), 'md_call.paging'),
    },
  }
}

function entries<V>(text: string, field: string): Map<string, V> {
  const value = stored<unknown>(text, field)
  if (!Array.isArray(value)) throw new RowError(field, 'entries')
  return new Map(
    value.map((item: unknown): [string, V] => {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string')
        throw new RowError(field, 'entries')
      return [item[0], item[1] as V]
    }),
  )
}

function parseDispatchRow(
  raw: unknown,
  scope: CallRowScope,
): Readonly<{ seq: number; dispatch: Omit<DispatchDocument, 'blocks'> }> {
  const row = cellsOf(TABLES.dispatch, raw)
  if (str(row, 'tenant') !== scope.tenant || str(row, 'call') !== scope.call)
    throw new RowError('md_dispatch.tenant', 'scope')
  const id = identity(decodeDispatchId(str(row, 'dispatch')), 'md_dispatch.dispatch')
  const record = stored<DispatchRecord>(str(row, 'record'), 'md_dispatch.record')
  if (record.dispatch !== id) throw new RowError('md_dispatch.record', 'dispatch')
  const hadContent = stored<unknown>(str(row, 'had_content'), 'md_dispatch.had_content')
  if (!Array.isArray(hadContent) || !hadContent.every(item => typeof item === 'string'))
    throw new RowError('md_dispatch.had_content', 'array')
  return {
    seq: int(row, 'seq'),
    dispatch: {
      record,
      logicalTerminal: optional(row, 'logical_terminal', text =>
        stored<Termination>(text, 'md_dispatch.logical_terminal'),
      ),
      windows: entries(str(row, 'windows'), 'md_dispatch.windows'),
      events: entries(str(row, 'events'), 'md_dispatch.events'),
      assembly: null,
      nextSeq: entries(str(row, 'next_seq'), 'md_dispatch.next_seq'),
      trims: entries(str(row, 'trims'), 'md_dispatch.trims'),
      hadContent: new Set(hadContent),
      diagnostics: stored(str(row, 'diagnostics'), 'md_dispatch.diagnostics'),
    },
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

function indexOf(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new RowError(field, 'index')
  return value
}

function partBody(kind: string, payload: unknown): PartBody {
  const field = 'md_part.payload'
  switch (kind) {
    case 'open': {
      const value = exactKeys(payload, ['index', 'mode', 'content'], field)
      const { mode, content } = value
      if ((mode !== 'append' && mode !== 'replace') || !isGrowing(content))
        throw new RowError(field, 'open')
      return { kind, index: indexOf(value['index'], field), mode, content }
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
      const value = exactKeys(payload, ['index', 'block'], field)
      if (!isRecord(value['block'])) throw new RowError(field, 'seal')
      return { kind, index: indexOf(value['index'], field), block: value['block'] as ModelBlock }
    }
    default:
      throw new RowError('md_part.kind', 'kind')
  }
}

function parsePartRow(raw: unknown, scope: CallRowScope): StoredPart {
  const row = cellsOf(TABLES.part, raw)
  if (str(row, 'tenant') !== scope.tenant || str(row, 'call') !== scope.call)
    throw new RowError('md_part.tenant', 'scope')
  const body = partBody(str(row, 'kind'), stored(str(row, 'payload'), 'md_part.payload'))
  return { seq: int(row, 'seq'), position: int(row, 'block'), part: int(row, 'part'), ...body }
}

const isWriteMethod = (value: string): value is ModelWriteMethod =>
  MODEL_WRITE_METHODS.some(method => method === value)

function parseOperationRow(
  raw: unknown,
  tenant: string,
  operation: ModelOperationId,
): StoredBinding {
  const row = cellsOf(TABLES.operation, raw)
  if (str(row, 'tenant') !== tenant) throw new RowError('md_operation.tenant', 'scope')
  const bound = identity(decodeModelOperationId(str(row, 'operation')), 'md_operation.operation')
  if (bound !== operation) throw new RowError('md_operation.operation', 'scope')
  const method = str(row, 'method')
  if (!isWriteMethod(method)) throw new RowError('md_operation.method', 'method')
  return {
    operation: bound,
    call: identity(decodeModelCallId(str(row, 'call')), 'md_operation.call'),
    method,
    fingerprint: str(row, 'fingerprint'),
    revision: identity(decodeRevision(str(row, 'revision')), 'md_operation.revision'),
    receipt: stored<Receipt>(str(row, 'receipt'), 'md_operation.receipt'),
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

export const comparePartKeys = (left: PartKey, right: PartKey): number =>
  left.seq - right.seq || left.position - right.position || left.part - right.part

function growing(part: Extract<PartBody, { kind: 'open' }>): VisibleBlock {
  return { kind: 'growing', index: part.index, mode: part.mode, content: part.content, value: '' }
}

/** One part applied to the block that the earlier parts of its position folded into. */
function applyPart(block: VisibleBlock | null, part: StoredPart): VisibleBlock {
  if (block?.kind === 'sealed') throw new RowError('md_part.kind', 'after-seal')
  switch (part.kind) {
    case 'open':
      if (block !== null) throw new RowError('md_part.kind', 'open-twice')
      return growing(part)
    case 'seal':
      if (block !== null && block.index !== part.index) throw new RowError('md_part.kind', 'seal')
      return { kind: 'sealed', index: part.index, block: part.block }
    case 'append':
      if (block === null || block.mode !== 'append') throw new RowError('md_part.kind', 'append')
      return { ...block, value: block.value + part.delta }
    case 'replace':
      if (block === null || block.mode !== 'replace') throw new RowError('md_part.kind', 'replace')
      return { ...block, value: part.value }
    default: {
      const exhaustive: never = part
      return exhaustive
    }
  }
}

/** The visible block that the parts of one block position fold into, in part order. */
function foldBlock(parts: readonly StoredPart[]): VisibleBlock {
  const block = parts.reduce<VisibleBlock | null>(applyPart, null)
  if (block === null) throw new RowError('md_part.block', 'empty')
  return block
}

/** The blocks of one dispatch: block positions 0, 1, ... in order, each folded from its parts. */
function foldDispatch(parts: readonly StoredPart[]): VisibleBlock[] {
  const blocks: VisibleBlock[] = []
  let start = 0
  while (start < parts.length) {
    const position = parts[start]?.position
    if (position !== blocks.length) throw new RowError('md_part.block', 'position')
    let end = start
    while (end < parts.length && parts[end]?.position === position) end += 1
    blocks.push(foldBlock(parts.slice(start, end)))
    start = end
  }
  return blocks
}

function snapshotOf(
  call: ModelCallId,
  head: SnapshotHead,
  dispatches: readonly DispatchDocument[],
): Snapshot {
  let blocks: readonly VisibleBlock[]
  if (head.blocks.kind === 'inline') blocks = head.blocks.blocks
  else {
    const dispatch = dispatches[head.blocks.seq]
    if (dispatch === undefined) throw new RowError('md_call.snapshot', 'dispatch')
    blocks = structuredClone(dispatch.blocks)
  }
  return { call, cursor: head.cursor, blocks, state: head.state }
}

export type CallReadScope = CallRowScope & Readonly<{ operation: ModelOperationId | null }>

function parseRead(output: unknown, scope: CallReadScope): CallRead {
  const value = exactKeys(output, ['call', 'dispatches', 'parts', 'operation', 'capacity'], 'read')
  const { dispatches, parts } = value
  if (!Array.isArray(dispatches) || !Array.isArray(parts)) throw new RowError('read', 'rows')
  const operationRow = value['operation']
  if (operationRow !== null && scope.operation === null)
    throw new RowError('md_operation.operation', 'scope')
  const binding =
    operationRow === null || scope.operation === null
      ? null
      : parseOperationRow(operationRow, scope.tenant, scope.operation)
  const capacity = parseCapacity(value['capacity'])
  if (value['call'] === null) {
    if (dispatches.length > 0 || parts.length > 0) throw new RowError('read', 'orphan-rows')
    return { record: undefined, binding, capacity }
  }
  const head = parseCallRow(value['call'], scope)
  const parsedDispatches = dispatches.map(row => parseDispatchRow(row, scope))
  parsedDispatches.forEach((item, at) => {
    if (item.seq !== at) throw new RowError('md_dispatch.seq', 'order')
  })
  const parsedParts = parts.map(row => parsePartRow(row, scope))
  parsedParts.forEach((item, at) => {
    const previous = parsedParts[at - 1]
    if (previous !== undefined && comparePartKeys(previous, item) >= 0)
      throw new RowError('md_part.part', 'order')
    if (item.seq >= parsedDispatches.length) throw new RowError('md_part.seq', 'dispatch')
  })
  const documents: DispatchDocument[] = parsedDispatches.map(({ seq, dispatch }) => ({
    ...dispatch,
    blocks: foldDispatch(parsedParts.filter(part => part.seq === seq)),
  }))
  const snapshots = new Map<OutputCursor, Snapshot>()
  if (head.head !== null)
    snapshots.set(head.head.cursor, snapshotOf(scope.call, head.head, documents))
  return {
    record: {
      version: head.version,
      pending: head.pending,
      document: { ...head.document, dispatches: documents, snapshots },
      parts: parsedParts,
    },
    binding,
    capacity,
  }
}

function guarded<T>(work: () => T): Outcome<T, RowFailure> {
  try {
    return succeed(work())
  } catch (error) {
    if (error instanceof RowError) return fail({ field: error.field, reason: error.reason })
    throw error
  }
}

/** Parses the output of one `model.call` read, for exactly the tenant, call and operation asked. */
export function parseCallRead(
  output: JsonValue,
  scope: CallReadScope,
): Outcome<CallRead, RowFailure> {
  return guarded(() => parseRead(output, scope))
}

/** The cells of one row of `table`: exactly its columns, each of its kind. */
export function parseRow(table: Table, raw: unknown): Outcome<Row, RowFailure> {
  return guarded(() => cellsOf(table, raw))
}

/** The CAS token after a write: 1 for a new call, one more than the expected version otherwise. */
export const nextVersion = (expected: number | null): number =>
  expected === null ? 1 : expected + 1

/** The same JSON text for equal stored values; tells whether a block or a row changed. */
export function sameStored(left: unknown, right: unknown): boolean {
  return jsonText(left) === jsonText(right)
}

// --- Encoders: the rows the participant writes ---------------------------------------------

const textOf = (value: unknown): string | null => (value === null ? null : jsonText(value))

/** The head of the snapshot with the latest cursor. Its blocks refer to a dispatch when equal. */
export function snapshotHeadOf(call: CallDocument): SnapshotHead | null {
  let latest: Snapshot | null = null
  for (const snapshot of call.snapshots.values())
    if (latest === null || BigInt(snapshot.cursor) > BigInt(latest.cursor)) latest = snapshot
  if (latest === null) return null
  const text = jsonText(latest.blocks)
  const seq = call.dispatches.findIndex(dispatch => jsonText(dispatch.blocks) === text)
  return {
    cursor: latest.cursor,
    state: latest.state,
    blocks: seq >= 0 ? { kind: 'dispatch', seq } : { kind: 'inline', blocks: latest.blocks },
  }
}

export function encodeCallRow(
  tenant: string,
  version: number,
  call: CallDocument,
  pending: boolean,
): Outcome<Row, RowFailure> {
  return guarded(() => ({
    tenant,
    call: call.state.call,
    row_version: version,
    admission: call.admission,
    owner: jsonText(call.owner),
    initiator: jsonText(call.initiator),
    request: textOf(call.request),
    request_digest: call.requestDigest,
    cap_bytes: decimal(call.capacity.bytes, 'md_call.cap_bytes'),
    cap_blocks: decimal(call.capacity.blocks, 'md_call.cap_blocks'),
    cap_attachment: decimal(call.capacity.attachmentBytes, 'md_call.cap_attachment'),
    state: jsonText(call.state),
    execution: textOf(call.execution),
    retry: textOf(call.retry),
    retry_position: textOf(call.retryPosition),
    retry_source: textOf(call.retrySource),
    cursor: call.cursor,
    snapshot: textOf(snapshotHeadOf(call)),
    paging: jsonText(call.resultPaging),
    reads: jsonText([...call.reads.values()]),
    cleanup_failure: call.cleanupFailure,
    pending: pending ? 1 : 0,
  }))
}

export function encodeDispatchRow(
  tenant: string,
  call: ModelCallId,
  seq: number,
  dispatch: DispatchDocument,
): Outcome<Row, RowFailure> {
  return guarded(() => {
    if (dispatch.assembly !== null) throw new RowError('dispatch.assembly', 'live')
    return {
      tenant,
      call,
      seq,
      dispatch: dispatch.record.dispatch,
      record: jsonText(dispatch.record),
      logical_terminal: textOf(dispatch.logicalTerminal),
      windows: jsonText([...dispatch.windows]),
      events: jsonText([...dispatch.events]),
      next_seq: jsonText([...dispatch.nextSeq]),
      trims: jsonText([...dispatch.trims]),
      had_content: jsonText([...dispatch.hadContent]),
      diagnostics: jsonText(dispatch.diagnostics),
    }
  })
}

function partPayload(part: StoredPart): unknown {
  switch (part.kind) {
    case 'open':
      return { index: part.index, mode: part.mode, content: part.content }
    case 'append':
      return { delta: part.delta }
    case 'replace':
      return { value: part.value }
    case 'seal':
      return { index: part.index, block: part.block }
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
): Outcome<Row, RowFailure> {
  return guarded(() => ({
    tenant,
    call,
    seq: part.seq,
    block: part.position,
    part: part.part,
    kind: part.kind,
    payload: jsonText(partPayload(part)),
  }))
}

export function encodeOperationRow(
  tenant: string,
  operation: ModelOperationId,
  binding: BindingBase,
): Outcome<Row, RowFailure> {
  return guarded(() => ({
    tenant,
    operation,
    call: binding.call,
    method: binding.method,
    fingerprint: binding.fingerprint,
    revision: binding.revision,
    receipt: jsonText(binding.receipt),
  }))
}
