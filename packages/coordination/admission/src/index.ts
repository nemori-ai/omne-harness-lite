import type {
  DiagnosticIdentity,
  DiagnosticPoint,
  Diagnostics,
} from '@omne-harness-lite/diagnostics'
import type {
  Causality,
  CloseResult,
  CommitResult,
  CommittedReceipt,
  OperationInput,
  Position,
  PreparedCommit,
  PreparedOperation,
  Principal,
  Receipt,
  RecordPreparation,
  RecordWriter,
  UseBinding,
  UseRequirement,
  Watermark,
} from '@omne-harness-lite/records'
import type { Checked, OpaqueId, OperationRef, ValidationIssue } from '@omne-harness-lite/work-data'

export type CompositionKind =
  | 'owner_change'
  | 'input_run'
  | 'action_execution'
  | 'request_wait'
  | 'answer_consequence'
  | 'budget_call'
  | 'content_media'

export type AdmissionFailure = Readonly<{
  status: 'denied' | 'conflict' | 'unavailable'
  owner: string
  code: string
}>

declare const gateFrameBrand: unique symbol
export type GateFrame = Readonly<{ [gateFrameBrand]: true }>

export type OwnerPublication = Readonly<{
  owner: string
  publishLogical: (position: Position, frame: GateFrame) => undefined
  publishDurable: (receipt: Receipt, frame: GateFrame) => undefined
}>

export type ReleaseResult =
  Readonly<{ status: 'released' }> | Readonly<{ status: 'retained'; diagnosticId: OpaqueId }>

declare const exactUseBrand: unique symbol
export type ExactUse = Readonly<{
  [exactUseBrand]: true
  binding: UseBinding
  retainAt: (position: Position, frame: GateFrame) => undefined
  release: (reason: 'not_admitted' | 'verified_not_committed' | 'settled') => Promise<ReleaseResult>
}>

export interface ExactUseIssuer {
  capture(
    binding: Omit<UseBinding, 'owner'>,
    callbacks: Readonly<{
      retainAt: ExactUse['retainAt']
      release: ExactUse['release']
    }>,
  ): ExactUse
}

export type PreparedAdmission = Readonly<{
  composition: CompositionKind
  commit: PreparedCommit
  publications: readonly OwnerPublication[]
  uses: readonly ExactUse[]
}>

export type AdmissionCompletion =
  | Exclude<CommitResult, { status: 'committed' }>
  | Readonly<{
      status: 'committed'
      receipt: CommittedReceipt
      publication: 'ready' | 'blocked'
      diagnosticId?: OpaqueId
    }>

export type PendingAdmission = Readonly<{
  status: 'pending_durability'
  position: Position
  operation: OperationRef
  disposition: 'apply' | 'record_conflict'
  completion: Promise<AdmissionCompletion>
}>

export type AdmissionResult = PendingAdmission | AdmissionCompletion | AdmissionFailure

export type CoordinatorStatus = Readonly<{
  phase: 'open' | 'closing' | 'quarantined' | 'closed'
  logical: Watermark
  durable: Watermark
  diagnosticId?: OpaqueId
}>

export interface AdmissionCoordinator extends RecordPreparation {
  enter<T>(work: (frame: GateFrame) => T): T
  lookupPrepared(
    frame: GateFrame,
    operation: PreparedOperation,
  ): AdmissionResult | Readonly<{ status: 'not_seen' }>
  submit(frame: GateFrame, prepared: PreparedAdmission): AdmissionResult
  status(): CoordinatorStatus
  close(): Promise<CloseResult>
}

export type AdmissionHost = Readonly<{
  coordinator: AdmissionCoordinator
  createUseIssuer: (owner: string) => ExactUseIssuer
}>

const COMPOSITION_KINDS = new Set<CompositionKind>([
  'owner_change',
  'input_run',
  'action_execution',
  'request_wait',
  'answer_consequence',
  'budget_call',
  'content_media',
])

const RELEASED: ReleaseResult = Object.freeze({ status: 'released' })

class SnapshotError extends Error {}

class CallbackContractError extends Error {}

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
}>

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve
  })
  if (resolvePromise === undefined) throw new Error('failed to create deferred completion')
  return Object.freeze({ promise, resolve: resolvePromise })
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function ownData(value: unknown, key: PropertyKey): unknown {
  if (!isObject(value)) throw new SnapshotError('expected an object')
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Reflect.getOwnPropertyDescriptor(value, key)
  } catch {
    throw new SnapshotError(`cannot inspect ${String(key)}`)
  }
  if (descriptor === undefined || !('value' in descriptor)) {
    throw new SnapshotError(`${String(key)} must be an own data property`)
  }
  return descriptor.value
}

function rejectAccessors(value: object): void {
  let keys: readonly PropertyKey[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    throw new SnapshotError('cannot inspect object keys')
  }
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(value, key)
    } catch {
      throw new SnapshotError(`cannot inspect ${String(key)}`)
    }
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new SnapshotError(`accessor ${String(key)} is not allowed`)
    }
  }
}

function snapshotArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new SnapshotError('expected an array')
  rejectAccessors(value)
  const lengthValue = ownData(value, 'length')
  if (typeof lengthValue !== 'number' || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    throw new SnapshotError('invalid array length')
  }
  const result: unknown[] = []
  for (let index = 0; index < lengthValue; index += 1) {
    result.push(ownData(value, String(index)))
  }
  return Object.freeze(result)
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SnapshotError(`${label} must be a non-empty string`)
  }
  return value
}

function snapshotOperation(value: unknown): OperationRef {
  const namespace = nonEmptyString(ownData(value, 'namespace'), 'operation.namespace')
  const principalId = nonEmptyString(ownData(value, 'principalId'), 'operation.principalId')
  const operationId = nonEmptyString(ownData(value, 'operationId'), 'operation.operationId')
  return Object.freeze({ namespace, principalId, operationId })
}

function snapshotPosition(value: unknown): Position {
  const coordinationDomain = nonEmptyString(
    ownData(value, 'coordinationDomain'),
    'position.coordinationDomain',
  )
  const writerEpoch = nonEmptyString(ownData(value, 'writerEpoch'), 'position.writerEpoch')
  const commitId = nonEmptyString(ownData(value, 'commitId'), 'position.commitId')
  const seq = nonEmptyString(ownData(value, 'seq'), 'position.seq')
  if (!/^[1-9][0-9]*$/.test(writerEpoch)) {
    throw new SnapshotError('position.writerEpoch must be a positive canonical counter')
  }
  if (!/^[1-9][0-9]*$/.test(seq)) {
    throw new SnapshotError('position.seq must be a positive canonical counter')
  }
  return Object.freeze({ coordinationDomain, writerEpoch, commitId, seq })
}

