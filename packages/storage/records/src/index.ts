import type {
  AgentRef,
  Binding,
  CallRef,
  Checked,
  DataTypes,
  DefinitionVersion,
  JsonLimits,
  JsonObject,
  JsonValue,
  OpaqueId,
  OperationRef,
  RequestRef,
  SessionRef,
  UserRef,
  ValidationIssue,
  WorkOwner,
} from '@omne-harness-lite/work-data'
import { canonicalJson, copyJson, equalJson, parseData, parseJson } from '@omne-harness-lite/work-data'
import { createHash } from 'node:crypto'

export type Counter = string
export type Principal =
  | Readonly<{ kind: 'user'; user: UserRef }>
  | Readonly<{ kind: 'system'; systemId: OpaqueId }>
export type StreamRef = Readonly<{
  namespace: OpaqueId
  owner: OpaqueId
  scope: Readonly<{ kind: 'tenant'; tenantId: OpaqueId }> | Readonly<{ kind: 'system' }>
  streamId: OpaqueId
}>
export type Causality = Readonly<{
  parentOperation?: OperationRef
  initiator?: Principal
  session?: SessionRef
  work?: WorkOwner
  call?: CallRef
  request?: RequestRef
  agent?: AgentRef
  definition?: DefinitionVersion
  binding?: Binding
}>
export type OwnedRecord<
  Kind extends string = string,
  Version extends string = string,
  Data extends JsonValue = JsonValue,
> = Readonly<{ kind: Kind; version: Version; data: Data }>
export type StreamAppend = Readonly<{
  stream: StreamRef
  expectedRevision: Counter
  records: readonly OwnedRecord[]
}>
export type OperationInput = Readonly<{
  format: 'core-operation/1'
  operationKind: string
  tenantId: OpaqueId | null
  principal: Principal
  target: JsonValue
  arguments: JsonValue
  preconditions: JsonValue
  causality: Causality
}>
export type UseBinding = Readonly<{
  owner: string
  resourceId: OpaqueId
  generation: OpaqueId
  epoch: OpaqueId
}>
export type UseRequirement = Readonly<{ recordOwner: string; binding: UseBinding }>
export type Position = Readonly<{
  coordinationDomain: OpaqueId
  writerEpoch: Counter
  commitId: OpaqueId
  seq: Counter
}>
export type Watermark = Readonly<{
  coordinationDomain: OpaqueId
  seq: Counter
  commitId: OpaqueId | null
}>
export type RevisionConflict = Readonly<{
  kind: 'revision'
  currents: readonly Readonly<{ stream: StreamRef; revision: Counter }>[]
}>
export type RecordedOutcome =
  | Readonly<{ status: 'committed'; result: JsonValue }>
  | Readonly<{ status: 'conflict'; conflict: RevisionConflict }>
export type Receipt<Outcome extends RecordedOutcome = RecordedOutcome> = Readonly<{
  position: Position
  operation: OperationRef
  inputDigest: string
  outcome: Outcome
  streams: readonly Readonly<{ stream: StreamRef; revision: Counter }>[]
}>
export type CommitEnvelope = Readonly<{
  formatVersion: 'core-journal/1'
  position: Position
  operation: OperationRef
  inputEncoding: 'core-json/1'
  canonicalInput: string
  inputDigest: string
  appends: readonly StreamAppend[]
  outcome: RecordedOutcome
  requiredUses: readonly UseRequirement[]
}>
export type Rejection = Readonly<{
  code: 'invalid' | 'capacity' | 'stale_writer' | 'closed' | 'wrong_domain' |
    'namespace_denied' | 'invalid_owner' | 'unsupported_format'
  message: string
}>
export type RecordConflict =
  | Readonly<{ kind: 'operation_input'; operation: OperationRef }>
  | RevisionConflict
export type CommittedReceipt = Receipt<Extract<RecordedOutcome, { status: 'committed' }>>
export type ConflictReceipt = Receipt<Extract<RecordedOutcome, { status: 'conflict' }>>
export type CommitResult =
  | Readonly<{ status: 'committed'; receipt: CommittedReceipt }>
  | Readonly<{ status: 'conflict'; conflict: RevisionConflict; receipt: ConflictReceipt }>
  | Readonly<{
      status: 'conflict'
      conflict: Extract<RecordConflict, { kind: 'operation_input' }>
      receipt: null
    }>
  | Readonly<{ status: 'rejected'; reason: Rejection; receipt: null }>
  | Readonly<{ status: 'unavailable'; reason: string }>
  | Readonly<{ status: 'unknown'; operation: OperationRef; diagnosticId: OpaqueId }>
