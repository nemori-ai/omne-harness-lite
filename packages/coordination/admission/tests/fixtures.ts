import type {
  Diagnostics,
  DiagnosticContext,
  DiagnosticPoint,
  DiagnosticSpan,
} from '@omne-harness-lite/diagnostics'
import type { Checked, JsonValue, OpaqueId, OperationRef } from '@omne-harness-lite/work-data'
import type {
  CloseResult,
  CommitRequest,
  CommitResult,
  ConflictReceipt,
  Head,
  OperationInput,
  OperationLookup,
  PendingCommit,
  Position,
  PreparedCommit,
  PreparedOperation,
  ReadResult,
  Receipt,
  RecordPreparation,
  RecordWriter,
  RevisionConflict,
  StreamAppend,
  StreamRef,
  UseRequirement,
  Watermark,
} from '@omne-harness-lite/records'

const DEFAULT_WATERMARK: Watermark = Object.freeze({
  coordinationDomain: 'test-domain',
  seq: '0',
  commitId: null,
})

function checked<T>(value: T): Checked<T> {
  return Object.freeze({ ok: true, value })
}

function rejected(code: 'invalid' | 'closed', message: string): CommitResult {
  return Object.freeze({
    status: 'rejected',
    reason: Object.freeze({ code, message }),
    receipt: null,
  })
}

function operationKey(operation: OperationRef): string {
  return `${operation.namespace}\u0000${operation.principalId}\u0000${operation.operationId}`
}

function streamKey(stream: StreamRef): string {
  return JSON.stringify(stream)
}

function revisionConflict(
  appends: readonly StreamAppend[],
  revisions: ReadonlyMap<string, bigint>,
): RevisionConflict {
  return Object.freeze({
    kind: 'revision',
    currents: Object.freeze(
      appends
        .filter(
          append =>
            BigInt(append.expectedRevision) !== (revisions.get(streamKey(append.stream)) ?? 0n),
        )
        .map(append =>
          Object.freeze({
            stream: append.stream,
            revision: String(revisions.get(streamKey(append.stream)) ?? 0n),
          }),
        ),
    ),
  })
}

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}>

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  if (resolvePromise === undefined || rejectPromise === undefined)
    throw new Error('deferred setup failed')
  return Object.freeze({ promise, resolve: resolvePromise, reject: rejectPromise })
}

type PreparedState = Readonly<{
  token: PreparedCommit
  request: CommitRequest
}>

type PendingState = {
  readonly prepared: PreparedState
  readonly pending: PendingCommit
  readonly disposition: PendingCommit['disposition']
  readonly deferred: Deferred<CommitResult>
  readonly conflict: RevisionConflict | null
  settled: CommitResult | null
}

type OperationState = Readonly<{
  canonicalInput: string
  submission: PendingCommit | CommitResult
}>

export class ControlledWriter implements RecordWriter {
  readonly coordinationDomain: OpaqueId = 'test-domain'
  readonly writerEpoch = '1'
  readonly commitInputs: PreparedCommit[] = []
  readonly quarantines: OpaqueId[] = []
  readonly pending: PendingState[] = []
  pumpStarts = 0
  closeCalls = 0

  private readonly preparedOperations = new WeakSet<object>()
  private readonly preparedCommits = new WeakMap<object, PreparedState>()
  private readonly operations = new Map<string, OperationState>()
  private readonly revisions = new Map<string, bigint>()
  private accepting = true
  private nextSeq = 1n
  private durable = DEFAULT_WATERMARK

  prepareOperation(operation: OperationRef, input: OperationInput): Checked<PreparedOperation> {
    const token = Object.freeze({
      operation: Object.freeze({ ...operation }),
      canonicalInput: JSON.stringify(input),
    }) as unknown as PreparedOperation
    this.preparedOperations.add(token)
    return checked(token)
  }

  prepare(request: CommitRequest): Checked<PreparedCommit> {
    if (!this.preparedOperations.has(request.operation)) {
      return Object.freeze({
        ok: false,
        issues: Object.freeze([
          Object.freeze({ path: '/operation', code: 'schema', message: 'foreign operation token' }),
        ]),
      })
    }
    const owners = Object.freeze(
      [...new Set(request.appends.map(append => append.stream.owner))].sort(),
    )
    const token = Object.freeze({
      operation: request.operation.operation,
      canonicalInput: request.operation.canonicalInput,
      owners,
      requiredUses: Object.freeze([...request.requiredUses]),
    }) as unknown as PreparedCommit
    const state = Object.freeze({ token, request })
    this.preparedCommits.set(token, state)
    return checked(token)
  }