function snapshotBinding(value: unknown, expectedOwner?: string): UseBinding {
  if (!isObject(value)) throw new SnapshotError('binding must be an object')
  rejectAccessors(value)
  const owner = expectedOwner ?? nonEmptyString(ownData(value, 'owner'), 'binding.owner')
  const resourceId = nonEmptyString(ownData(value, 'resourceId'), 'binding.resourceId')
  const generation = nonEmptyString(ownData(value, 'generation'), 'binding.generation')
  const epoch = nonEmptyString(ownData(value, 'epoch'), 'binding.epoch')
  return Object.freeze({ owner, resourceId, generation, epoch })
}

function bindingKey(binding: UseBinding): string {
  return [binding.owner, binding.resourceId, binding.generation, binding.epoch]
    .map(value => `${value.length}:${value}`)
    .join('|')
}

function operationKey(operation: OperationRef): string {
  return [operation.namespace, operation.principalId, operation.operationId]
    .map(value => `${value.length}:${value}`)
    .join('|')
}

function sameOperation(left: OperationRef, right: OperationRef): boolean {
  return (
    left.namespace === right.namespace &&
    left.principalId === right.principalId &&
    left.operationId === right.operationId
  )
}

function samePosition(left: Position, right: Position): boolean {
  return (
    left.coordinationDomain === right.coordinationDomain &&
    left.writerEpoch === right.writerEpoch &&
    left.commitId === right.commitId &&
    left.seq === right.seq
  )
}

function invalidChecked<T>(message: string): Checked<T> {
  const issue: ValidationIssue = Object.freeze({
    path: '',
    code: 'schema',
    message,
  })
  return Object.freeze({ ok: false, issues: Object.freeze([issue]) })
}

function parseDiagnosticIdentity(
  operation: OperationRef,
  canonicalInput: string,
): DiagnosticIdentity {
  try {
    const parsed: unknown = JSON.parse(canonicalInput)
    const tenant = ownData(parsed, 'tenantId')
    const principal = ownData(parsed, 'principal')
    const causality = ownData(parsed, 'causality')
    if (tenant !== null && typeof tenant !== 'string') throw new SnapshotError('invalid tenant')
    if (!isObject(principal) || !isObject(causality)) throw new SnapshotError('invalid identity')
    return Object.freeze({
      tenantId: tenant,
      principal: principal as Principal,
      operation,
      causality: causality as Causality,
    })
  } catch {
    return Object.freeze({
      tenantId: null,
      principal: Object.freeze({ kind: 'system', systemId: 'admission' }),
      operation,
      causality: Object.freeze({}),
    })
  }
}

function snapshotWatermark(position: Position): Watermark {
  return Object.freeze({
    coordinationDomain: position.coordinationDomain,
    seq: position.seq,
    commitId: position.commitId,
  })
}

function captureThenableObserver(value: unknown, rejected: () => void): (() => void) | null {
  if (!isObject(value)) return null
  let current: object | null = value
  const visited = new Set<object>()
  for (let depth = 0; current !== null && depth < 64; depth += 1) {
    if (visited.has(current)) return () => rejected()
    visited.add(current)
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(current, 'then')
    } catch {
      return () => rejected()
    }
    if (descriptor !== undefined) {
      if (!('value' in descriptor)) {
        return () => {
          Promise.resolve(value).then(
            () => undefined,
            () => rejected(),
          )
        }
      }
      if (typeof descriptor.value !== 'function') return null
      const then = descriptor.value
      return () => {
        let rejectionObserved = false
        const rejectOnce = (): void => {
          if (rejectionObserved) return
          rejectionObserved = true
          rejected()
        }
        try {
          Reflect.apply(then, value, [() => undefined, rejectOnce])
        } catch {
          rejectOnce()
        }
      }
    }
    try {
      current = Reflect.getPrototypeOf(current)
    } catch {
      return () => rejected()
    }
  }
  return current === null ? null : () => rejected()
}

type DiagnosticDraft = Readonly<{
  diagnosticId: OpaqueId
  phase: string
  code: string
  identity?: DiagnosticIdentity
  owner?: string
  operation?: OperationRef
  position?: Position
  level: 'warn' | 'error'
}>

type FrameState = {
  readonly frame: GateFrame
  readonly diagnostics: DiagnosticDraft[]
  readonly after: Array<() => void>
  active: boolean
  omitted: number
}

type PreparedOperationState = Readonly<{
  operation: OperationRef
  canonicalInput: string
  identity: DiagnosticIdentity
}>

type PreparedCommitState = Readonly<{
  operationState: PreparedOperationState
}>

type PublicationSnapshot = Readonly<{
  owner: string
  publishLogical: OwnerPublication['publishLogical']
  publishDurable: OwnerPublication['publishDurable']
}>

type UseClaim = Readonly<{
  operation: OperationRef
  canonicalInput: string
  position: Position
  identity: DiagnosticIdentity
}>

type UseState = {
  readonly owner: string
  readonly binding: UseBinding
  readonly key: string
  readonly originalRetainAt: ExactUse['retainAt']
  readonly originalRelease: ExactUse['release']
  readonly handle: ExactUse
  phase: 'fresh' | 'claimed' | 'releasing' | 'retained' | 'released'
  releaseClass: 'not_admitted' | 'claimed' | 'unknown'
  claim: UseClaim | null
  retainInvoked: boolean
  releaseCompletion: Promise<ReleaseResult> | null
  retainedDiagnosticId: OpaqueId | null
}

class UseSnapshotError extends SnapshotError {
  constructor(readonly authenticUses: readonly UseState[]) {
    super('admission contains a foreign ExactUse')
  }
}

type AdmissionSnapshot = Readonly<{
  composition: CompositionKind
  commit: PreparedCommit
  operation: OperationRef
  canonicalInput: string
  identity: DiagnosticIdentity
  owners: readonly string[]
  requirements: readonly Readonly<{ recordOwner: string; binding: UseBinding; key: string }>[]
  publications: readonly PublicationSnapshot[]
  uses: readonly UseState[]
}>