export type Head = Readonly<{
  watermark: Watermark
  streams: readonly Readonly<{ stream: StreamRef; revision: Counter }>[]
}>
export type ReadResult<T> =
  | Readonly<{ status: 'read'; value: T }>
  | Readonly<{ status: 'not_at_watermark'; available: Watermark }>
  | Readonly<{ status: 'rejected'; reason: Rejection }>
  | Readonly<{ status: 'unavailable'; reason: string }>
export type OperationLookup =
  | Readonly<{ status: 'committed'; receipt: CommittedReceipt; watermark: Watermark }>
  | Readonly<{
      status: 'conflict'
      conflict: RevisionConflict
      receipt: ConflictReceipt
      watermark: Watermark
    }>
  | Readonly<{ status: 'pending_durability'; position: Position; watermark: Watermark }>
  | Readonly<{ status: 'not_committed'; verifiedThrough: Watermark }>
  | Readonly<{ status: 'unknown'; operation: OperationRef; diagnosticId: OpaqueId }>
  | Readonly<{ status: 'unavailable'; reason: string }>

export interface RecordReader {
  readHead(streams: readonly StreamRef[]): Promise<ReadResult<Head>>
  readRange(query: Readonly<{
    afterSeq: Counter
    through: Watermark
    limit: number
  }>): Promise<ReadResult<Readonly<{
    envelopes: readonly CommitEnvelope[]
    through: Watermark
    nextAfterSeq: Counter
    complete: boolean
  }>>>
  lookupOperation(operation: OperationRef): Promise<OperationLookup>
}

declare const preparedOperationBrand: unique symbol
export type PreparedOperation = Readonly<{
  [preparedOperationBrand]: true
  operation: OperationRef
  canonicalInput: string
}>
declare const preparedCommitBrand: unique symbol
export type PreparedCommit = Readonly<{
  [preparedCommitBrand]: true
  operation: OperationRef
  canonicalInput: string
  owners: readonly string[]
  requiredUses: readonly UseRequirement[]
}>
export type CommitRequest = Readonly<{
  operation: PreparedOperation
  appends: readonly StreamAppend[]
  result: JsonValue
  requiredUses: readonly UseRequirement[]
}>
export type PendingCommit = Readonly<{
  status: 'pending_durability'
  position: Position
  operation: OperationRef
  disposition: 'apply' | 'record_conflict'
  completion: Promise<CommitResult>
}>
export type Submission = PendingCommit | CommitResult
export interface RecordPreparation {
  prepareOperation(operation: OperationRef, input: OperationInput): Checked<PreparedOperation>
  prepare(request: CommitRequest): Checked<PreparedCommit>
}
export interface RecordWriter extends RecordReader, RecordPreparation {
  readonly coordinationDomain: OpaqueId
  readonly writerEpoch: Counter
  lookupPrepared(operation: PreparedOperation): Submission | Readonly<{ status: 'not_seen' }>
  commit(prepared: PreparedCommit): Submission
  quarantine(diagnosticId: OpaqueId): void
  closeWriter(): Promise<CloseResult>
}
export type CloseResult =
  | Readonly<{ status: 'closed'; watermark: Watermark }>
  | Readonly<{
      status: 'blocked'
      watermark: Watermark
      diagnosticId: OpaqueId
      pending: readonly OperationRef[]
      lockHeld: boolean
    }>
export type AcquisitionCleanupState = Readonly<{
  cleanupId: OpaqueId
  coordinationDomain: OpaqueId
  phase: 'retained' | 'releasing' | 'released'
  lock: 'held' | 'released' | 'unknown'
  diagnosticId: OpaqueId
}>
export interface AcquisitionCleanup {
  readonly cleanupId: OpaqueId
  inspect(): AcquisitionCleanupState
  retryRelease(): Promise<AcquisitionCleanupState>
}
export type AcquireResult =
  | Readonly<{ status: 'acquired'; writer: RecordWriter; recovered: Watermark }>
  | Readonly<{ status: 'busy' }>
  | Readonly<{
      status: 'unavailable'
      reason: string
      diagnosticId: OpaqueId
      cleanup: Readonly<{ status: 'released' }> |
        Readonly<{ status: 'retained'; owner: AcquisitionCleanup }>
    }>