  lookupPrepared(
    operation: PreparedOperation,
  ): PendingCommit | CommitResult | Readonly<{ status: 'not_seen' }> {
    if (!this.preparedOperations.has(operation))
      return rejected('invalid', 'foreign operation token')
    const prior = this.operations.get(operationKey(operation.operation))
    if (prior === undefined) {
      return this.accepting
        ? Object.freeze({ status: 'not_seen' })
        : Object.freeze({ status: 'unavailable', reason: 'writer unavailable' })
    }
    if (prior.canonicalInput !== operation.canonicalInput) {
      return Object.freeze({
        status: 'conflict',
        conflict: Object.freeze({ kind: 'operation_input', operation: operation.operation }),
        receipt: null,
      })
    }
    return prior.submission
  }

  commit(prepared: PreparedCommit): PendingCommit | CommitResult {
    this.commitInputs.push(prepared)
    const state = this.preparedCommits.get(prepared)
    if (state === undefined) return rejected('invalid', 'foreign commit token')
    if (!this.accepting)
      return Object.freeze({ status: 'unavailable', reason: 'writer unavailable' })

    const key = operationKey(prepared.operation)
    const prior = this.operations.get(key)
    if (prior !== undefined) {
      if (prior.canonicalInput === prepared.canonicalInput) return prior.submission
      return Object.freeze({
        status: 'conflict',
        conflict: Object.freeze({ kind: 'operation_input', operation: prepared.operation }),
        receipt: null,
      })
    }

    const conflict = revisionConflict(state.request.appends, this.revisions)
    const disposition: PendingCommit['disposition'] =
      conflict.currents.length === 0 ? 'apply' : 'record_conflict'
    const position: Position = Object.freeze({
      coordinationDomain: this.coordinationDomain,
      writerEpoch: this.writerEpoch,
      commitId: `commit-${this.nextSeq}`,
      seq: String(this.nextSeq),
    })
    this.nextSeq += 1n
    const completion = deferred<CommitResult>()
    const pending = Object.freeze({
      status: 'pending_durability',
      position,
      operation: prepared.operation,
      disposition,
      completion: completion.promise,
    }) satisfies PendingCommit
    const pendingState: PendingState = {
      prepared: state,
      pending,
      disposition,
      deferred: completion,
      conflict: disposition === 'record_conflict' ? conflict : null,
      settled: null,
    }
    this.pending.push(pendingState)
    this.operations.set(
      key,
      Object.freeze({ canonicalInput: prepared.canonicalInput, submission: pending }),
    )
    if (disposition === 'apply') {
      for (const append of state.request.appends) {
        const key = streamKey(append.stream)
        this.revisions.set(key, (this.revisions.get(key) ?? 0n) + BigInt(append.records.length))
      }
    }
    queueMicrotask(() => {
      this.pumpStarts += 1
    })
    return pending
  }

  settle(index: number, result?: CommitResult): CommitResult {
    const state = this.pending[index]
    if (state === undefined) throw new RangeError(`unknown pending index ${index}`)
    if (state.settled !== null) return state.settled
    const settled = result ?? this.successResult(state)
    state.settled = settled
    this.operations.set(
      operationKey(state.pending.operation),
      Object.freeze({ canonicalInput: state.prepared.token.canonicalInput, submission: settled }),
    )
    if ('receipt' in settled && settled.receipt !== null) this.durable = settled.receipt.position
    state.deferred.resolve(settled)
    return settled
  }

  rejectCompletion(index: number, reason: unknown): void {
    const state = this.pending[index]
    if (state === undefined) throw new RangeError(`unknown pending index ${index}`)
    state.deferred.reject(reason)
  }

  quarantine(diagnosticId: OpaqueId): void {
    this.quarantines.push(diagnosticId)
    this.accepting = false
  }

  async closeWriter(): Promise<CloseResult> {
    this.closeCalls += 1
    this.accepting = false
    await Promise.allSettled(this.pending.map(entry => entry.pending.completion))
    return Object.freeze({ status: 'closed', watermark: this.durable })
  }

  async readHead(): Promise<ReadResult<Head>> {
    return Object.freeze({ status: 'unavailable', reason: 'unused test reader' })
  }

  async readRange(): Promise<
    ReadResult<
      Readonly<{
        envelopes: readonly never[]
        through: Watermark
        nextAfterSeq: string
        complete: boolean
      }>
    >
  > {
    return Object.freeze({ status: 'unavailable', reason: 'unused test reader' })
  }