type Ticket = {
  readonly snapshot: AdmissionSnapshot
  readonly writerPending: Readonly<{
    position: Position
    operation: OperationRef
    disposition: 'apply' | 'record_conflict'
    completion: Promise<CommitResult>
  }>
  readonly publicPending: PendingAdmission
  readonly resolve: (value: AdmissionCompletion) => void
  writerReady: boolean
  writerResult: CommitResult | null
  final: AdmissionCompletion | null
  logicalReady: boolean
  blockedDiagnosticId: OpaqueId | null
}

class AdmissionCoordinatorRuntime implements AdmissionCoordinator {
  private phase: CoordinatorStatus['phase'] = 'open'
  private logical: Watermark
  private durable: Watermark
  private currentFrame: FrameState | null = null
  private diagnosticId: OpaqueId | null = null
  private fallbackDiagnosticSequence = 1
  private readonly preparedOperations = new WeakMap<object, PreparedOperationState>()
  private readonly preparedCommits = new WeakMap<object, PreparedCommitState>()
  private readonly uses = new WeakMap<object, UseState>()
  private readonly issuerOwners = new Set<string>()
  private readonly capturedCallbackObjects = new WeakSet<object>()
  private readonly capturedPinCallbacks = new WeakMap<object, WeakMap<object, Set<string>>>()
  private readonly tickets: Ticket[] = []
  private readonly ticketsByOperation = new Map<string, Ticket>()
  private drainIndex = 0
  private durabilityGap = false
  private closeCompletion: Promise<CloseResult> | null = null
  private closeResult: CloseResult | null = null
  private writerQuarantined = false

  constructor(
    private readonly writer: RecordWriter,
    private readonly diagnostics: Diagnostics,
  ) {
    this.logical = Object.freeze({
      coordinationDomain: writer.coordinationDomain,
      seq: '0',
      commitId: null,
    })
    this.durable = this.logical
  }

  prepareOperation(operation: OperationRef, input: OperationInput): Checked<PreparedOperation> {
    if (this.currentFrame?.active === true) {
      this.quarantine('prepare_operation', 'inside_gate', undefined, undefined)
      return invalidChecked('operation preparation must run outside the admission gate')
    }
    let result: ReturnType<RecordPreparation['prepareOperation']>
    try {
      result = this.writer.prepareOperation(operation, input)
    } catch {
      this.quarantine('prepare_operation', 'writer_throw', undefined, undefined)
      return invalidChecked('writer failed to prepare the operation')
    }
    if (!result.ok) return result
    try {
      const token = result.value
      if (!isObject(token)) throw new SnapshotError('writer returned a non-object operation token')
      const operationSnapshot = snapshotOperation(ownData(token, 'operation'))
      const canonicalInput = nonEmptyString(
        ownData(token, 'canonicalInput'),
        'prepared operation canonicalInput',
      )
      const state: PreparedOperationState = Object.freeze({
        operation: operationSnapshot,
        canonicalInput,
        identity: parseDiagnosticIdentity(operationSnapshot, canonicalInput),
      })
      this.preparedOperations.set(token, state)
      return result
    } catch {
      this.quarantine('prepare_operation', 'invalid_writer_token', undefined, undefined)
      return invalidChecked('writer returned an invalid prepared operation token')
    }
  }

  prepare(request: Parameters<RecordPreparation['prepare']>[0]): Checked<PreparedCommit> {
    if (this.currentFrame?.active === true) {
      this.quarantine('prepare_commit', 'inside_gate', undefined, undefined)
      return invalidChecked('commit preparation must run outside the admission gate')
    }
    let result: ReturnType<RecordPreparation['prepare']>
    try {
      result = this.writer.prepare(request)
    } catch {
      this.quarantine('prepare_commit', 'writer_throw', undefined, undefined)
      return invalidChecked('writer failed to prepare the commit')
    }
    if (!result.ok) return result
    try {
      const operationToken = ownData(request, 'operation')
      if (!isObject(operationToken)) throw new SnapshotError('operation token must be an object')
      const operationState = this.preparedOperations.get(operationToken)
      if (operationState === undefined) {
        return invalidChecked('prepared operation was not issued through this coordinator')
      }
      if (!isObject(result.value))
        throw new SnapshotError('writer returned a non-object commit token')
      this.preparedCommits.set(result.value, Object.freeze({ operationState }))
      return result
    } catch {
      this.quarantine('prepare_commit', 'invalid_writer_token', undefined, undefined)
      return invalidChecked('writer returned an invalid prepared commit token')
    }
  }

  enter<T>(work: (frame: GateFrame) => T): T {
    if (this.phase !== 'open') throw new Error(`admission coordinator is ${this.phase}`)
    return this.withFrame(work)
  }

  lookupPrepared(
    frame: GateFrame,
    operation: PreparedOperation,
  ): AdmissionResult | Readonly<{ status: 'not_seen' }> {
    if (!this.validFrame(frame)) return this.invalidFrame('lookup')
    if (!isObject(operation) || !this.preparedOperations.has(operation)) {
      return this.assemblyFailure('invalid_snapshot', undefined, undefined, [])
    }
    const state = this.preparedOperations.get(operation)
    if (state === undefined) return this.invalidFrame('lookup')
    let submission: ReturnType<RecordWriter['lookupPrepared']>
    try {
      submission = this.writer.lookupPrepared(operation)
    } catch {
      this.quarantine('lookup', 'writer_throw', state.operation, undefined, state.identity)
      return this.unavailable('writer_failure')
    }
    const ticket = this.ticketsByOperation.get(operationKey(state.operation))
    if (ticket !== undefined && ticket.snapshot.canonicalInput === state.canonicalInput) {
      return ticket.final ?? ticket.publicPending
    }
    if (submission.status === 'pending_durability') {
      this.quarantine(
        'lookup',
        'unowned_pending',
        state.operation,
        submission.position,
        state.identity,
      )
      return this.unavailable('unowned_pending')
    }
    if (submission.status === 'committed') {
      return Object.freeze({
        status: 'committed',
        receipt: submission.receipt,
        publication: 'ready',
      })
    }
    return submission
  }