export interface RecordProvider {
  readonly reader: RecordReader
  acquireWriter(): Promise<AcquireResult>
}

export type JournalLine = Readonly<{
  formatVersion: 'core-journal/1'
  payload: string
  byteLength: number
  sha256: string
}>
export type CodecLimits = JsonLimits & Readonly<{
  maxLineBytes: number
  maxPayloadBytes: number
}>
export type DecodedLine = Readonly<{
  envelope: CommitEnvelope
  payload: string
  byteLength: number
  sha256: string
}>
export type RecordLimits = CodecLimits & Readonly<{
  maxPendingCommits: number
  maxPendingBytes: number
}>
export type NamespaceBinding = Readonly<{
  namespace: string
  owners: readonly string[]
  allowSystemScope: boolean
}>
export type JsonlProviderOptions = Readonly<{
  coordinationDomain: OpaqueId
  directory: string
  bindings: readonly NamespaceBinding[]
  limits: RecordLimits
}>

type CheckFailure = Extract<Checked<never>, { ok: false }>

function failures<T>(issues: readonly ValidationIssue[]): Checked<T> {
  return Object.freeze({
    ok: false,
    issues: Object.freeze(issues.map(entry => Object.freeze({ ...entry }))),
  })
}

function failed<T>(
  code: ValidationIssue['code'],
  message: string,
  path = '',
): Checked<T> {
  return failures([{ path, code, message }])
}

function passed<T>(value: T): Checked<T> {
  return Object.freeze({ ok: true, value })
}

function validLimit(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function validateLimits(limits: CodecLimits): Checked<CodecLimits> {
  if (limits === null || typeof limits !== 'object') return failed('capacity', 'limits must be an object')
  for (const name of ['maxBytes', 'maxDepth', 'maxNodes', 'maxLineBytes', 'maxPayloadBytes'] as const) {
    if (!validLimit(limits[name])) return failed('capacity', `${name} must be a non-negative safe integer`)
  }
  return passed(limits)
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function pointer(path: string, segment: string | number): string {
  const escaped = String(segment).replaceAll('~', '~0').replaceAll('/', '~1')
  return `${path}/${escaped}`
}

function prefixFailure(result: CheckFailure, path: string): CheckFailure {
  return failures(result.issues.map(entry => ({
    ...entry,
    path: `${path}${entry.path}`,
  }))) as CheckFailure
}

function objectShape(
  value: JsonValue,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): CheckFailure | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failed('schema', 'must be an object', path) as CheckFailure
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return failed('schema', 'unknown field', pointer(path, key)) as CheckFailure
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) return failed('schema', 'required field is missing', pointer(path, key)) as CheckFailure
  }
  return undefined
}

function arrayValue(value: JsonValue, path: string): readonly JsonValue[] | CheckFailure {
  return Array.isArray(value) ? value : failed('schema', 'must be an array', path) as CheckFailure
}

function isFailure(value: unknown): value is CheckFailure {
  return value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
}

function nonEmptyString(value: JsonValue, path: string): CheckFailure | undefined {
  return typeof value === 'string' && value.length > 0
    ? undefined
    : failed('schema', 'must be a non-empty string', path) as CheckFailure
}

function literalString(value: JsonValue, expected: string, path: string): CheckFailure | undefined {
  return value === expected
    ? undefined
    : failed('schema', `must equal ${JSON.stringify(expected)}`, path) as CheckFailure
}

function counter(value: JsonValue, path: string, positive = false): CheckFailure | undefined {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    return failed('schema', 'must be a canonical non-negative decimal counter', path) as CheckFailure
  }
  if (positive && value === '0') return failed('schema', 'must be greater than zero', path) as CheckFailure
  return undefined
}

function digestString(value: JsonValue, path: string): CheckFailure | undefined {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
    ? undefined
    : failed('schema', 'must be a lowercase hexadecimal SHA-256 digest', path) as CheckFailure
}