  async lookupOperation(operation: OperationRef): Promise<OperationLookup> {
    const prior = this.operations.get(operationKey(operation))
    if (prior === undefined) {
      return Object.freeze({ status: 'not_committed', verifiedThrough: this.durable })
    }
    if (prior.submission.status === 'pending_durability') {
      return Object.freeze({
        status: 'pending_durability',
        position: prior.submission.position,
        watermark: this.durable,
      })
    }
    if (prior.submission.status === 'committed') {
      return Object.freeze({
        status: 'committed',
        receipt: prior.submission.receipt,
        watermark: this.durable,
      })
    }
    if (
      prior.submission.status === 'conflict' &&
      prior.submission.receipt !== null &&
      prior.submission.conflict.kind === 'revision'
    ) {
      return Object.freeze({
        status: 'conflict',
        conflict: prior.submission.conflict,
        receipt: prior.submission.receipt,
        watermark: this.durable,
      })
    }
    return Object.freeze({
      status: 'unavailable',
      reason: 'terminal result has no lookup projection',
    })
  }

  private successResult(state: PendingState): CommitResult {
    if (state.disposition === 'record_conflict') {
      const conflict = state.conflict
      if (conflict === null) throw new Error('missing conflict')
      const receipt = Object.freeze({
        position: state.pending.position,
        operation: state.pending.operation,
        inputDigest: 'digest',
        outcome: Object.freeze({ status: 'conflict', conflict }),
        streams: Object.freeze([]),
      }) satisfies ConflictReceipt
      return Object.freeze({ status: 'conflict', conflict, receipt })
    }
    const streams = Object.freeze(
      state.prepared.request.appends.map(append =>
        Object.freeze({
          stream: append.stream,
          revision: String(this.revisions.get(streamKey(append.stream)) ?? 0n),
        }),
      ),
    )
    const receipt = Object.freeze({
      position: state.pending.position,
      operation: state.pending.operation,
      inputDigest: 'digest',
      outcome: Object.freeze({ status: 'committed', result: state.prepared.request.result }),
      streams,
    }) satisfies Receipt<Readonly<{ status: 'committed'; result: JsonValue }>>
    return Object.freeze({ status: 'committed', receipt })
  }
}

export class RecordingDiagnostics implements Diagnostics {
  readonly points: DiagnosticPoint[] = []
  onLog: ((point: DiagnosticPoint) => void) | undefined
  throwOnLog = false
  throwOnNewId = false
  private nextId = 1

  newId(): OpaqueId {
    if (this.throwOnNewId) throw new Error('diagnostic id failure')
    const id = `diagnostic-${this.nextId}`
    this.nextId += 1
    return id
  }

  scope(): DiagnosticContext {
    return Object.freeze({}) as DiagnosticContext
  }

  current(): DiagnosticContext | null {
    return null
  }

  log(_context: DiagnosticContext, point: DiagnosticPoint): void {
    if (this.throwOnLog) throw new Error('diagnostic log failure')
    this.points.push(point)
    this.onLog?.(point)
  }

  startSpan(): DiagnosticSpan {
    return Object.freeze({
      context: Object.freeze({}) as DiagnosticContext,
      end: () => undefined,
    })
  }

  within<T>(_context: DiagnosticContext, body: () => T): T {
    return body()
  }
}

export function operationInput(tenantId: OpaqueId | null = 'tenant'): OperationInput {
  const principal = Object.freeze({ kind: 'system' as const, systemId: 'test-system' })
  return Object.freeze({
    format: 'core-operation/1',
    operationKind: 'test.operation',
    tenantId,
    principal,
    target: Object.freeze({ target: 'test' }),
    arguments: Object.freeze({}),
    preconditions: Object.freeze({}),
    causality: Object.freeze({}),
  })
}

export function operation(operationId: string): OperationRef {
  return Object.freeze({
    namespace: 'test.operations',
    principalId: JSON.stringify({ kind: 'system', systemId: 'test-system' }),
    operationId,
  })
}

export function stream(owner: string, streamId = owner): StreamRef {
  return Object.freeze({
    namespace: 'test.records',
    owner,
    scope: Object.freeze({ kind: 'tenant', tenantId: 'tenant' }),
    streamId,
  })
}

export function append(owner: string, expectedRevision = '0', streamId = owner): StreamAppend {
  return Object.freeze({
    stream: stream(owner, streamId),
    expectedRevision,
    records: Object.freeze([
      Object.freeze({ kind: 'test.event', version: '1', data: Object.freeze({ owner }) }),
    ]),
  })
}

export function unwrap<T>(value: Checked<T>): T {
  if (!value.ok) throw new Error(value.issues.map(issue => issue.message).join('; '))
  return value.value
}

export function preparedCommit(
  writer: RecordPreparation,
  operationId: string,
  owners: readonly string[],
  requiredUses: readonly UseRequirement[] = [],
  expectedRevision = '0',
): PreparedCommit {
  const preparedOperation = unwrap(
    writer.prepareOperation(operation(operationId), operationInput()),
  )
  return unwrap(
    writer.prepare({
      operation: preparedOperation,
      appends: Object.freeze(owners.map(owner => append(owner, expectedRevision))),
      result: Object.freeze({ operationId }),
      requiredUses,
    }),
  )
}

export async function turn(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}