  submit(frame: GateFrame, prepared: PreparedAdmission): AdmissionResult {
    if (!this.validFrame(frame)) return this.invalidFrame('submit')
    if (this.phase !== 'open') return this.unavailable(this.phase)

    let snapshot: AdmissionSnapshot
    try {
      snapshot = this.snapshotAdmission(prepared)
    } catch (error) {
      if (error instanceof UseSnapshotError) {
        return this.assemblyFailure('invalid_use', undefined, undefined, error.authenticUses)
      }
      return this.assemblyFailure('invalid_snapshot', undefined, undefined, [])
    }

    const participantFailure = this.validateParticipants(snapshot)
    if (participantFailure !== null) {
      return this.assemblyFailure(
        participantFailure,
        snapshot.operation,
        undefined,
        snapshot.uses,
        snapshot.identity,
      )
    }
    const lifecycleFailure = this.validateUseLifecycles(snapshot)
    if (lifecycleFailure) {
      return this.assemblyFailure(
        'invalid_use',
        snapshot.operation,
        undefined,
        snapshot.uses,
        snapshot.identity,
      )
    }

    let submission: ReturnType<RecordWriter['commit']>
    try {
      submission = this.writer.commit(snapshot.commit)
    } catch {
      const id = this.quarantine(
        'ranking',
        'writer_throw',
        snapshot.operation,
        undefined,
        snapshot.identity,
      )
      this.retainFreshUnknown(snapshot.uses, id)
      return this.unavailable('writer_failure')
    }

    const existing = this.ticketsByOperation.get(operationKey(snapshot.operation))
    if (submission.status !== 'pending_durability') {
      if (existing !== undefined && existing.snapshot.canonicalInput === snapshot.canonicalInput) {
        this.cleanupFresh(snapshot.uses)
        return existing.final ?? existing.publicPending
      }
      if (submission.status === 'unknown') {
        const id = this.quarantine(
          'ranking',
          'unknown',
          snapshot.operation,
          undefined,
          snapshot.identity,
          submission.diagnosticId,
        )
        this.retainFreshUnknown(snapshot.uses, id)
        return submission
      }
      this.cleanupFresh(snapshot.uses)
      if (submission.status === 'committed') {
        const id = this.quarantine(
          'ranking',
          'unowned_committed',
          snapshot.operation,
          submission.receipt.position,
          snapshot.identity,
        )
        return Object.freeze({
          status: 'committed',
          receipt: submission.receipt,
          publication: 'blocked',
          diagnosticId: id,
        })
      }
      return submission
    }

    let position: Position
    try {
      position = snapshotPosition(submission.position)
      if (
        !sameOperation(submission.operation, snapshot.operation) ||
        position.coordinationDomain !== this.writer.coordinationDomain ||
        position.writerEpoch !== this.writer.writerEpoch ||
        (submission.disposition !== 'apply' && submission.disposition !== 'record_conflict')
      ) {
        throw new SnapshotError('writer returned mismatched pending identity')
      }
    } catch {
      const id = this.quarantine(
        'ranking',
        'invalid_writer_submission',
        snapshot.operation,
        undefined,
        snapshot.identity,
      )
      this.retainFreshUnknown(snapshot.uses, id)
      return this.unavailable('writer_failure')
    }

    if (existing !== undefined) {
      if (
        existing.snapshot.canonicalInput !== snapshot.canonicalInput ||
        !samePosition(existing.writerPending.position, position) ||
        existing.writerPending.disposition !== submission.disposition
      ) {
        const id = this.quarantine(
          'ranking',
          'duplicate_identity_mismatch',
          snapshot.operation,
          position,
          snapshot.identity,
        )
        this.retainFreshUnknown(snapshot.uses, id)
        return this.unavailable('writer_failure')
      }
      this.cleanupFresh(snapshot.uses)
      return existing.final ?? existing.publicPending
    }

    const previous = this.tickets.at(-1)
    if (
      previous !== undefined &&
      BigInt(position.seq) !== BigInt(previous.writerPending.position.seq) + 1n
    ) {
      const id = this.quarantine(
        'ranking',
        'non_contiguous_position',
        snapshot.operation,
        position,
        snapshot.identity,
      )
      this.retainFreshUnknown(snapshot.uses, id)
      return this.unavailable('writer_failure')
    }

    const ticket = this.createTicket(snapshot, submission, position)
    this.tickets.push(ticket)
    this.ticketsByOperation.set(operationKey(snapshot.operation), ticket)
    this.observeWriterCompletion(ticket)

    if (submission.disposition === 'record_conflict') {
      this.cleanupFresh(snapshot.uses)
      this.logical = snapshotWatermark(position)
      ticket.logicalReady = true
      return ticket.publicPending
    }

    for (const use of snapshot.uses) {
      use.phase = 'claimed'
      use.releaseClass = 'claimed'
      use.claim = Object.freeze({
        operation: snapshot.operation,
        canonicalInput: snapshot.canonicalInput,
        position,
        identity: snapshot.identity,
      })
    }

    try {
      for (const use of snapshot.uses) use.handle.retainAt(position, frame)
      for (const publication of snapshot.publications) {
        this.invokeStrict(
          publication.publishLogical,
          [position, frame],
          'publish_logical',
          snapshot.operation,
          position,
          publication.owner,
          snapshot.identity,
        )
      }
      this.logical = snapshotWatermark(position)
      ticket.logicalReady = true
    } catch {
      ticket.blockedDiagnosticId = this.quarantine(
        'logical_publication',
        'callback_contract',
        snapshot.operation,
        position,
        snapshot.identity,
      )
    }
    return ticket.publicPending
  }

  status(): CoordinatorStatus {
    const status: CoordinatorStatus = {
      phase: this.phase,
      logical: this.logical,
      durable: this.durable,
      ...(this.diagnosticId === null ? {} : { diagnosticId: this.diagnosticId }),
    }
    return Object.freeze(status)
  }

  close(): Promise<CloseResult> {
    if (this.closeCompletion !== null) return this.closeCompletion
    if (this.closeResult !== null) return Promise.resolve(this.closeResult)
    if (this.phase !== 'closed') this.phase = 'closing'
    const tickets = Object.freeze(this.tickets.map(ticket => ticket.publicPending.completion))
    const completion = Promise.allSettled(tickets)
      .then(() => this.writer.closeWriter())
      .then(
        result => {
          this.closeResult = result
          if (result.status === 'closed') this.phase = 'closed'
          return result
        },
        () => {
          const diagnosticId = this.quarantine(
            'close',
            'writer_close_rejected',
            undefined,
            undefined,
          )
          const result: CloseResult = Object.freeze({
            status: 'blocked',
            watermark: this.durable,
            diagnosticId,
            pending: Object.freeze(
              this.tickets
                .filter(ticket => ticket.final === null)
                .map(ticket => ticket.snapshot.operation),
            ),
            lockHeld: true,
          })
          this.closeResult = result
          this.phase = 'closing'
          return result
        },
      )
    this.closeCompletion = completion
    return completion
  }