function dataType<K extends keyof DataTypes>(
  type: K,
  value: JsonValue,
  limits: CodecLimits,
  path: string,
): CheckFailure | undefined {
  const result = parseData(type, value, limits)
  return result.ok ? undefined : prefixFailure(result, path)
}

function validatePrincipal(value: JsonValue, limits: CodecLimits, path: string): CheckFailure | undefined {
  const initial = objectShape(value, path, ['kind'], ['user', 'systemId'])
  if (initial !== undefined) return initial
  const object = value as JsonObject
  if (object.kind === 'user') {
    const shape = objectShape(value, path, ['kind', 'user'])
    return shape ?? dataType('UserRef', object.user as JsonValue, limits, pointer(path, 'user'))
  }
  if (object.kind === 'system') {
    const shape = objectShape(value, path, ['kind', 'systemId'])
    return shape ?? nonEmptyString(object.systemId as JsonValue, pointer(path, 'systemId'))
  }
  return failed('schema', 'unknown principal kind', pointer(path, 'kind')) as CheckFailure
}

function validateCausality(value: JsonValue, limits: CodecLimits, path: string): CheckFailure | undefined {
  const optional = [
    'parentOperation', 'initiator', 'session', 'work', 'call', 'request', 'agent', 'definition', 'binding',
  ] as const
  const shape = objectShape(value, path, [], optional)
  if (shape !== undefined) return shape
  const object = value as JsonObject
  const checks: readonly [typeof optional[number], keyof DataTypes | 'Principal'][] = [
    ['parentOperation', 'OperationRef'],
    ['initiator', 'Principal'],
    ['session', 'SessionRef'],
    ['work', 'WorkOwner'],
    ['call', 'CallRef'],
    ['request', 'RequestRef'],
    ['agent', 'AgentRef'],
    ['definition', 'DefinitionVersion'],
    ['binding', 'Binding'],
  ]
  for (const [key, type] of checks) {
    const item = object[key]
    if (item === undefined) continue
    const problem = type === 'Principal'
      ? validatePrincipal(item, limits, pointer(path, key))
      : dataType(type, item, limits, pointer(path, key))
    if (problem !== undefined) return problem
  }
  return undefined
}

function validateOperationInput(value: JsonValue, limits: CodecLimits): CheckFailure | undefined {
  const path = '/canonicalInput'
  const shape = objectShape(value, path, [
    'format', 'operationKind', 'tenantId', 'principal', 'target', 'arguments', 'preconditions', 'causality',
  ])
  if (shape !== undefined) return shape
  const object = value as JsonObject
  return literalString(object.format as JsonValue, 'core-operation/1', pointer(path, 'format'))
    ?? nonEmptyString(object.operationKind as JsonValue, pointer(path, 'operationKind'))
    ?? (object.tenantId === null ? undefined : nonEmptyString(object.tenantId as JsonValue, pointer(path, 'tenantId')))
    ?? validatePrincipal(object.principal as JsonValue, limits, pointer(path, 'principal'))
    ?? validateCausality(object.causality as JsonValue, limits, pointer(path, 'causality'))
}

function validatePosition(value: JsonValue, path: string): CheckFailure | undefined {
  const shape = objectShape(value, path, ['coordinationDomain', 'writerEpoch', 'commitId', 'seq'])
  if (shape !== undefined) return shape
  const object = value as JsonObject
  return nonEmptyString(object.coordinationDomain as JsonValue, pointer(path, 'coordinationDomain'))
    ?? counter(object.writerEpoch as JsonValue, pointer(path, 'writerEpoch'), true)
    ?? nonEmptyString(object.commitId as JsonValue, pointer(path, 'commitId'))
    ?? counter(object.seq as JsonValue, pointer(path, 'seq'), true)
}

