import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import type { Diagnostics, DiagnosticContext } from '@omne-harness-lite/diagnostics'
import { decodeLine, encodeEnvelope } from '@omne-harness-lite/records'
import type {
  AcquisitionCleanup,
  AcquisitionCleanupState,
  AcquireResult,
  CloseResult,
  CommitEnvelope,
  CommitRequest,
  CommitResult,
  Counter,
  Head,
  JsonlProviderOptions,
  NamespaceBinding,
  OperationInput,
  OperationLookup,
  PendingCommit,
  Position,
  PreparedCommit,
  PreparedOperation,
  ReadResult,
  Receipt,
  RecordProvider,
  RecordReader,
  RecordedOutcome,
  RecordWriter,
  RevisionConflict,
  StreamAppend,
  StreamRef,
  Submission,
  Watermark,
  Principal,
} from '@omne-harness-lite/records'
import { canonicalJson, copyJson, parseData, parseJson } from '@omne-harness-lite/work-data'
import type {
  Checked,
  JsonObject,
  JsonValue,
  OpaqueId,
  OperationRef,
  ValidationIssue,
} from '@omne-harness-lite/work-data'
import { syncDirectory, writeSyncedFile } from './file-ops.js'

const require = createRequire(import.meta.url)
const fsExt = require('fs-ext') as Readonly<{
  flock(
    descriptor: number,
    flags: 'exnb' | 'un',
    callback: (error: NodeJS.ErrnoException | null) => void,
  ): void
}>

const JOURNAL_FILE = 'journal.jsonl'
const LOCK_FILE = '.writer.lock'
const COUNTER = /^(?:0|[1-9][0-9]*)$/u
const RESERVED_NAMESPACES = new Set(['core.records', 'core.writer'])
const localOwners = new Map<string, object>()

type OperationData = Readonly<{
  operation: OperationRef
  input: OperationInput
  canonicalInput: string
  inputDigest: string
}>

type CommitData = OperationData &
  Readonly<{
    appends: readonly StreamAppend[]
    result: JsonValue
    owners: readonly string[]
    requiredUses: CommitRequest['requiredUses']
    diagnosticId: OpaqueId
  }>

type OperationEntry = {
  readonly canonicalInput: string
  readonly operation: OperationRef
  submission: Submission
}

type QueuedCommit = {
  readonly data: CommitData
  readonly envelope: CommitEnvelope
  readonly line: Uint8Array
  readonly pending: PendingCommit
  readonly final: CommitResult
  readonly diagnosticId: OpaqueId
  resolve(result: CommitResult): void
}

type ResourceSet = {
  journal: FileHandle | null
  lock: FileHandle | null
  lockState: 'held' | 'released' | 'unknown'
  journalState: 'held' | 'released' | 'unknown'
  unknownDescriptor: boolean
}

function passed<T>(value: T): Checked<T> {
  return Object.freeze({ ok: true, value })
}

function failed<T>(code: ValidationIssue['code'], message: string, path = ''): Checked<T> {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([Object.freeze({ code, message, path })]),
  })
}

function counter(value: Counter): bigint | undefined {
  if (!COUNTER.test(value)) return undefined
  return BigInt(value)
}

function streamKey(stream: StreamRef): string {
  return canonicalJson(stream as unknown as JsonValue)
}

function operationKey(operation: OperationRef): string {
  return canonicalJson(operation as unknown as JsonValue)
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function watermark(domain: OpaqueId, seq: bigint, commitId: OpaqueId | null): Watermark {
  return Object.freeze({ coordinationDomain: domain, seq: seq.toString(), commitId })
}

function rejected(
  code: 'invalid' | 'capacity' | 'closed' | 'namespace_denied' | 'invalid_owner',
  message: string,
): CommitResult {
  return Object.freeze({
    status: 'rejected',
    reason: Object.freeze({ code, message }),
    receipt: null,
  })
}

function unknown(operation: OperationRef, diagnosticId: OpaqueId): CommitResult {
  return Object.freeze({ status: 'unknown', operation, diagnosticId })
}

function unavailable(reason: string): CommitResult {
  return Object.freeze({ status: 'unavailable', reason })
}

function asPreparedOperation(
  value: Readonly<{
    operation: OperationRef
    canonicalInput: string
  }>,
): PreparedOperation {
  // The public unique-symbol member deliberately has no runtime representation.
  // Membership in this writer's WeakMap is the runtime proof consumers cannot forge.
  return value as PreparedOperation
}

function asPreparedCommit(
  value: Readonly<{
    operation: OperationRef
    canonicalInput: string
    owners: readonly string[]
    requiredUses: CommitRequest['requiredUses']
  }>,
): PreparedCommit {
  return value as PreparedCommit
}

function safeDiagnosticId(diagnostics: Diagnostics): OpaqueId {
  try {
    const value = diagnostics.newId()
    return typeof value === 'string' && value.length > 0 ? value : randomUUID()
  } catch {
    return randomUUID()
  }
}

function diagnosticContext(
  diagnostics: Diagnostics,
  operation?: OperationData,
): DiagnosticContext | null {
  const identity = operation?.input
    ? {
        tenantId: operation.input.tenantId,
        principal: operation.input.principal,
        operation: operation.operation,
        causality: operation.input.causality,
      }
    : {
        tenantId: null,
        principal: { kind: 'system', systemId: 'local-host' } as const,
        causality: {},
      }
  try {
    return diagnostics.scope(identity)
  } catch {
    return null
  }
}

function safeLog(
  diagnostics: Diagnostics,
  context: DiagnosticContext | null,
  point: Parameters<Diagnostics['log']>[1],
): void {
  if (context === null) return
  try {
    diagnostics.log(context, point)
  } catch {
    // Diagnostics are explicitly lossy and cannot rewrite durable-record outcomes.
  }
}

async function flock(descriptor: number, flags: 'exnb' | 'un'): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    fsExt.flock(descriptor, flags, error => {
      if (error === null) resolvePromise()
      else rejectPromise(error)
    })
  })
}

function systemCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const code = (error as NodeJS.ErrnoException).code
  return typeof code === 'string' ? code : undefined
}