  createUseIssuer(owner: string): ExactUseIssuer {
    if (this.phase !== 'open') throw new Error(`admission coordinator is ${this.phase}`)
    if (typeof owner !== 'string' || owner.length === 0) {
      throw new TypeError('ExactUse issuer owner must be non-empty')
    }
    if (this.issuerOwners.has(owner)) throw new Error(`ExactUse issuer ${owner} is already bound`)
    this.issuerOwners.add(owner)
    return Object.freeze({
      capture: (
        binding: Omit<UseBinding, 'owner'>,
        callbacks: Readonly<{
          retainAt: ExactUse['retainAt']
          release: ExactUse['release']
        }>,
      ): ExactUse => this.captureUse(owner, binding, callbacks),
    })
  }

  private captureUse(
    owner: string,
    inputBinding: Omit<UseBinding, 'owner'>,
    callbacks: Readonly<{
      retainAt: ExactUse['retainAt']
      release: ExactUse['release']
    }>,
  ): ExactUse {
    if (this.phase !== 'open') throw new Error(`admission coordinator is ${this.phase}`)
    if (!isObject(callbacks)) throw new SnapshotError('callbacks must be an object')
    rejectAccessors(callbacks)
    const binding = snapshotBinding(inputBinding, owner)
    const retainAt = ownData(callbacks, 'retainAt')
    const release = ownData(callbacks, 'release')
    if (typeof retainAt !== 'function' || typeof release !== 'function') {
      throw new SnapshotError('ExactUse callbacks must be functions')
    }
    const retainedCallback = retainAt as ExactUse['retainAt']
    const releaseCallback = release as ExactUse['release']
    const key = bindingKey(binding)
    let releases = this.capturedPinCallbacks.get(retainedCallback)
    if (releases === undefined) {
      releases = new WeakMap<object, Set<string>>()
      this.capturedPinCallbacks.set(retainedCallback, releases)
    }
    let bindings = releases.get(releaseCallback)
    if (this.capturedCallbackObjects.has(callbacks) || bindings?.has(key) === true) {
      throw new Error('ExactUse pin was already captured')
    }
    if (bindings === undefined) {
      bindings = new Set<string>()
      releases.set(releaseCallback, bindings)
    }
    bindings.add(key)
    this.capturedCallbackObjects.add(callbacks)

    let state: UseState | undefined
    const handle = Object.freeze({
      binding,
      retainAt: (position: Position, frame: GateFrame): undefined => {
        if (state === undefined) throw new Error('ExactUse is not initialized')
        return this.retainUse(state, position, frame)
      },
      release: (
        reason: 'not_admitted' | 'verified_not_committed' | 'settled',
      ): Promise<ReleaseResult> => {
        if (state === undefined) return Promise.reject(new Error('ExactUse is not initialized'))
        return this.releaseUse(state, reason)
      },
    }) as ExactUse
    const initializedState: UseState = {
      owner,
      binding,
      key,
      originalRetainAt: retainedCallback,
      originalRelease: releaseCallback,
      handle,
      phase: 'fresh',
      releaseClass: 'not_admitted',
      claim: null,
      retainInvoked: false,
      releaseCompletion: null,
      retainedDiagnosticId: null,
    }
    state = initializedState
    this.uses.set(handle, initializedState)
    return handle
  }

  private retainUse(state: UseState, position: Position, frame: GateFrame): undefined {
    if (!this.validFrame(frame)) {
      this.invalidFrame('retain_at')
      throw new CallbackContractError('retainAt used an invalid frame')
    }
    const claim = state.claim
    if (
      state.phase !== 'claimed' ||
      claim === null ||
      !samePosition(claim.position, position) ||
      state.retainInvoked
    ) {
      this.quarantine(
        'retain_at',
        'invalid_lifecycle',
        claim?.operation,
        claim?.position,
        claim?.identity,
      )
      throw new CallbackContractError('retainAt is not valid for this claim')
    }
    state.retainInvoked = true
    this.invokeStrict(
      state.originalRetainAt,
      [position, frame],
      'retain_at',
      claim.operation,
      position,
      state.owner,
      claim.identity,
    )
    return undefined
  }

  private releaseUse(
    state: UseState,
    reason: 'not_admitted' | 'verified_not_committed' | 'settled',
  ): Promise<ReleaseResult> {
    if (state.phase === 'releasing' || state.phase === 'released') {
      return state.releaseCompletion ?? Promise.resolve(RELEASED)
    }
    const allowed =
      state.releaseClass === 'not_admitted'
        ? reason === 'not_admitted'
        : state.releaseClass === 'claimed'
          ? reason !== 'not_admitted'
          : reason === 'verified_not_committed'
    if (!allowed) {
      const diagnosticId = state.retainedDiagnosticId ?? this.newDiagnosticId()
      if (state.phase === 'fresh') state.phase = 'retained'
      state.retainedDiagnosticId = diagnosticId
      this.recordDiagnostic({
        diagnosticId,
        phase: 'release_guard',
        code: `${state.releaseClass}_${reason}`,
        level: 'warn',
        identity: state.claim?.identity,
        owner: state.owner,
        operation: state.claim?.operation,
        position: state.claim?.position,
      })
      return Promise.resolve(Object.freeze({ status: 'retained', diagnosticId }))
    }
    return this.sealRelease(state, reason, this.currentFrame?.active === true)
  }

  private sealRelease(
    state: UseState,
    reason: 'not_admitted' | 'verified_not_committed' | 'settled',
    deferUntilFrameExit: boolean,
  ): Promise<ReleaseResult> {
    if (state.phase === 'releasing') {
      const existing = state.releaseCompletion
      if (existing !== null) return existing
      throw new Error('releasing ExactUse has no completion')
    }
    const completion = deferred<ReleaseResult>()
    state.phase = 'releasing'
    state.releaseCompletion = completion.promise
    const run = (): void => this.runOwnerRelease(state, reason, completion.resolve)
    if (deferUntilFrameExit && this.currentFrame?.active === true) {
      this.currentFrame.after.push(run)
    } else {
      run()
    }
    return completion.promise
  }