function validateStream(value: JsonValue, path: string): CheckFailure | undefined {
  const shape = objectShape(value, path, ['namespace', 'owner', 'scope', 'streamId'])
  if (shape !== undefined) return shape
  const object = value as JsonObject
  const strings = nonEmptyString(object.namespace as JsonValue, pointer(path, 'namespace'))
    ?? nonEmptyString(object.owner as JsonValue, pointer(path, 'owner'))
    ?? nonEmptyString(object.streamId as JsonValue, pointer(path, 'streamId'))
  if (strings !== undefined) return strings
  const scope = object.scope as JsonValue
  const scopeShape = objectShape(scope, pointer(path, 'scope'), ['kind'], ['tenantId'])
  if (scopeShape !== undefined) return scopeShape
  const scopeObject = scope as JsonObject
  if (scopeObject.kind === 'system') return objectShape(scope, pointer(path, 'scope'), ['kind'])
  if (scopeObject.kind !== 'tenant') {
    return failed('schema', 'unknown stream scope kind', pointer(pointer(path, 'scope'), 'kind')) as CheckFailure
  }
  return objectShape(scope, pointer(path, 'scope'), ['kind', 'tenantId'])
    ?? nonEmptyString(scopeObject.tenantId as JsonValue, pointer(pointer(path, 'scope'), 'tenantId'))
}

function validateRevisionConflict(value: JsonValue, limits: CodecLimits, path: string): CheckFailure | undefined {
  const shape = objectShape(value, path, ['kind', 'currents'])
  if (shape !== undefined) return shape
  const object = value as JsonObject
  const kind = literalString(object.kind as JsonValue, 'revision', pointer(path, 'kind'))
  if (kind !== undefined) return kind
  const currents = arrayValue(object.currents as JsonValue, pointer(path, 'currents'))
  if (isFailure(currents)) return currents
  if (currents.length === 0) return failed('schema', 'must contain at least one current revision', pointer(path, 'currents')) as CheckFailure
  let previous: string | undefined
  for (let index = 0; index < currents.length; index += 1) {
    const currentPath = pointer(pointer(path, 'currents'), index)
    const current = currents[index] as JsonValue
    const currentShape = objectShape(current, currentPath, ['stream', 'revision'])
    if (currentShape !== undefined) return currentShape
    const currentObject = current as JsonObject
    const problem = validateStream(currentObject.stream as JsonValue, pointer(currentPath, 'stream'))
      ?? counter(currentObject.revision as JsonValue, pointer(currentPath, 'revision'))
    if (problem !== undefined) return problem
    const key = canonicalJson(currentObject.stream as JsonValue)
    if (previous !== undefined && key <= previous) {
      return failed('schema', 'current revisions must use unique canonical stream order', currentPath) as CheckFailure
    }
    previous = key
  }
  return undefined
}

function validateOutcome(value: JsonValue, limits: CodecLimits, path: string): CheckFailure | undefined {
  const initial = objectShape(value, path, ['status'], ['result', 'conflict'])
  if (initial !== undefined) return initial
  const object = value as JsonObject
  if (object.status === 'committed') return objectShape(value, path, ['status', 'result'])
  if (object.status === 'conflict') {
    return objectShape(value, path, ['status', 'conflict'])
      ?? validateRevisionConflict(object.conflict as JsonValue, limits, pointer(path, 'conflict'))
  }
  return failed('schema', 'unknown recorded outcome status', pointer(path, 'status')) as CheckFailure
}

function validateAppends(value: JsonValue, path: string): CheckFailure | undefined {
  const appends = arrayValue(value, path)
  if (isFailure(appends)) return appends
  if (appends.length === 0) return failed('schema', 'must contain at least one append', path) as CheckFailure
  let previous: string | undefined
  for (let index = 0; index < appends.length; index += 1) {
    const appendPath = pointer(path, index)
    const append = appends[index] as JsonValue
    const shape = objectShape(append, appendPath, ['stream', 'expectedRevision', 'records'])
    if (shape !== undefined) return shape
    const object = append as JsonObject
    const streamProblem = validateStream(object.stream as JsonValue, pointer(appendPath, 'stream'))
      ?? counter(object.expectedRevision as JsonValue, pointer(appendPath, 'expectedRevision'))
    if (streamProblem !== undefined) return streamProblem
    const key = canonicalJson(object.stream as JsonValue)
    if (previous !== undefined && key <= previous) {
      return failed('schema', 'appends must use unique canonical stream order', appendPath) as CheckFailure
    }
    previous = key
    const records = arrayValue(object.records as JsonValue, pointer(appendPath, 'records'))
    if (isFailure(records)) return records
    if (records.length === 0) return failed('schema', 'must contain at least one record', pointer(appendPath, 'records')) as CheckFailure
    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      const recordPath = pointer(pointer(appendPath, 'records'), recordIndex)
      const record = records[recordIndex] as JsonValue
      const recordShape = objectShape(record, recordPath, ['kind', 'version', 'data'])
      if (recordShape !== undefined) return recordShape
      const recordObject = record as JsonObject
      const recordProblem = nonEmptyString(recordObject.kind as JsonValue, pointer(recordPath, 'kind'))
        ?? nonEmptyString(recordObject.version as JsonValue, pointer(recordPath, 'version'))
      if (recordProblem !== undefined) return recordProblem
    }
  }
  return undefined
}