async function closeResources(resources: ResourceSet): Promise<boolean> {
  let certain = true
  if (resources.journal !== null && resources.journalState === 'held') {
    const handle = resources.journal
    resources.journal = null
    try {
      await handle.close()
      resources.journalState = 'released'
    } catch {
      resources.journalState = 'unknown'
      resources.unknownDescriptor = true
      certain = false
    }
  }
  if (resources.lock !== null) {
    const handle = resources.lock
    resources.lock = null
    let unlocked = resources.lockState === 'released'
    if (resources.lockState === 'held') {
      try {
        await flock(handle.fd, 'un')
        unlocked = true
      } catch {
        certain = false
      }
    }
    try {
      await handle.close()
      resources.lockState = 'released'
      certain = resources.journalState !== 'unknown'
    } catch {
      resources.lockState = unlocked ? 'released' : 'unknown'
      resources.unknownDescriptor = true
      certain = false
    }
  }
  return (
    certain &&
    !resources.unknownDescriptor &&
    resources.lockState === 'released' &&
    resources.journalState !== 'unknown'
  )
}

class StableFileValidationError extends Error {
  constructor(
    readonly kind: 'journal' | 'lock',
    readonly handle: FileHandle,
  ) {
    super(`stable ${kind} file identity check failed`)
  }
}

class RetainedCleanup implements AcquisitionCleanup {
  readonly cleanupId: OpaqueId
  private phase: AcquisitionCleanupState['phase'] = 'retained'
  private releaseTask: Promise<AcquisitionCleanupState> | null = null

  constructor(
    private readonly domain: OpaqueId,
    private readonly resources: ResourceSet,
    private readonly diagnosticId: OpaqueId,
    cleanupId: OpaqueId,
    private readonly onReleased: () => void,
  ) {
    this.cleanupId = cleanupId
  }

  inspect(): AcquisitionCleanupState {
    return Object.freeze({
      cleanupId: this.cleanupId,
      coordinationDomain: this.domain,
      phase: this.phase,
      lock: this.resources.lockState,
      diagnosticId: this.diagnosticId,
    })
  }

  retryRelease(): Promise<AcquisitionCleanupState> {
    if (this.phase === 'released') return Promise.resolve(this.inspect())
    if (this.releaseTask !== null) return this.releaseTask
    this.phase = 'releasing'
    this.releaseTask = closeResources(this.resources).then(released => {
      this.phase = released ? 'released' : 'retained'
      if (released) this.onReleased()
      this.releaseTask = null
      return this.inspect()
    })
    return this.releaseTask
  }
}