  private runOwnerRelease(
    state: UseState,
    reason: 'not_admitted' | 'verified_not_committed' | 'settled',
    resolve: (value: ReleaseResult) => void,
  ): void {
    let ownerCompletion: unknown
    try {
      ownerCompletion = Reflect.apply(state.originalRelease, undefined, [reason])
    } catch {
      this.finishReleaseFailure(state, resolve, 'release_throw')
      return
    }
    Promise.resolve(ownerCompletion).then(
      result => {
        try {
          const status = ownData(result, 'status')
          if (status === 'released') {
            state.phase = 'released'
            state.retainedDiagnosticId = null
            resolve(RELEASED)
            return
          }
          if (status === 'retained') {
            const diagnosticId = nonEmptyString(
              ownData(result, 'diagnosticId'),
              'release diagnosticId',
            )
            state.phase = 'retained'
            state.retainedDiagnosticId = diagnosticId
            resolve(Object.freeze({ status: 'retained', diagnosticId }))
            return
          }
          throw new SnapshotError('invalid release status')
        } catch {
          this.finishReleaseFailure(state, resolve, 'invalid_release_result')
        }
      },
      () => this.finishReleaseFailure(state, resolve, 'release_rejected'),
    )
  }

  private finishReleaseFailure(
    state: UseState,
    resolve: (value: ReleaseResult) => void,
    code: string,
  ): void {
    const diagnosticId = this.newDiagnosticId()
    state.phase = 'retained'
    state.retainedDiagnosticId = diagnosticId
    this.recordDiagnostic({
      diagnosticId,
      phase: 'release',
      code,
      level: 'error',
      identity: state.claim?.identity,
      owner: state.owner,
      operation: state.claim?.operation,
      position: state.claim?.position,
    })
    resolve(Object.freeze({ status: 'retained', diagnosticId }))
  }

  private snapshotAdmission(input: PreparedAdmission): AdmissionSnapshot {
    if (!isObject(input)) throw new SnapshotError('admission must be an object')
    rejectAccessors(input)
    const compositionValue = ownData(input, 'composition')
    if (
      typeof compositionValue !== 'string' ||
      !COMPOSITION_KINDS.has(compositionValue as CompositionKind)
    ) {
      throw new SnapshotError('invalid composition kind')
    }
    const composition = compositionValue as CompositionKind
    const commitValue = ownData(input, 'commit')
    if (!isObject(commitValue)) throw new SnapshotError('commit must be an object')
    const commitState = this.preparedCommits.get(commitValue)
    if (commitState === undefined) throw new SnapshotError('foreign prepared commit')
    const commit = commitValue as PreparedCommit
    const operation = snapshotOperation(ownData(commitValue, 'operation'))
    const canonicalInput = nonEmptyString(
      ownData(commitValue, 'canonicalInput'),
      'prepared commit canonicalInput',
    )
    if (
      !sameOperation(operation, commitState.operationState.operation) ||
      canonicalInput !== commitState.operationState.canonicalInput
    ) {
      throw new SnapshotError('prepared commit identity changed')
    }
    const ownerValues = snapshotArray(ownData(commitValue, 'owners'))
    const owners = Object.freeze(ownerValues.map(value => nonEmptyString(value, 'prepared owner')))
    const requirementValues = snapshotArray(ownData(commitValue, 'requiredUses'))
    const requirements = Object.freeze(
      requirementValues.map(value => {
        if (!isObject(value)) throw new SnapshotError('use requirement must be an object')
        rejectAccessors(value)
        const recordOwner = nonEmptyString(ownData(value, 'recordOwner'), 'requirement.recordOwner')
        const binding = snapshotBinding(ownData(value, 'binding'))
        return Object.freeze({ recordOwner, binding, key: bindingKey(binding) })
      }),
    )
    const publicationValues = snapshotArray(ownData(input, 'publications'))
    const publications = Object.freeze(
      publicationValues.map(value => {
        if (!isObject(value)) throw new SnapshotError('publication must be an object')
        rejectAccessors(value)
        const owner = nonEmptyString(ownData(value, 'owner'), 'publication.owner')
        const publishLogical = ownData(value, 'publishLogical')
        const publishDurable = ownData(value, 'publishDurable')
        if (typeof publishLogical !== 'function' || typeof publishDurable !== 'function') {
          throw new SnapshotError('publication callbacks must be functions')
        }
        return Object.freeze({
          owner,
          publishLogical: publishLogical as OwnerPublication['publishLogical'],
          publishDurable: publishDurable as OwnerPublication['publishDurable'],
        })
      }),
    )
    const useValues = snapshotArray(ownData(input, 'uses'))
    const authenticUses: UseState[] = []
    let hasForeignUse = false
    for (const value of useValues) {
      if (!isObject(value)) {
        hasForeignUse = true
        continue
      }
      const state = this.uses.get(value)
      if (state === undefined || state.handle !== value) {
        hasForeignUse = true
        continue
      }
      authenticUses.push(state)
    }
    if (hasForeignUse) throw new UseSnapshotError(Object.freeze(authenticUses))
    const uses = Object.freeze(authenticUses)
    return Object.freeze({
      composition,
      commit,
      operation,
      canonicalInput,
      identity: commitState.operationState.identity,
      owners,
      requirements,
      publications,
      uses,
    })
  }

  private validateParticipants(
    snapshot: AdmissionSnapshot,
  ): 'invalid_participants' | 'invalid_use' | null {
    if (snapshot.owners.length === 0) return 'invalid_participants'
    const ownerSet = new Set(snapshot.owners)
    if (ownerSet.size !== snapshot.owners.length) return 'invalid_participants'
    const publicationOwners = new Set(snapshot.publications.map(value => value.owner))
    if (
      snapshot.publications.length !== snapshot.owners.length ||
      publicationOwners.size !== snapshot.publications.length ||
      snapshot.owners.some(owner => !publicationOwners.has(owner))
    ) {
      return 'invalid_participants'
    }
    const requirementKeys = new Set<string>()
    for (const requirement of snapshot.requirements) {
      if (!ownerSet.has(requirement.recordOwner) || requirementKeys.has(requirement.key)) {
        return 'invalid_use'
      }
      requirementKeys.add(requirement.key)
    }
    const useKeys = new Set(snapshot.uses.map(use => use.key))
    if (
      snapshot.uses.length !== snapshot.requirements.length ||
      useKeys.size !== snapshot.uses.length ||
      snapshot.requirements.some(requirement => !useKeys.has(requirement.key))
    ) {
      return 'invalid_use'
    }
    return null
  }

  private validateUseLifecycles(snapshot: AdmissionSnapshot): boolean {
    for (const use of snapshot.uses) {
      if (use.phase === 'fresh') continue
      if (
        use.phase === 'claimed' &&
        use.claim !== null &&
        sameOperation(use.claim.operation, snapshot.operation) &&
        use.claim.canonicalInput === snapshot.canonicalInput
      ) {
        continue
      }
      return true
    }
    return false
  }