function validateRequiredUses(value: JsonValue, owners: ReadonlySet<string>, path: string): CheckFailure | undefined {
  const uses = arrayValue(value, path)
  if (isFailure(uses)) return uses
  const bindings = new Set<string>()
  for (let index = 0; index < uses.length; index += 1) {
    const usePath = pointer(path, index)
    const use = uses[index] as JsonValue
    const shape = objectShape(use, usePath, ['recordOwner', 'binding'])
    if (shape !== undefined) return shape
    const object = use as JsonObject
    const ownerProblem = nonEmptyString(object.recordOwner as JsonValue, pointer(usePath, 'recordOwner'))
    if (ownerProblem !== undefined) return ownerProblem
    if (!owners.has(object.recordOwner as string)) {
      return failed('schema', 'recordOwner must own an append in this envelope', pointer(usePath, 'recordOwner')) as CheckFailure
    }
    const bindingPath = pointer(usePath, 'binding')
    const bindingShape = objectShape(object.binding as JsonValue, bindingPath, ['owner', 'resourceId', 'generation', 'epoch'])
    if (bindingShape !== undefined) return bindingShape
    const binding = object.binding as JsonObject
    for (const key of ['owner', 'resourceId', 'generation', 'epoch'] as const) {
      const problem = nonEmptyString(binding[key] as JsonValue, pointer(bindingPath, key))
      if (problem !== undefined) return problem
    }
    const key = canonicalJson(binding as JsonValue)
    if (bindings.has(key)) return failed('schema', 'binding tuple must be unique', bindingPath) as CheckFailure
    bindings.add(key)
  }
  return undefined
}

function streamScopeTenant(stream: JsonValue): string | null {
  const scope = (stream as JsonObject).scope as JsonObject
  return scope.kind === 'tenant' ? scope.tenantId as string : null
}

function validateConflictEnvelope(envelope: JsonObject, input: JsonObject): CheckFailure | undefined {
  const outcome = envelope.outcome as JsonObject
  if (outcome.status !== 'conflict') return undefined
  const uses = envelope.requiredUses as readonly JsonValue[]
  if (uses.length !== 0) return failed('schema', 'conflict envelope must not require uses', '/requiredUses') as CheckFailure
  const appends = envelope.appends as readonly JsonValue[]
  if (appends.length !== 1) return failed('schema', 'conflict envelope must have one provider-owned append', '/appends') as CheckFailure
  const append = appends[0] as JsonObject
  const stream = append.stream as JsonObject
  const scope = stream.scope as JsonObject
  const expectedTenant = input.tenantId as string | null
  if (stream.namespace !== 'core.records' || stream.owner !== 'durable-records'
    || stream.streamId !== 'operation-outcomes'
    || expectedTenant === null && scope.kind !== 'system'
    || expectedTenant !== null && (scope.kind !== 'tenant' || scope.tenantId !== expectedTenant)) {
    return failed('schema', 'conflict outcome must use its provider-owned outcome stream', '/appends/0/stream') as CheckFailure
  }
  const records = append.records as readonly JsonValue[]
  if (records.length !== 1) return failed('schema', 'conflict append must contain one outcome record', '/appends/0/records') as CheckFailure
  const record = records[0] as JsonObject
  if (record.kind !== 'operation.conflict' || record.version !== '1'
    || !equalJson(record.data as JsonValue, outcome.conflict as JsonValue)) {
    return failed('schema', 'conflict record must exactly match the recorded outcome', '/appends/0/records/0') as CheckFailure
  }
  return undefined
}