function validateOptions(options: JsonlProviderOptions): void {
  if (
    options === null ||
    typeof options !== 'object' ||
    typeof options.coordinationDomain !== 'string' ||
    options.coordinationDomain.length === 0 ||
    typeof options.directory !== 'string' ||
    !isAbsolute(options.directory)
  ) {
    throw new TypeError('JSONL provider requires a non-empty domain and an absolute directory')
  }
  const limits = options.limits
  for (const name of [
    'maxBytes',
    'maxDepth',
    'maxNodes',
    'maxLineBytes',
    'maxPayloadBytes',
    'maxPendingCommits',
    'maxPendingBytes',
  ] as const) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`)
    }
  }
  if (limits.maxPendingCommits === 0 || limits.maxPendingBytes === 0) {
    throw new TypeError('pending commit and byte limits must be positive')
  }
  const namespaces = new Set<string>()
  for (const binding of options.bindings) {
    if (
      binding.namespace.length === 0 ||
      RESERVED_NAMESPACES.has(binding.namespace) ||
      namespaces.has(binding.namespace) ||
      binding.owners.length === 0 ||
      new Set(binding.owners).size !== binding.owners.length ||
      binding.owners.some(owner => owner.length === 0)
    ) {
      throw new TypeError('namespace bindings must be unique, non-reserved, and have unique owners')
    }
    namespaces.add(binding.namespace)
  }
}

function bindingMap(bindings: readonly NamespaceBinding[]): ReadonlyMap<string, NamespaceBinding> {
  return new Map(bindings.map(binding => [binding.namespace, binding]))
}

function isEpochEnvelope(
  envelope: CommitEnvelope,
  expectedEpoch: bigint,
  domain: OpaqueId,
): boolean {
  if (envelope.operation.namespace !== 'core.writer') return false
  const epoch = expectedEpoch.toString()
  const parsed = parseJson(envelope.canonicalInput, {
    maxBytes: Buffer.byteLength(envelope.canonicalInput, 'utf8'),
    maxDepth: 16,
    maxNodes: 64,
  })
  if (!parsed.ok) return false
  const input = parsed.value as JsonObject
  const append = envelope.appends[0]
  return (
    envelope.position.writerEpoch === epoch &&
    envelope.operation.principalId === '{"kind":"system","systemId":"local-host"}' &&
    envelope.operation.operationId === `epoch:${epoch}` &&
    input.format === 'core-operation/1' &&
    input.operationKind === 'writer.acquire' &&
    input.tenantId === null &&
    canonicalJson(input.principal as JsonValue) === envelope.operation.principalId &&
    input.target === domain &&
    canonicalJson(input.arguments as JsonValue) === `{"epoch":"${epoch}"}` &&
    canonicalJson(input.preconditions as JsonValue) ===
      `{"previousEpoch":"${(expectedEpoch - 1n).toString()}"}` &&
    canonicalJson(input.causality as JsonValue) === '{}' &&
    envelope.outcome.status === 'committed' &&
    canonicalJson(envelope.outcome.result) === `{"epoch":"${epoch}"}` &&
    envelope.requiredUses.length === 0 &&
    envelope.appends.length === 1 &&
    append?.stream.namespace === 'core.writer' &&
    append.stream.owner === 'durable-records' &&
    append.stream.scope.kind === 'system' &&
    append.stream.streamId === 'writer-epochs' &&
    append.records.length === 1 &&
    append.records[0]?.kind === 'writer.epoch' &&
    append.records[0].version === '1' &&
    canonicalJson(append.records[0].data) === `{"epoch":"${epoch}"}`
  )
}

function epochEnvelope(
  domain: OpaqueId,
  epoch: bigint,
  seq: bigint,
  expectedRevision: bigint,
): CommitEnvelope {
  const principal = { kind: 'system', systemId: 'local-host' } as const
  const input: OperationInput = {
    format: 'core-operation/1',
    operationKind: 'writer.acquire',
    tenantId: null,
    principal,
    target: domain,
    arguments: { epoch: epoch.toString() },
    preconditions: { previousEpoch: (epoch - 1n).toString() },
    causality: {},
  }
  const canonicalInput = canonicalJson(input as unknown as JsonValue)
  return Object.freeze({
    formatVersion: 'core-journal/1',
    position: Object.freeze({
      coordinationDomain: domain,
      writerEpoch: epoch.toString(),
      commitId: `commit-${seq.toString()}`,
      seq: seq.toString(),
    }),
    operation: Object.freeze({
      namespace: 'core.writer',
      principalId: canonicalJson(principal),
      operationId: `epoch:${epoch.toString()}`,
    }),
    inputEncoding: 'core-json/1',
    canonicalInput,
    inputDigest: digest(canonicalInput),
    appends: Object.freeze([
      Object.freeze({
        stream: Object.freeze({
          namespace: 'core.writer',
          owner: 'durable-records',
          scope: Object.freeze({ kind: 'system' as const }),
          streamId: 'writer-epochs',
        }),
        expectedRevision: expectedRevision.toString(),
        records: Object.freeze([
          Object.freeze({
            kind: 'writer.epoch',
            version: '1',
            data: Object.freeze({ epoch: epoch.toString() }),
          }),
        ]),
      }),
    ]),
    outcome: Object.freeze({
      status: 'committed' as const,
      result: Object.freeze({ epoch: epoch.toString() }),
    }),
    requiredUses: Object.freeze([]),
  })
}

function revisionsAfter(
  revisions: Map<string, bigint>,
  appends: readonly StreamAppend[],
): readonly Readonly<{ stream: StreamRef; revision: Counter }>[] {
  return Object.freeze(
    appends.map(append => {
      const key = streamKey(append.stream)
      const next = (revisions.get(key) ?? 0n) + BigInt(append.records.length)
      revisions.set(key, next)
      return Object.freeze({ stream: append.stream, revision: next.toString() })
    }),
  )
}

function receiptFor<Outcome extends RecordedOutcome>(
  envelope: Readonly<{
    position: Position
    operation: OperationRef
    inputDigest: string
  }>,
  outcome: Outcome,
  streams: readonly Readonly<{ stream: StreamRef; revision: Counter }>[],
): Receipt<Outcome> {
  return Object.freeze({
    position: envelope.position,
    operation: envelope.operation,
    inputDigest: envelope.inputDigest,
    outcome,
    streams,
  })
}

class JsonlWriter implements RecordWriter {
  readonly coordinationDomain: OpaqueId
  readonly writerEpoch: Counter
  private readonly preparedOperations = new WeakMap<object, OperationData>()
  private readonly preparedCommits = new WeakMap<object, CommitData>()
  private readonly operations = new Map<string, OperationEntry>()
  private readonly envelopes: CommitEnvelope[] = []
  private readonly durableRevisions = new Map<string, bigint>()
  private readonly assignedRevisions = new Map<string, bigint>()
  private readonly commitIds = new Set<string>()
  private readonly queue: QueuedCommit[] = []
  private pendingBytes = 0
  private logicalSeq = 0n
  private durableSeq = 0n
  private durableCommitId: OpaqueId | null = null
  private phase: 'open' | 'quarantined' | 'closing' | 'closed' | 'blocked' = 'open'
  private pumping = false
  private pumpTask: Promise<void> | null = null
  private closeTask: Promise<CloseResult> | null = null

  constructor(
    private readonly options: JsonlProviderOptions,
    private readonly diagnostics: Diagnostics,
    private readonly resources: ResourceSet,
    private readonly bindings: ReadonlyMap<string, NamespaceBinding>,
    epoch: bigint,
    recoveredEnvelopes: readonly CommitEnvelope[],
    private readonly onReleased: () => void,
  ) {
    this.coordinationDomain = options.coordinationDomain
    this.writerEpoch = epoch.toString()
    for (const envelope of recoveredEnvelopes) this.rememberRecovered(envelope)
  }

  private rememberRecovered(envelope: CommitEnvelope): void {
    this.envelopes.push(envelope)
    const seq = BigInt(envelope.position.seq)
    this.logicalSeq = seq
    this.durableSeq = seq
    this.durableCommitId = envelope.position.commitId
    this.commitIds.add(envelope.position.commitId)
    const streams = revisionsAfter(this.durableRevisions, envelope.appends)
    for (const stream of streams) {
      this.assignedRevisions.set(streamKey(stream.stream), BigInt(stream.revision))
    }
    const result: CommitResult =
      envelope.outcome.status === 'committed'
        ? Object.freeze({
            status: 'committed',
            receipt: receiptFor(envelope, envelope.outcome, streams),
          })
        : Object.freeze({
            status: 'conflict',
            conflict: envelope.outcome.conflict,
            receipt: receiptFor(envelope, envelope.outcome, streams),
          })
    this.operations.set(operationKey(envelope.operation), {
      canonicalInput: envelope.canonicalInput,
      operation: envelope.operation,
      submission: result,
    })
  }

  prepareOperation(operation: OperationRef, input: OperationInput): Checked<PreparedOperation> {
    const operationResult = parseData('OperationRef', operation, this.options.limits)
    if (!operationResult.ok) return operationResult
    const inputResult = copyJson(input, this.options.limits)
    if (!inputResult.ok) return inputResult
    const inputValue = inputResult.value
    if (inputValue === null || typeof inputValue !== 'object' || Array.isArray(inputValue)) {
      return failed('schema', 'operation input must be an object')
    }
    const object = inputValue as JsonObject
    const keys = [
      'format',
      'operationKind',
      'tenantId',
      'principal',
      'target',
      'arguments',
      'preconditions',
      'causality',
    ]
    if (
      Object.keys(object).length !== keys.length ||
      keys.some(key => !Object.hasOwn(object, key)) ||
      object.format !== 'core-operation/1' ||
      typeof object.operationKind !== 'string' ||
      object.operationKind.length === 0 ||
      (object.tenantId !== null &&
        (typeof object.tenantId !== 'string' || object.tenantId.length === 0))
    ) {
      return failed('schema', 'operation input does not match core-operation/1')
    }
    const principal = object.principal
    if (principal === null || typeof principal !== 'object' || Array.isArray(principal)) {
      return failed('schema', 'principal must be an object', '/principal')
    }
    const canonicalPrincipal = canonicalJson(principal)
    if (canonicalPrincipal !== operationResult.value.principalId) {
      return failed('schema', 'principalId must be the canonical principal', '/principal')
    }
    if (!this.bindings.has(operationResult.value.namespace)) {
      return failed('schema', 'operation namespace is not bound', '/operation/namespace')
    }
    const canonicalInput = canonicalJson(inputValue)
    const binding = this.bindings.get(operationResult.value.namespace)
    const probeScope =
      object.tenantId === null
        ? { kind: 'system' as const }
        : { kind: 'tenant' as const, tenantId: object.tenantId as string }
    if (binding === undefined || (probeScope.kind === 'system' && !binding.allowSystemScope)) {
      return failed('schema', 'operation scope is not allowed by the namespace binding')
    }
    const validationProbe: CommitEnvelope = {
      formatVersion: 'core-journal/1',
      position: {
        coordinationDomain: this.coordinationDomain,
        writerEpoch: this.writerEpoch,
        commitId: 'commit-probe',
        seq: '1',
      },
      operation: operationResult.value,
      inputEncoding: 'core-json/1',
      canonicalInput,
      inputDigest: digest(canonicalInput),
      appends: [
        {
          stream: {
            namespace: operationResult.value.namespace,
            owner: binding.owners[0]!,
            scope: probeScope,
            streamId: 'operation-probe',
          },
          expectedRevision: '0',
          records: [{ kind: 'operation.probe', version: '1', data: null }],
        },
      ],
      outcome: { status: 'committed', result: null },
      requiredUses: [],
    }
    const validated = encodeEnvelope(validationProbe, this.options.limits)
    if (!validated.ok) return validated
    const data: OperationData = Object.freeze({
      operation: operationResult.value,
      input: inputValue as unknown as OperationInput,
      canonicalInput,
      inputDigest: digest(canonicalInput),
    })
    const token = Object.freeze({
      operation: data.operation,
      canonicalInput: data.canonicalInput,
    })
    this.preparedOperations.set(token, data)
    return passed(asPreparedOperation(token))
  }

  prepare(request: CommitRequest): Checked<PreparedCommit> {
    if (this.phase !== 'open') return failed('schema', 'writer is not open')
    if (request === null || typeof request !== 'object') {
      return failed('schema', 'commit request must be an object')
    }
    const requestKeys = Object.keys(request)
    if (
      requestKeys.length !== 4 ||
      ['operation', 'appends', 'result', 'requiredUses'].some(key => !Object.hasOwn(request, key))
    ) {
      return failed('schema', 'commit request contains missing or unknown fields')
    }
    const operationData = this.preparedOperations.get(request.operation as object)
    if (operationData === undefined) {
      return failed('schema', 'prepared operation was not issued by this writer', '/operation')
    }
    const copied = copyJson(
      {
        appends: request.appends,
        result: request.result,
        requiredUses: request.requiredUses,
      },
      this.options.limits,
    )
    if (!copied.ok) return copied
    const body = copied.value as JsonObject
    if (!Array.isArray(body.appends) || !Array.isArray(body.requiredUses)) {
      return failed('schema', 'appends and requiredUses must be arrays')
    }
    const appends = body.appends as unknown as readonly StreamAppend[]
    const requiredUses = body.requiredUses as unknown as CommitRequest['requiredUses']
    const binding = this.bindings.get(operationData.operation.namespace)
    if (binding === undefined || appends.length === 0) {
      return failed('schema', 'commit requires a bound namespace and at least one append')
    }
    const probe: CommitEnvelope = {
      formatVersion: 'core-journal/1',
      position: {
        coordinationDomain: this.coordinationDomain,
        writerEpoch: this.writerEpoch,
        commitId: 'commit-probe',
        seq: '1',
      },
      operation: operationData.operation,
      inputEncoding: 'core-json/1',
      canonicalInput: operationData.canonicalInput,
      inputDigest: operationData.inputDigest,
      appends,
      outcome: { status: 'committed', result: body.result as JsonValue },
      requiredUses,
    }
    const encoded = encodeEnvelope(probe, this.options.limits)
    if (!encoded.ok) return encoded
    let previous: string | undefined
    const owners = new Set<string>()
    for (const append of appends) {
      const key = streamKey(append.stream)
      if (previous !== undefined && key <= previous) {
        return failed('schema', 'appends must be in unique canonical stream order', '/appends')
      }
      previous = key
      if (
        append.stream.namespace !== operationData.operation.namespace ||
        !binding.owners.includes(append.stream.owner)
      ) {
        return failed('schema', 'stream namespace or owner is not bound', '/appends')
      }
      if (
        operationData.input.tenantId === null
          ? append.stream.scope.kind !== 'system' || !binding.allowSystemScope
          : append.stream.scope.kind !== 'tenant' ||
            append.stream.scope.tenantId !== operationData.input.tenantId
      ) {
        return failed('schema', 'stream scope does not match the operation tenant', '/appends')
      }
      owners.add(append.stream.owner)
    }
    const useKeys = new Set<string>()
    for (const use of requiredUses) {
      if (!owners.has(use.recordOwner)) {
        return failed('schema', 'required use owner must own an append', '/requiredUses')
      }
      const key = canonicalJson(use.binding as unknown as JsonValue)
      if (useKeys.has(key)) return failed('schema', 'required use binding must be unique')
      useKeys.add(key)
    }
    const data: CommitData = Object.freeze({
      ...operationData,
      appends,
      result: body.result as JsonValue,
      owners: Object.freeze([...owners].sort()),
      requiredUses,
      diagnosticId: safeDiagnosticId(this.diagnostics),
    })
    const token = Object.freeze({
      operation: data.operation,
      canonicalInput: data.canonicalInput,
      owners: data.owners,
      requiredUses: data.requiredUses,
    })
    this.preparedCommits.set(token, data)
    return passed(asPreparedCommit(token))
  }

  lookupPrepared(operation: PreparedOperation): Submission | Readonly<{ status: 'not_seen' }> {
    const data = this.preparedOperations.get(operation as object)
    if (data === undefined)
      return rejected('invalid', 'prepared operation belongs to another writer')
    const existing = this.operations.get(operationKey(data.operation))
    if (existing !== undefined) {
      return existing.canonicalInput === data.canonicalInput
        ? existing.submission
        : Object.freeze({
            status: 'conflict',
            conflict: Object.freeze({
              kind: 'operation_input' as const,
              operation: data.operation,
            }),
            receipt: null,
          })
    }
    if (this.phase !== 'open') return unavailable('writer is not accepting submissions')
    return Object.freeze({ status: 'not_seen' })
  }

  commit(prepared: PreparedCommit): Submission {
    const data = this.preparedCommits.get(prepared as object)
    if (data === undefined)
      return rejected('invalid', 'prepared commit was not issued by this writer')
    const key = operationKey(data.operation)
    const existing = this.operations.get(key)
    if (existing !== undefined) {
      return existing.canonicalInput === data.canonicalInput
        ? existing.submission
        : Object.freeze({
            status: 'conflict',
            conflict: Object.freeze({
              kind: 'operation_input' as const,
              operation: data.operation,
            }),
            receipt: null,
          })
    }
    if (this.phase !== 'open') return unavailable('writer is not accepting submissions')
    if (this.queue.length >= this.options.limits.maxPendingCommits) {
      return rejected('capacity', 'pending commit count limit reached')
    }

    const mismatches = data.appends
      .filter(append => {
        const expected = counter(append.expectedRevision)
        return (
          expected === undefined ||
          expected !== (this.assignedRevisions.get(streamKey(append.stream)) ?? 0n)
        )
      })
      .map(append =>
        Object.freeze({
          stream: append.stream,
          revision: (this.assignedRevisions.get(streamKey(append.stream)) ?? 0n).toString(),
        }),
      )
      .sort((left, right) => streamKey(left.stream).localeCompare(streamKey(right.stream)))
    const conflict: RevisionConflict | undefined =
      mismatches.length === 0
        ? undefined
        : Object.freeze({ kind: 'revision', currents: Object.freeze(mismatches) })
    const actualAppends: readonly StreamAppend[] =
      conflict === undefined
        ? data.appends
        : Object.freeze([
            Object.freeze({
              stream: Object.freeze({
                namespace: 'core.records',
                owner: 'durable-records',
                scope:
                  data.input.tenantId === null
                    ? Object.freeze({ kind: 'system' as const })
                    : Object.freeze({ kind: 'tenant' as const, tenantId: data.input.tenantId }),
                streamId: 'operation-outcomes',
              }),
              expectedRevision: (
                this.assignedRevisions.get(
                  streamKey({
                    namespace: 'core.records',
                    owner: 'durable-records',
                    scope:
                      data.input.tenantId === null
                        ? { kind: 'system' as const }
                        : { kind: 'tenant' as const, tenantId: data.input.tenantId },
                    streamId: 'operation-outcomes',
                  }),
                ) ?? 0n
              ).toString(),
              records: Object.freeze([
                Object.freeze({
                  kind: 'operation.conflict',
                  version: '1',
                  data: conflict as unknown as JsonValue,
                }),
              ]),
            }),
          ])
    const seq = this.logicalSeq + 1n
    const position: Position = Object.freeze({
      coordinationDomain: this.coordinationDomain,
      writerEpoch: this.writerEpoch,
      commitId: `commit-${seq.toString()}`,
      seq: seq.toString(),
    })
    const outcome: RecordedOutcome =
      conflict === undefined
        ? Object.freeze({ status: 'committed', result: data.result })
        : Object.freeze({ status: 'conflict', conflict })
    const envelope: CommitEnvelope = Object.freeze({
      formatVersion: 'core-journal/1',
      position,
      operation: data.operation,
      inputEncoding: 'core-json/1',
      canonicalInput: data.canonicalInput,
      inputDigest: data.inputDigest,
      appends: actualAppends,
      outcome,
      requiredUses: conflict === undefined ? data.requiredUses : Object.freeze([]),
    })
    const encoded = encodeEnvelope(envelope, this.options.limits)
    if (!encoded.ok)
      return rejected('capacity', encoded.issues[0]?.message ?? 'encoded commit exceeds limits')
    if (this.pendingBytes + encoded.value.byteLength > this.options.limits.maxPendingBytes) {
      return rejected('capacity', 'pending byte limit reached')
    }

    const streamResults = revisionsAfter(this.assignedRevisions, actualAppends)
    const final: CommitResult =
      envelope.outcome.status === 'committed'
        ? Object.freeze({
            status: 'committed',
            receipt: receiptFor(envelope, envelope.outcome, streamResults),
          })
        : Object.freeze({
            status: 'conflict',
            conflict: envelope.outcome.conflict,
            receipt: receiptFor(envelope, envelope.outcome, streamResults),
          })
    let resolveCompletion: (result: CommitResult) => void = () => undefined
    const completion = new Promise<CommitResult>(resolvePromise => {
      resolveCompletion = resolvePromise
    })
    const pending: PendingCommit = Object.freeze({
      status: 'pending_durability',
      position,
      operation: data.operation,
      disposition: conflict === undefined ? 'apply' : 'record_conflict',
      completion,
    })
    const queued: QueuedCommit = {
      data,
      envelope,
      line: encoded.value,
      pending,
      final,
      diagnosticId: data.diagnosticId,
      resolve: resolveCompletion,
    }
    this.logicalSeq = seq
    this.pendingBytes += queued.line.byteLength
    this.queue.push(queued)
    this.operations.set(key, {
      canonicalInput: data.canonicalInput,
      operation: data.operation,
      submission: pending,
    })
    this.schedulePump()
    return pending
  }

  private schedulePump(): void {
    if (this.pumping) return
    this.pumping = true
    setImmediate(() => {
      this.pumpTask = this.pump().catch(error => {
        this.failQueue(error)
      })
    })
  }

  private async append(line: Uint8Array): Promise<void> {
    const handle = this.resources.journal
    if (handle === null || this.resources.journalState !== 'held') {
      throw new Error('journal handle is unavailable')
    }
    let offset = 0
    while (offset < line.byteLength) {
      const result = await handle.write(line, offset, line.byteLength - offset, null)
      if (result.bytesWritten <= 0) throw new Error('journal write made no progress')
      offset += result.bytesWritten
    }
    await handle.sync()
  }

  private async pump(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const current = this.queue[0]
        if (current === undefined) break
        if (this.phase === 'quarantined' || this.phase === 'blocked') {
          this.failQueue(new Error('writer quarantined before durability'))
          break
        }
        try {
          await this.append(current.line)
        } catch (error) {
          this.phase = 'quarantined'
          this.failQueue(error)
          break
        }
        this.queue.shift()
        this.pendingBytes -= current.line.byteLength
        this.envelopes.push(current.envelope)
        revisionsAfter(this.durableRevisions, current.envelope.appends)
        this.durableSeq = BigInt(current.envelope.position.seq)
        this.durableCommitId = current.envelope.position.commitId
        this.commitIds.add(current.envelope.position.commitId)
        const entry = this.operations.get(operationKey(current.data.operation))
        if (entry !== undefined) entry.submission = current.final
        current.resolve(current.final)
        safeLog(this.diagnostics, diagnosticContext(this.diagnostics, current.data), {
          component: 'storage.jsonl',
          phase: 'durability',
          code: 'COMMIT_DURABLE',
          level: 'info',
          position: current.envelope.position,
          logical: this.logicalWatermark(),
          durable: this.durableWatermark(),
          measures: { queueDepth: this.queue.length, pendingBytes: this.pendingBytes },
        })
      }
    } finally {
      this.pumping = false
      this.pumpTask = null
    }
  }

  private failQueue(error: unknown): void {
    const reason = systemCode(error) ?? 'JOURNAL_DURABILITY_UNKNOWN'
    for (const queued of this.queue.splice(0)) {
      this.pendingBytes -= queued.line.byteLength
      const result = unknown(queued.data.operation, queued.diagnosticId)
      const entry = this.operations.get(operationKey(queued.data.operation))
      if (entry !== undefined) entry.submission = result
      queued.resolve(result)
      safeLog(this.diagnostics, diagnosticContext(this.diagnostics, queued.data), {
        component: 'storage.jsonl',
        phase: 'durability',
        code: reason,
        level: 'error',
        diagnosticId: queued.diagnosticId,
        position: queued.envelope.position,
        logical: this.logicalWatermark(),
        durable: this.durableWatermark(),
      })
    }
  }

  quarantine(diagnosticId: OpaqueId): void {
    if (this.phase !== 'open') return
    this.phase = 'quarantined'
    queueMicrotask(() => {
      safeLog(this.diagnostics, diagnosticContext(this.diagnostics), {
        component: 'storage.jsonl',
        phase: 'control',
        code: 'WRITER_QUARANTINED',
        level: 'error',
        diagnosticId,
        logical: this.logicalWatermark(),
        durable: this.durableWatermark(),
      })
    })
  }

  private durableWatermark(): Watermark {
    return watermark(this.coordinationDomain, this.durableSeq, this.durableCommitId)
  }

  private logicalWatermark(): Watermark {
    const commitId = this.logicalSeq === this.durableSeq ? this.durableCommitId : null
    return watermark(this.coordinationDomain, this.logicalSeq, commitId)
  }

  async readHead(streams: readonly StreamRef[]): Promise<ReadResult<Head>> {
    const result = streams.map(stream =>
      Object.freeze({
        stream,
        revision: (this.durableRevisions.get(streamKey(stream)) ?? 0n).toString(),
      }),
    )
    return Object.freeze({
      status: 'read',
      value: Object.freeze({ watermark: this.durableWatermark(), streams: Object.freeze(result) }),
    })
  }

  async readRange(
    query: Readonly<{ afterSeq: Counter; through: Watermark; limit: number }>,
  ): Promise<
    ReadResult<
      Readonly<{
        envelopes: readonly CommitEnvelope[]
        through: Watermark
        nextAfterSeq: Counter
        complete: boolean
      }>
    >
  > {
    const after = counter(query.afterSeq)
    const through = counter(query.through.seq)
    if (
      after === undefined ||
      through === undefined ||
      query.through.coordinationDomain !== this.coordinationDomain ||
      !Number.isSafeInteger(query.limit) ||
      query.limit <= 0 ||
      after > through
    ) {
      return Object.freeze({
        status: 'rejected',
        reason: Object.freeze({ code: 'invalid', message: 'invalid range or watermark' }),
      })
    }
    if (through > this.durableSeq) {
      return Object.freeze({ status: 'not_at_watermark', available: this.durableWatermark() })
    }
    const expectedCommit =
      through === 0n ? null : this.envelopes[Number(through - 1n)]?.position.commitId
    if (expectedCommit === undefined || expectedCommit !== query.through.commitId) {
      return Object.freeze({
        status: 'rejected',
        reason: Object.freeze({ code: 'invalid', message: 'watermark commit does not match seq' }),
      })
    }
    const selected = this.envelopes
      .filter(envelope => {
        const seq = BigInt(envelope.position.seq)
        return seq > after && seq <= through
      })
      .slice(0, query.limit)
    const next = selected.at(-1)?.position.seq ?? query.afterSeq
    return Object.freeze({
      status: 'read',
      value: Object.freeze({
        envelopes: Object.freeze(selected),
        through: query.through,
        nextAfterSeq: next,
        complete: BigInt(next) === through,
      }),
    })
  }

  async lookupOperation(operation: OperationRef): Promise<OperationLookup> {
    const parsed = parseData('OperationRef', operation, this.options.limits)
    if (!parsed.ok)
      return Object.freeze({ status: 'unavailable', reason: 'invalid operation identity' })
    const entry = this.operations.get(operationKey(parsed.value))
    if (entry === undefined) {
      if (this.phase === 'open' || this.phase === 'closing') {
        return Object.freeze({ status: 'not_committed', verifiedThrough: this.durableWatermark() })
      }
      return Object.freeze({
        status: 'unavailable',
        reason: 'writer no longer holds current prefix',
      })
    }
    const result = entry.submission
    if (result.status === 'pending_durability') {
      return Object.freeze({
        status: 'pending_durability',
        position: result.position,
        watermark: this.durableWatermark(),
      })
    }
    if (result.status === 'committed') {
      return Object.freeze({
        status: 'committed',
        receipt: result.receipt,
        watermark: this.durableWatermark(),
      })
    }
    if (
      result.status === 'conflict' &&
      result.receipt !== null &&
      result.conflict.kind === 'revision'
    ) {
      return Object.freeze({
        status: 'conflict',
        conflict: result.conflict,
        receipt: result.receipt,
        watermark: this.durableWatermark(),
      })
    }
    if (result.status === 'unknown') return result
    return Object.freeze({ status: 'unavailable', reason: 'operation has no durable result' })
  }

  closeWriter(): Promise<CloseResult> {
    if (this.closeTask !== null) return this.closeTask
    if (this.phase === 'closed') {
      return Promise.resolve(
        Object.freeze({ status: 'closed', watermark: this.durableWatermark() }),
      )
    }
    if (this.phase === 'open') this.phase = 'closing'
    this.closeTask = this.closeInternal()
    return this.closeTask
  }

  private async closeInternal(): Promise<CloseResult> {
    while (this.pumping || this.queue.length > 0) {
      const task = this.pumpTask
      if (task !== null) await task
      else await new Promise<void>(resolvePromise => setImmediate(resolvePromise))
    }
    let synchronized = true
    if (this.resources.journal !== null && this.resources.journalState === 'held') {
      try {
        await this.resources.journal.sync()
      } catch {
        synchronized = false
      }
    }
    const released = await closeResources(this.resources)
    if (released) {
      localOwners.delete(resolve(this.options.directory))
      this.onReleased()
    }
    if (synchronized && released && this.phase !== 'quarantined') {
      this.phase = 'closed'
      return Object.freeze({ status: 'closed', watermark: this.durableWatermark() })
    }
    this.phase = 'blocked'
    return Object.freeze({
      status: 'blocked',
      watermark: this.durableWatermark(),
      diagnosticId: safeDiagnosticId(this.diagnostics),
      pending: Object.freeze(
        [...this.operations.values()]
          .filter(
            entry =>
              entry.submission.status === 'unknown' ||
              entry.submission.status === 'pending_durability',
          )
          .map(entry => entry.operation),
      ),
      lockHeld: this.resources.lockState === 'held' || this.resources.lockState === 'unknown',
    })
  }
}

type ScanResult = Readonly<{
  envelopes: readonly CommitEnvelope[]
  revisions: ReadonlyMap<string, bigint>
  epoch: bigint
  seq: bigint
  commitId: OpaqueId | null
}>

async function preserveAndRepairTail(
  handle: FileHandle,
  directory: string,
  original: Buffer,
  completeBytes: number,
): Promise<void> {
  const evidence = join(directory, `journal.recovery-${randomUUID()}.jsonl`)
  await writeSyncedFile(evidence, original)
  await syncDirectory(directory)
  const preserved = await readFile(evidence)
  if (!preserved.equals(original)) throw new Error('recovery evidence verification failed')
  await handle.truncate(completeBytes)
  await handle.sync()
}

async function scanJournal(handle: FileHandle, options: JsonlProviderOptions): Promise<ScanResult> {
  const bytes = await handle.readFile()
  const lastLf = bytes.lastIndexOf(0x0a)
  const completeBytes = lastLf < 0 ? 0 : lastLf + 1
  if (completeBytes !== bytes.byteLength) {
    await preserveAndRepairTail(handle, options.directory, bytes, completeBytes)
  }
  const complete = bytes.subarray(0, completeBytes)
  const envelopes: CommitEnvelope[] = []
  const revisions = new Map<string, bigint>()
  const operations = new Set<string>()
  const commitIds = new Set<string>()
  let start = 0
  let seq = 0n
  let epoch = 0n
  for (let index = 0; index < complete.byteLength; index += 1) {
    if (complete[index] !== 0x0a) continue
    const line = complete.subarray(start, index + 1)
    start = index + 1
    const decoded = decodeLine(line, options.limits)
    if (!decoded.ok) throw new Error(`invalid complete journal line at seq ${seq + 1n}`)
    const envelope = decoded.value.envelope
    const expectedSeq = seq + 1n
    if (
      envelope.position.coordinationDomain !== options.coordinationDomain ||
      counter(envelope.position.seq) !== expectedSeq ||
      commitIds.has(envelope.position.commitId) ||
      operations.has(operationKey(envelope.operation))
    ) {
      throw new Error(`non-contiguous journal identity at seq ${expectedSeq}`)
    }
    const epochEntry = envelope.operation.namespace === 'core.writer'
    if (epochEntry) {
      if (!isEpochEnvelope(envelope, epoch + 1n, options.coordinationDomain)) {
        throw new Error(`invalid writer epoch at seq ${expectedSeq}`)
      }
      epoch += 1n
    } else if (
      epoch === 0n ||
      envelope.position.writerEpoch !== epoch.toString() ||
      RESERVED_NAMESPACES.has(envelope.operation.namespace) ||
      (envelope.outcome.status === 'committed' &&
        envelope.appends.some(append => RESERVED_NAMESPACES.has(append.stream.namespace)))
    ) {
      throw new Error(`invalid ordinary writer epoch or reserved namespace at seq ${expectedSeq}`)
    }
    for (const append of envelope.appends) {
      const key = streamKey(append.stream)
      if (counter(append.expectedRevision) !== (revisions.get(key) ?? 0n)) {
        throw new Error(`stream revision gap at seq ${expectedSeq}`)
      }
    }
    revisionsAfter(revisions, envelope.appends)
    envelopes.push(envelope)
    operations.add(operationKey(envelope.operation))
    commitIds.add(envelope.position.commitId)
    seq = expectedSeq
  }
  await handle.sync()
  return Object.freeze({
    envelopes: Object.freeze(envelopes),
    revisions,
    epoch,
    seq,
    commitId: envelopes.at(-1)?.position.commitId ?? null,
  })
}

async function openStableFile(
  path: string,
  kind: 'journal' | 'lock',
  requireEmpty = false,
): Promise<Readonly<{ handle: FileHandle; created: boolean }>> {
  let created = false
  let handle: FileHandle
  try {
    handle = await open(path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW)
  } catch (error) {
    if (systemCode(error) !== 'ENOENT') throw error
    handle = await open(
      path,
      constants.O_RDWR |
        constants.O_APPEND |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    created = true
  }
  try {
    await handle.chmod(0o600)
    const [opened, linked] = await Promise.all([
      handle.stat({ bigint: true }),
      lstat(path, { bigint: true }),
    ])
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      linked.isSymbolicLink() ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino ||
      (requireEmpty && (opened.size !== 0n || linked.size !== 0n))
    ) {
      throw new Error('stable file identity check failed')
    }
  } catch {
    throw new StableFileValidationError(kind, handle)
  }
  return Object.freeze({ handle, created })
}

class ProviderReader implements RecordReader {
  current: JsonlWriter | null = null
  reason = 'writer prefix has not been acquired and verified'

  readHead(streams: readonly StreamRef[]): Promise<ReadResult<Head>> {
    return (
      this.current?.readHead(streams) ??
      Promise.resolve(Object.freeze({ status: 'unavailable', reason: this.reason }))
    )
  }

  readRange(
    query: Parameters<RecordReader['readRange']>[0],
  ): ReturnType<RecordReader['readRange']> {
    return (
      this.current?.readRange(query) ??
      Promise.resolve(Object.freeze({ status: 'unavailable', reason: this.reason }))
    )
  }

  lookupOperation(operation: OperationRef): Promise<OperationLookup> {
    return (
      this.current?.lookupOperation(operation) ??
      Promise.resolve(Object.freeze({ status: 'unavailable', reason: this.reason }))
    )
  }
}

class JsonlProvider implements RecordProvider {
  readonly reader: ProviderReader
  private acquiring = false
  private cleanup: RetainedCleanup | null = null
  private writer: JsonlWriter | null = null
  private readonly domainPath: string
  private readonly ownerToken = Object.freeze({})

  constructor(
    private readonly options: JsonlProviderOptions,
    private readonly diagnostics: Diagnostics,
  ) {
    this.domainPath = resolve(options.directory)
    this.reader = new ProviderReader()
  }

  async acquireWriter(): Promise<AcquireResult> {
    if (this.cleanup !== null && this.cleanup.inspect().phase !== 'released') {
      return Object.freeze({
        status: 'unavailable',
        reason: 'previous acquisition cleanup is retained',
        diagnosticId: this.cleanup.inspect().diagnosticId,
        cleanup: Object.freeze({ status: 'retained', owner: this.cleanup }),
      })
    }
    if (this.acquiring || this.writer !== null || localOwners.has(this.domainPath)) {
      return Object.freeze({ status: 'busy' })
    }
    this.acquiring = true
    localOwners.set(this.domainPath, this.ownerToken)
    const resources: ResourceSet = {
      journal: null,
      lock: null,
      lockState: 'released',
      journalState: 'released',
      unknownDescriptor: false,
    }
    let lockAcquired = false
    const diagnosticId = safeDiagnosticId(this.diagnostics)
    try {
      const directoryStat = await lstat(this.domainPath)
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new Error('provider directory must be a real directory')
      }
      if ((await realpath(this.domainPath)) !== this.domainPath) {
        throw new Error('provider directory must use its canonical path')
      }
      const lockPath = join(this.domainPath, LOCK_FILE)
      const lock = await openStableFile(lockPath, 'lock', true)
      resources.lock = lock.handle
      if (lock.created) await syncDirectory(this.domainPath)
      try {
        await flock(lock.handle.fd, 'exnb')
        lockAcquired = true
        resources.lockState = 'held'
        const [opened, linked] = await Promise.all([
          lock.handle.stat({ bigint: true }),
          lstat(lockPath, { bigint: true }),
        ])
        if (
          !linked.isFile() ||
          linked.isSymbolicLink() ||
          linked.size !== 0n ||
          opened.dev !== linked.dev ||
          opened.ino !== linked.ino
        ) {
          throw new Error('lock identity changed after acquisition')
        }
      } catch (error) {
        const code = systemCode(error)
        if (code === 'EAGAIN' || code === 'EWOULDBLOCK' || code === 'EBUSY') {
          const released = await closeResources(resources)
          if (released) {
            localOwners.delete(this.domainPath)
            return Object.freeze({ status: 'busy' })
          }
          throw new Error('busy acquisition left uncertain cleanup')
        }
        throw error
      }
      const journal = await openStableFile(join(this.domainPath, JOURNAL_FILE), 'journal')
      resources.journal = journal.handle
      resources.journalState = 'held'
      if (lock.created || journal.created) await syncDirectory(this.domainPath)
      const scan = await scanJournal(journal.handle, this.options)
      const nextEpoch = scan.epoch + 1n
      const epoch = epochEnvelope(
        this.options.coordinationDomain,
        nextEpoch,
        scan.seq + 1n,
        scan.revisions.get(
          streamKey({
            namespace: 'core.writer',
            owner: 'durable-records',
            scope: { kind: 'system' },
            streamId: 'writer-epochs',
          }),
        ) ?? 0n,
      )
      const encoded = encodeEnvelope(epoch, this.options.limits)
      if (!encoded.ok) throw new Error(encoded.issues[0]?.message ?? 'epoch encoding failed')
      let offset = 0
      while (offset < encoded.value.byteLength) {
        const write = await journal.handle.write(
          encoded.value,
          offset,
          encoded.value.byteLength - offset,
          null,
        )
        if (write.bytesWritten <= 0) throw new Error('epoch write made no progress')
        offset += write.bytesWritten
      }
      await journal.handle.sync()
      if (journal.created) await syncDirectory(this.domainPath)
      const revisions = new Map(scan.revisions)
      revisionsAfter(revisions, epoch.appends)
      const writer = new JsonlWriter(
        this.options,
        this.diagnostics,
        resources,
        bindingMap(this.options.bindings),
        nextEpoch,
        [...scan.envelopes, epoch],
        () => {
          if (this.writer === writer) this.writer = null
        },
      )
      this.writer = writer
      this.reader.current = writer
      safeLog(this.diagnostics, diagnosticContext(this.diagnostics), {
        component: 'storage.jsonl',
        phase: 'acquire',
        code: 'WRITER_ACQUIRED',
        level: 'info',
        durable: watermark(this.options.coordinationDomain, scan.seq + 1n, epoch.position.commitId),
      })
      return Object.freeze({
        status: 'acquired',
        writer,
        recovered: watermark(
          this.options.coordinationDomain,
          scan.seq + 1n,
          epoch.position.commitId,
        ),
      })
    } catch (error) {
      if (error instanceof StableFileValidationError) {
        if (error.kind === 'lock') {
          resources.lock = error.handle
          resources.lockState = 'released'
        } else {
          resources.journal = error.handle
          resources.journalState = 'held'
        }
      }
      this.reader.reason = 'journal prefix recovery failed'
      const released = await closeResources(resources)
      if (released) {
        localOwners.delete(this.domainPath)
        safeLog(this.diagnostics, diagnosticContext(this.diagnostics), {
          component: 'storage.jsonl',
          phase: 'acquire',
          code: systemCode(error) ?? 'ACQUIRE_FAILED',
          level: 'error',
          diagnosticId,
        })
        return Object.freeze({
          status: 'unavailable',
          reason: systemCode(error) ?? (error instanceof Error ? error.message : 'acquire failed'),
          diagnosticId,
          cleanup: Object.freeze({ status: 'released' }),
        })
      }
      const cleanupId = safeDiagnosticId(this.diagnostics)
      const cleanup = new RetainedCleanup(
        this.options.coordinationDomain,
        resources,
        diagnosticId,
        cleanupId,
        () => {
          localOwners.delete(this.domainPath)
          if (this.cleanup === cleanup) this.cleanup = null
        },
      )
      this.cleanup = cleanup
      safeLog(this.diagnostics, diagnosticContext(this.diagnostics), {
        component: 'storage.jsonl',
        phase: 'acquire_cleanup',
        code: 'ACQUISITION_CLEANUP_RETAINED',
        level: 'error',
        diagnosticId,
      })
      return Object.freeze({
        status: 'unavailable',
        reason: lockAcquired ? 'acquisition failed with retained cleanup' : 'lock cleanup unknown',
        diagnosticId,
        cleanup: Object.freeze({ status: 'retained', owner: cleanup }),
      })
    } finally {
      this.acquiring = false
    }
  }
}

export function createJsonlProvider(
  options: JsonlProviderOptions,
  diagnostics: Diagnostics,
): RecordProvider {
  validateOptions(options)
  return new JsonlProvider(
    Object.freeze({
      ...options,
      directory: resolve(options.directory),
      bindings: Object.freeze(
        options.bindings.map(binding =>
          Object.freeze({ ...binding, owners: Object.freeze([...binding.owners]) }),
        ),
      ),
      limits: Object.freeze({ ...options.limits }),
    }),
    diagnostics,
  )
}