  private createTicket(
    snapshot: AdmissionSnapshot,
    submission: Extract<ReturnType<RecordWriter['commit']>, { status: 'pending_durability' }>,
    position: Position,
  ): Ticket {
    const completion = deferred<AdmissionCompletion>()
    const publicPending: PendingAdmission = Object.freeze({
      status: 'pending_durability',
      position,
      operation: snapshot.operation,
      disposition: submission.disposition,
      completion: completion.promise,
    })
    return {
      snapshot,
      writerPending: Object.freeze({
        position,
        operation: snapshot.operation,
        disposition: submission.disposition,
        completion: submission.completion,
      }),
      publicPending,
      resolve: completion.resolve,
      writerReady: false,
      writerResult: null,
      final: null,
      logicalReady: false,
      blockedDiagnosticId: null,
    }
  }

  private observeWriterCompletion(ticket: Ticket): void {
    Promise.resolve(ticket.writerPending.completion).then(
      result => {
        ticket.writerResult = result
        ticket.writerReady = true
        this.drainTickets()
      },
      () => {
        const diagnosticId = this.quarantine(
          'durability',
          'writer_completion_rejected',
          ticket.snapshot.operation,
          ticket.writerPending.position,
          ticket.snapshot.identity,
        )
        ticket.writerResult = Object.freeze({
          status: 'unknown',
          operation: ticket.snapshot.operation,
          diagnosticId,
        })
        ticket.writerReady = true
        this.drainTickets()
      },
    )
  }

  private drainTickets(): void {
    while (this.drainIndex < this.tickets.length) {
      const ticket = this.tickets[this.drainIndex]
      if (ticket === undefined || !ticket.writerReady || ticket.writerResult === null) return
      this.finishTicket(ticket, ticket.writerResult)
      this.drainIndex += 1
    }
  }

  private finishTicket(ticket: Ticket, result: CommitResult): void {
    const validResult = this.validateWriterCompletion(ticket, result)
    if (validResult.status === 'committed') {
      let blocked =
        ticket.blockedDiagnosticId !== null ||
        !ticket.logicalReady ||
        this.durabilityGap ||
        this.phase === 'quarantined'
      if (!blocked && ticket.writerPending.disposition === 'apply') {
        try {
          this.withFrame(frame => {
            for (const publication of ticket.snapshot.publications) {
              this.invokeStrict(
                publication.publishDurable,
                [validResult.receipt, frame],
                'publish_durable',
                ticket.snapshot.operation,
                ticket.writerPending.position,
                publication.owner,
                ticket.snapshot.identity,
              )
            }
          })
        } catch {
          ticket.blockedDiagnosticId = this.quarantine(
            'durable_publication',
            'callback_contract',
            ticket.snapshot.operation,
            ticket.writerPending.position,
            ticket.snapshot.identity,
          )
          blocked = true
        }
      }
      if (blocked) this.durabilityGap = true
      if (!blocked) this.durable = snapshotWatermark(ticket.writerPending.position)
      const completion: AdmissionCompletion = Object.freeze({
        status: 'committed',
        receipt: validResult.receipt,
        publication: blocked ? 'blocked' : 'ready',
        ...(blocked
          ? {
              diagnosticId:
                ticket.blockedDiagnosticId ?? this.diagnosticId ?? this.newDiagnosticId(),
            }
          : {}),
      })
      ticket.final = completion
      ticket.resolve(completion)
      return
    }
    if (
      validResult.status === 'conflict' &&
      validResult.receipt !== null &&
      validResult.conflict.kind === 'revision'
    ) {
      if (!this.durabilityGap) this.durable = snapshotWatermark(ticket.writerPending.position)
      ticket.final = validResult
      ticket.resolve(validResult)
      return
    }
    this.durabilityGap = true
    this.quarantine(
      'durability',
      validResult.status,
      ticket.snapshot.operation,
      ticket.writerPending.position,
      ticket.snapshot.identity,
    )
    ticket.final = validResult
    ticket.resolve(validResult)
  }

  private validateWriterCompletion(ticket: Ticket, result: CommitResult): CommitResult {
    try {
      if (result.status === 'committed') {
        if (
          ticket.writerPending.disposition !== 'apply' ||
          !sameOperation(result.receipt.operation, ticket.snapshot.operation) ||
          !samePosition(result.receipt.position, ticket.writerPending.position)
        ) {
          throw new SnapshotError('committed result identity mismatch')
        }
        return result
      }
      if (result.status === 'conflict' && result.receipt !== null) {
        if (
          ticket.writerPending.disposition !== 'record_conflict' ||
          !sameOperation(result.receipt.operation, ticket.snapshot.operation) ||
          !samePosition(result.receipt.position, ticket.writerPending.position)
        ) {
          throw new SnapshotError('conflict result identity mismatch')
        }
        return result
      }
      if (
        result.status === 'unknown' &&
        !sameOperation(result.operation, ticket.snapshot.operation)
      ) {
        throw new SnapshotError('unknown result identity mismatch')
      }
      return result
    } catch {
      const diagnosticId = this.quarantine(
        'durability',
        'invalid_writer_completion',
        ticket.snapshot.operation,
        ticket.writerPending.position,
        ticket.snapshot.identity,
      )
      return Object.freeze({
        status: 'unknown',
        operation: ticket.snapshot.operation,
        diagnosticId,
      })
    }
  }

  private invokeStrict(
    callback: (...values: never[]) => unknown,
    values: readonly unknown[],
    phase: string,
    operation: OperationRef,
    position: Position,
    owner: string,
    identity: DiagnosticIdentity,
  ): void {
    const result = Reflect.apply(callback, undefined, values)
    if (result === undefined) return
    const observer = captureThenableObserver(result, () => {
      const diagnosticId = this.newDiagnosticId()
      this.recordDiagnostic({
        diagnosticId,
        phase: 'late_rejection',
        code: `${phase}_rejected`,
        level: 'error',
        identity,
        owner,
        operation,
        position,
      })
    })
    if (observer !== null) this.deferUntilFrameExit(observer)
    throw new CallbackContractError(`${phase} must return undefined`)
  }