function validateEnvelope(value: JsonValue, limits: CodecLimits): Checked<CommitEnvelope> {
  const shape = objectShape(value, '', [
    'formatVersion', 'position', 'operation', 'inputEncoding', 'canonicalInput', 'inputDigest',
    'appends', 'outcome', 'requiredUses',
  ])
  if (shape !== undefined) return shape
  const envelope = value as JsonObject
  const headerProblem = literalString(envelope.formatVersion as JsonValue, 'core-journal/1', '/formatVersion')
    ?? validatePosition(envelope.position as JsonValue, '/position')
    ?? dataType('OperationRef', envelope.operation as JsonValue, limits, '/operation')
    ?? literalString(envelope.inputEncoding as JsonValue, 'core-json/1', '/inputEncoding')
    ?? nonEmptyString(envelope.canonicalInput as JsonValue, '/canonicalInput')
    ?? digestString(envelope.inputDigest as JsonValue, '/inputDigest')
  if (headerProblem !== undefined) return headerProblem

  const canonicalInput = envelope.canonicalInput as string
  const parsedInput = parseJson(canonicalInput, limits)
  if (!parsedInput.ok) return prefixFailure(parsedInput, '/canonicalInput')
  if (canonicalJson(parsedInput.value) !== canonicalInput) {
    return failed('schema', 'must be the canonical core-json/1 encoding', '/canonicalInput')
  }
  const inputProblem = validateOperationInput(parsedInput.value, limits)
  if (inputProblem !== undefined) return inputProblem
  if (sha256(Buffer.from(canonicalInput, 'utf8')) !== envelope.inputDigest) {
    return failed('schema', 'does not match canonicalInput', '/inputDigest')
  }
  const input = parsedInput.value as JsonObject
  const operation = envelope.operation as JsonObject
  if (canonicalJson(input.principal as JsonValue) !== operation.principalId) {
    return failed('schema', 'must equal the canonical principal identity', '/operation/principalId')
  }

  const appendProblem = validateAppends(envelope.appends as JsonValue, '/appends')
    ?? validateOutcome(envelope.outcome as JsonValue, limits, '/outcome')
  if (appendProblem !== undefined) return appendProblem
  const appends = envelope.appends as readonly JsonValue[]
  const owners = new Set(appends.map(append => ((append as JsonObject).stream as JsonObject).owner as string))
  const useProblem = validateRequiredUses(envelope.requiredUses as JsonValue, owners, '/requiredUses')
  if (useProblem !== undefined) return useProblem

  const tenantId = input.tenantId as string | null
  for (let index = 0; index < appends.length; index += 1) {
    const stream = (appends[index] as JsonObject).stream as JsonValue
    const streamTenant = streamScopeTenant(stream)
    if (tenantId === null ? streamTenant !== null : streamTenant !== tenantId) {
      return failed('schema', 'stream scope must match the operation tenant', `/appends/${index}/stream/scope`)
    }
  }
  const outcome = envelope.outcome as JsonObject
  if (outcome.status === 'conflict') {
    const conflict = outcome.conflict as JsonObject
    const currents = conflict.currents as readonly JsonValue[]
    for (let index = 0; index < currents.length; index += 1) {
      const stream = (currents[index] as JsonObject).stream as JsonValue
      const streamTenant = streamScopeTenant(stream)
      if (tenantId === null ? streamTenant !== null : streamTenant !== tenantId) {
        return failed('schema', 'conflict stream scope must match the operation tenant', `/outcome/conflict/currents/${index}/stream/scope`)
      }
    }
  }
  const conflictProblem = validateConflictEnvelope(envelope, input)
  if (conflictProblem !== undefined) return conflictProblem
  return passed(value as unknown as CommitEnvelope)
}