  private withFrame<T>(work: (frame: GateFrame) => T): T {
    if (this.currentFrame?.active === true) {
      this.quarantine('gate', 'reentrant', undefined, undefined)
      throw new CallbackContractError('reentrant admission gate entry')
    }
    const frame = Object.freeze({}) as GateFrame
    const state: FrameState = {
      frame,
      diagnostics: [],
      after: [],
      active: true,
      omitted: 0,
    }
    this.currentFrame = state
    try {
      const result = work(frame)
      const observer = captureThenableObserver(result, () => {
        const diagnosticId = this.newDiagnosticId()
        this.recordDiagnostic({
          diagnosticId,
          phase: 'late_rejection',
          code: 'gate_result_rejected',
          level: 'error',
        })
      })
      if (observer !== null) {
        state.after.push(observer)
        this.quarantine('gate', 'thenable_result', undefined, undefined)
        throw new CallbackContractError('admission gate work returned a thenable')
      }
      return result
    } catch (error) {
      if (this.phase !== 'quarantined') {
        this.quarantine('gate', 'work_throw', undefined, undefined)
      }
      throw error
    } finally {
      state.active = false
      this.currentFrame = null
      for (const action of state.after) {
        try {
          action()
        } catch {
          const diagnosticId = this.newDiagnosticId()
          this.emitDiagnostic({
            diagnosticId,
            phase: 'post_gate',
            code: 'cleanup_start_throw',
            level: 'error',
          })
        }
      }
      for (const draft of state.diagnostics) this.emitDiagnostic(draft)
      if (state.omitted > 0) {
        const diagnosticId = this.newDiagnosticId()
        this.emitDiagnostic({
          diagnosticId,
          phase: 'gate',
          code: 'diagnostic.gate_capacity',
          level: 'warn',
        })
      }
    }
  }

  private deferUntilFrameExit(action: () => void): void {
    if (this.currentFrame?.active !== true) {
      action()
      return
    }
    this.currentFrame.after.push(action)
  }

  private validFrame(frame: GateFrame): boolean {
    return this.currentFrame?.active === true && this.currentFrame.frame === frame
  }

  private invalidFrame(phase: string): AdmissionFailure {
    this.quarantine(phase, 'invalid_frame', undefined, undefined)
    return this.unavailable('invalid_frame')
  }

  private assemblyFailure(
    code: 'invalid_participants' | 'invalid_use' | 'invalid_snapshot',
    operation: OperationRef | undefined,
    position: Position | undefined,
    uses: readonly UseState[],
    identity?: DiagnosticIdentity,
  ): AdmissionFailure {
    this.cleanupFresh(uses)
    const diagnosticId = this.newDiagnosticId()
    this.recordDiagnostic({
      diagnosticId,
      phase: 'assembly',
      code,
      level: 'warn',
      ...(identity === undefined ? {} : { identity }),
      operation,
      position,
    })
    return this.unavailable(code)
  }

  private unavailable(code: string): AdmissionFailure {
    return Object.freeze({ status: 'unavailable', owner: 'admission', code })
  }

  private cleanupFresh(uses: readonly UseState[]): void {
    for (const use of uses) {
      if (use.phase === 'fresh') this.sealRelease(use, 'not_admitted', true)
    }
  }

  private retainFreshUnknown(uses: readonly UseState[], diagnosticId: OpaqueId): void {
    for (const use of uses) {
      if (use.phase !== 'fresh') continue
      use.phase = 'retained'
      use.releaseClass = 'unknown'
      use.retainedDiagnosticId = diagnosticId
      use.releaseCompletion = Promise.resolve(Object.freeze({ status: 'retained', diagnosticId }))
    }
  }

  private quarantine(
    phase: string,
    code: string,
    operation: OperationRef | undefined,
    position: Position | undefined,
    identity?: DiagnosticIdentity,
    preferredDiagnosticId?: OpaqueId,
  ): OpaqueId {
    const diagnosticId = this.diagnosticId ?? preferredDiagnosticId ?? this.newDiagnosticId()
    this.diagnosticId = diagnosticId
    if (this.phase !== 'closed') this.phase = 'quarantined'
    if (!this.writerQuarantined) {
      this.writerQuarantined = true
      try {
        this.writer.quarantine(diagnosticId)
      } catch {
        // The original quarantine identity and responsibility remain authoritative.
      }
    }
    this.recordDiagnostic({
      diagnosticId,
      phase,
      code,
      level: 'error',
      ...(identity === undefined ? {} : { identity }),
      operation,
      position,
    })
    return diagnosticId
  }

  private newDiagnosticId(): OpaqueId {
    try {
      const value = this.diagnostics.newId()
      if (typeof value === 'string' && value.length > 0) return value
    } catch {
      // A local fallback keeps the business failure identifiable without trusting logging.
    }
    const value = `admission-diagnostic-${this.fallbackDiagnosticSequence}`
    this.fallbackDiagnosticSequence += 1
    return value
  }

  private recordDiagnostic(draft: DiagnosticDraft): void {
    if (this.currentFrame?.active === true) {
      if (this.currentFrame.diagnostics.length < 16) this.currentFrame.diagnostics.push(draft)
      else this.currentFrame.omitted += 1
      return
    }
    this.emitDiagnostic(draft)
  }

  private emitDiagnostic(draft: DiagnosticDraft): void {
    const identity: DiagnosticIdentity =
      draft.identity ??
      (draft.operation === undefined
        ? Object.freeze({
            tenantId: null,
            principal: Object.freeze({ kind: 'system', systemId: 'admission' }),
            causality: Object.freeze({}),
          })
        : parseDiagnosticIdentity(draft.operation, '{}'))
    try {
      const context = this.diagnostics.scope(identity)
      const point: DiagnosticPoint = Object.freeze({
        component: draft.owner === undefined ? 'admission' : `admission:${draft.owner}`,
        phase: draft.phase,
        code: draft.code,
        level: draft.level,
        diagnosticId: draft.diagnosticId,
        ...(draft.position === undefined ? {} : { position: draft.position }),
        logical: this.logical,
        durable: this.durable,
      })
      this.diagnostics.log(context, point)
    } catch {
      // Diagnostics are passive; the original business result and owner stay unchanged.
    }
  }
}

export function createAdmissionCoordinator(
  writer: RecordWriter,
  diagnostics: Diagnostics,
): AdmissionHost {
  const coordinator = new AdmissionCoordinatorRuntime(writer, diagnostics)
  return Object.freeze({
    coordinator,
    createUseIssuer: (owner: string): ExactUseIssuer => coordinator.createUseIssuer(owner),
  })
}