export function encodeEnvelope(envelope: CommitEnvelope, limits: CodecLimits): Checked<Uint8Array> {
  const checkedLimits = validateLimits(limits)
  if (!checkedLimits.ok) return checkedLimits
  const copied = copyJson(envelope, {
    maxBytes: limits.maxPayloadBytes,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
  })
  if (!copied.ok) return copied
  const validEnvelope = validateEnvelope(copied.value, limits)
  if (!validEnvelope.ok) return validEnvelope
  const payload = canonicalJson(validEnvelope.value as unknown as JsonValue)
  const reparsedPayload = parseJson(payload, {
    maxBytes: limits.maxPayloadBytes,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
  })
  if (!reparsedPayload.ok) return prefixFailure(reparsedPayload, '/payload')
  const payloadBytes = Buffer.from(payload, 'utf8')
  const outer: JournalLine = {
    formatVersion: 'core-journal/1',
    payload,
    byteLength: payloadBytes.byteLength,
    sha256: sha256(payloadBytes),
  }
  const line = Buffer.from(`${canonicalJson(outer)}\n`, 'utf8')
  if (line.byteLength > limits.maxLineBytes) {
    return failed('capacity', `line byte length ${line.byteLength} exceeds maxLineBytes ${limits.maxLineBytes}`)
  }
  return passed(new Uint8Array(line))
}

export function decodeLine(completeLine: Uint8Array, limits: CodecLimits): Checked<DecodedLine> {
  const checkedLimits = validateLimits(limits)
  if (!checkedLimits.ok) return checkedLimits
  if (!(completeLine instanceof Uint8Array)) return failed('invalid_json', 'completeLine must be a Uint8Array')
  if (completeLine.byteLength > limits.maxLineBytes) {
    return failed('capacity', `line byte length ${completeLine.byteLength} exceeds maxLineBytes ${limits.maxLineBytes}`)
  }
  if (completeLine.byteLength === 0 || completeLine.at(-1) !== 0x0a) {
    return failed('invalid_json', 'complete line must end with one LF')
  }
  if (completeLine[0] === 0xef && completeLine[1] === 0xbb && completeLine[2] === 0xbf) {
    return failed('invalid_json', 'UTF-8 BOM is not allowed')
  }
  for (let index = 0; index < completeLine.byteLength - 1; index += 1) {
    if (completeLine[index] === 0x0a || completeLine[index] === 0x0d) {
      return failed('invalid_json', 'line may contain only its terminal LF')
    }
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(completeLine.subarray(0, -1))
  } catch {
    return failed('invalid_json', 'line is not valid UTF-8')
  }
  const outerResult = parseJson(text, {
    maxBytes: limits.maxLineBytes,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
  })
  if (!outerResult.ok) return outerResult
  if (canonicalJson(outerResult.value) !== text) {
    return failed('schema', 'outer journal line must use canonical core-json/1 encoding')
  }
  const outerShape = objectShape(outerResult.value, '', ['formatVersion', 'payload', 'byteLength', 'sha256'])
  if (outerShape !== undefined) return outerShape
  const outer = outerResult.value as JsonObject
  const outerProblem = literalString(outer.formatVersion as JsonValue, 'core-journal/1', '/formatVersion')
    ?? nonEmptyString(outer.payload as JsonValue, '/payload')
    ?? (typeof outer.byteLength === 'number' && Number.isSafeInteger(outer.byteLength) && outer.byteLength >= 0
      ? undefined
      : failed('schema', 'must be a non-negative safe integer', '/byteLength') as CheckFailure)
    ?? digestString(outer.sha256 as JsonValue, '/sha256')
  if (outerProblem !== undefined) return outerProblem
  const payload = outer.payload as string
  const payloadBytes = Buffer.from(payload, 'utf8')
  if (payloadBytes.byteLength > limits.maxPayloadBytes) {
    return failed('capacity', `payload byte length ${payloadBytes.byteLength} exceeds maxPayloadBytes ${limits.maxPayloadBytes}`, '/payload')
  }
  if (payloadBytes.byteLength !== outer.byteLength) {
    return failed('schema', 'does not match payload UTF-8 byte length', '/byteLength')
  }
  if (sha256(payloadBytes) !== outer.sha256) return failed('schema', 'does not match payload', '/sha256')
  const payloadResult = parseJson(payload, {
    maxBytes: limits.maxPayloadBytes,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
  })
  if (!payloadResult.ok) return prefixFailure(payloadResult, '/payload')
  if (canonicalJson(payloadResult.value) !== payload) {
    return failed('schema', 'payload must use canonical core-json/1 encoding', '/payload')
  }
  const envelope = validateEnvelope(payloadResult.value, limits)
  if (!envelope.ok) return envelope
  return passed(Object.freeze({
    envelope: envelope.value,
    payload,
    byteLength: outer.byteLength as number,
    sha256: outer.sha256 as string,
  }))
}
