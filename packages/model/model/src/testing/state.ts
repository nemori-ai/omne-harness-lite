import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeModelInstanceId,
  decodeRevision,
} from '@omne-harness/model-contract'
import type {
  Access,
  ActorRef,
  Admission,
  CallState,
  ConsumerRef,
  DispatchRecord,
  DurableEvidence,
  ExecutionRef,
  FixedModelRequest,
  ModelCallId,
  ModelConsumerOwnerDeclaration,
  ModelFailure,
  ModelOperationId,
  OutputCursor,
  ReadId,
  ReadState,
  ResultCapacity,
  ResultTrim,
  RetryDecision,
  RetryPosition,
  Revision,
  Settlement,
  Snapshot,
  VisibleBlock,
  SendDemand,
  MaterializedTransport,
  TransportFact,
  Termination,
} from '@omne-harness/model-contract'
import { resultParts, makePage, pageEnd, materialBytes, encodedBytes } from './pages.ts'
import type { StreamAssembly } from '@omne-harness/stream-arrival'
import { MEMORY_WRITE_METHODS } from './types.ts'
import type {
  EvidenceContext,
  MemoryAction,
  MemoryModelCommandsOptions,
  MemoryModelControl,
  MemoryModelEvidence,
  MemoryWriteMethod,
  UnknownInjection,
} from './types.ts'
import {
  checkedActor,
  decimal,
  digest,
  invalid,
  nextRevision,
  positiveLimit,
  revision,
  tenantKey,
  unavailable,
} from './value.ts'

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
export type Binding = Readonly<{
  call: ModelCallId
  method: MemoryWriteMethod
  fingerprint: string
  revision: Revision
  receipt: Receipt
}> &
  (
    | Readonly<{ status: 'committed' }>
    | Readonly<{ status: 'unknown'; effect: 'applied' | 'not-applied' }>
    | Readonly<{ status: 'rolled-back' | 'not-committed' }>
  )
export type MemoryRead = {
  id: ReadId
  lastProgress: string
  furthest: number
  state: Extract<ReadState, { kind: 'ended' }> | { kind: 'reading'; offset: number }
}
export type MemoryDispatch = {
  record: DispatchRecord
  logicalTerminal: Termination | null
  windows: Map<string, 'open' | 'closed' | 'unproven'>
  events: Map<string, string>
  assembly: StreamAssembly | null
  blocks: readonly VisibleBlock[]
  nextSeq: Map<string, string>
  trims: Map<string, readonly ResultTrim[]>
  hadContent: Set<string>
}
export type MemoryCall = {
  state: CallState
  request: FixedModelRequest | null
  requestDigest: string
  capacity: ResultCapacity
  initiator: ActorRef
  admission: ModelOperationId
  owner: ModelConsumerOwnerDeclaration
  execution: ExecutionRef | null
  dispatches: MemoryDispatch[]
  retry: RetryDecision | null
  retryPosition: RetryPosition | null
  retrySource: DurableEvidence | null
  cursor: OutputCursor
  snapshots: Map<OutputCursor, Snapshot>
  reads: Map<ReadId, MemoryRead>
  cleanupFailure: string | null
}
export type TenantState = {
  calls: Map<ModelCallId, MemoryCall>
  operations: Map<ModelOperationId, Binding>
}
export type WriteIdentity = Pick<ExecutionRef, 'tenant' | 'call'> & {
  readonly operation: ModelOperationId
}
export type Draft = { tenant: TenantState; call: MemoryCall | undefined }
export type Applied<T> = { value: T; receipt: Receipt }

function copyCall(call: MemoryCall): MemoryCall {
  const { execution, dispatches, ...plain } = call
  return {
    ...structuredClone(plain),
    execution,
    dispatches: dispatches.map(({ assembly, ...dispatch }) => ({
      ...structuredClone(dispatch),
      assembly,
    })),
  }
}
export function bump(call: MemoryCall): Revision {
  const next = nextRevision(call.state.revision)
  call.state = { ...call.state, revision: next }
  return next
}
export function evidenceContext(
  tenant: ExecutionRef['tenant'],
  call: MemoryCall,
): EvidenceContext | ModelFailure {
  if (call.request === null) return invalid('call', 'recovery-material-released')
  return {
    tenant,
    call: call.state.call,
    consumer: call.state.consumer,
    request: structuredClone(call.request),
    execution: call.execution === null ? null : { ...call.execution },
  }
}
export function unresolved(state: TenantState, call: ModelCallId): ModelOperationId[] {
  return [...state.operations].flatMap(([id, op]) =>
    op.call === call && op.status === 'unknown' ? [id] : [],
  )
}
export function tasks(
  call: MemoryCall,
  pending: readonly ModelOperationId[],
): ('execute' | 'control' | 'handoff' | 'cleanup' | 'account')[] {
  const result: ('execute' | 'control' | 'handoff' | 'cleanup' | 'account')[] = []
  if (call.state.phase !== 'settled' && call.state.custody.kind === 'producer')
    result.push('execute')
  if (
    call.state.control.kind === 'requested' &&
    call.state.control.propagation !== 'sent' &&
    call.state.custody.kind === 'producer'
  )
    result.push('control')
  if (call.state.phase === 'settled' && call.state.custody.kind === 'producer')
    result.push('handoff')
  if (call.state.custody.kind === 'acknowledged' && call.state.custody.cleanup !== 'released')
    result.push('cleanup')
  if (pending.length > 0 || call.dispatches.some(d => d.record.send === 'unknown'))
    result.push('account')
  return result
}
function capacityValid(value: ResultCapacity): boolean {
  return decimal(value.bytes, true) && decimal(value.blocks, true) && decimal(value.attachmentBytes)
}
export { materialBytes } from './pages.ts'

export class MemoryState<P> {
  private roots = new Map<string, TenantState>()
  private plans = new Map<string, UnknownInjection>()
  private owners: readonly ModelConsumerOwnerDeclaration[]
  private busy = false
  readonly control: MemoryModelControl

  readonly options: MemoryModelCommandsOptions<P>
  constructor(options: MemoryModelCommandsOptions<P>) {
    this.options = Object.freeze({
      ...options,
      owners: structuredClone(options.owners),
      evidence: [...options.evidence],
      limits: Object.freeze({
        ...options.limits,
        capacity: Object.freeze({ ...options.limits.capacity }),
      }),
    })
    positiveLimit(this.options.limits.scanPageCalls, 'scanPageCalls')
    positiveLimit(this.options.limits.resultPageParts, 'resultPageParts')
    positiveLimit(this.options.limits.resultPageTargetBytes, 'resultPageTargetBytes')
    positiveLimit(this.options.limits.readIdleMs, 'readIdleMs')
    if (!capacityValid(this.options.limits.capacity)) throw new RangeError('invalid total capacity')
    this.owners = this.checkOwners(this.options.owners)
    this.control = {
      injectUnknown: input =>
        this.exclusive(() => {
          const key = this.identity(input)
          if (
            typeof key !== 'string' ||
            'failure' in decodeModelOperationId(input.operation) ||
            input.operation.startsWith('mop_--') ||
            !MEMORY_WRITE_METHODS.includes(input.method)
          )
            throw new TypeError('invalid unknown identity')
          if (this.plans.has(`${key}:${input.operation}`))
            throw new TypeError('unknown plan already exists')
          this.plans.set(`${key}:${input.operation}`, { ...input })
        }),
      reveal: input =>
        this.exclusive(() => {
          const key = this.identity(input)
          if (typeof key !== 'string') throw new TypeError('invalid reveal identity')
          const root = this.roots.get(key)
          const binding = root?.operations.get(input.operation)
          if (!root || !binding || binding.call !== input.call || binding.status !== 'unknown')
            throw new TypeError('no unresolved operation')
          if ((binding.effect === 'applied') !== (input.result === 'committed'))
            throw new TypeError('reveal cannot reverse an effect')
          const next = { calls: new Map(root.calls), operations: new Map(root.operations) }
          next.operations.set(input.operation, { ...binding, status: input.result })
          this.roots.set(key, next)
        }),
      replaceOwners: owners =>
        this.exclusive(() => {
          this.owners = this.checkOwners(owners)
        }),
      setCleanupFailure: input =>
        this.exclusive(() => {
          const key = this.identity(input)
          if (typeof key !== 'string') throw new TypeError('invalid cleanup identity')
          const root = this.roots.get(key)
          const original = root?.calls.get(input.call)
          if (!root || !original) throw new TypeError('unknown cleanup call')
          const call = copyCall(original)
          if (input.diagnostic !== null && encodedBytes(input.diagnostic) > 4096)
            throw new RangeError('cleanup diagnostic encoded-byte-limit')
          call.cleanupFailure = input.diagnostic
          this.publish(key, root, call)
        }),
    }
  }
  exclusive<T>(work: () => T): T {
    if (this.busy) throw new TypeError('memory Model adapter reentry')
    this.busy = true
    try {
      return work()
    } finally {
      this.busy = false
    }
  }
  run<T>(work: () => Outcome<T, ModelFailure>): Promise<Outcome<T, ModelFailure>> {
    return Promise.resolve(this.exclusive(work))
  }
  identity(input: Pick<ExecutionRef, 'tenant' | 'call'>): string | ModelFailure {
    const key = tenantKey(input.tenant)
    if (typeof key !== 'string') return key
    const id = decodeModelCallId(input.call)
    return 'failure' in id ? invalid('call', id.failure.reason) : key
  }
  reserved(field: keyof ResultCapacity): bigint {
    return [...this.roots.values()].reduce(
      (total, state) =>
        total +
        [...state.calls.values()].reduce(
          (n, call) => n + (call.request === null ? 0n : BigInt(call.capacity[field])),
          0n,
        ),
      0n,
    )
  }
  root(key: string): TenantState {
    return this.roots.get(key) ?? { calls: new Map(), operations: new Map() }
  }
  authorize(
    input: Access<P>,
    action: MemoryAction,
    call?: MemoryCall,
    callId?: ModelCallId,
    consumer?: ConsumerRef,
  ): Outcome<ActorRef, ModelFailure> {
    const key = tenantKey(input.tenant)
    if (typeof key !== 'string') return { failure: key }
    return checkedActor(
      this.options.authority.authorize({
        action,
        access: input,
        resource:
          callId === undefined
            ? { kind: 'tenant' }
            : {
                kind: 'call',
                call: callId,
                consumer: call
                  ? structuredClone(call.state.consumer)
                  : consumer
                    ? structuredClone(consumer)
                    : null,
              },
      }),
    )
  }
  execution(input: ExecutionRef, call: MemoryCall | undefined): ModelFailure | null {
    if ('failure' in decodeModelInstanceId(input.instance) || !decimal(input.generation, true))
      return invalid('execution', 'identity')
    const auth = checkedActor(this.options.authority.execution(input))
    if ('failure' in auth) return auth.failure
    if (
      !call?.execution ||
      call.execution.instance !== input.instance ||
      call.execution.generation !== input.generation
    )
      return { kind: 'stale-instance', instance: input.instance }
    return null
  }
  adapter(call: MemoryCall): MemoryModelEvidence | ModelFailure {
    return (
      this.options.evidence.find(e => digest(e.adoption) === digest(call.owner.evidence)) ??
      unavailable('consumer-evidence', 'frozen-adapter-unavailable')
    )
  }
  owner(owner: string): ModelConsumerOwnerDeclaration | undefined {
    return this.owners.find(o => o.consumerOwner === owner)
  }
  private checkOwners(
    owners: readonly ModelConsumerOwnerDeclaration[],
  ): readonly ModelConsumerOwnerDeclaration[] {
    const names = new Set<string>()
    for (const owner of owners) {
      if (
        typeof owner.consumerOwner !== 'string' ||
        !owner.consumerOwner ||
        Buffer.byteLength(owner.consumerOwner, 'utf8') > 512
      )
        throw new RangeError('consumer owner must fit 512 UTF-8 bytes')
      if (names.has(owner.consumerOwner))
        throw new TypeError(`duplicate consumer owner ${owner.consumerOwner}`)
      if (owner.work.kind === 'guarded')
        throw new TypeError(
          `consumer owner ${owner.consumerOwner}: qualification participant protocol is not ready`,
        )
      if (!this.options.evidence.some(e => digest(e.adoption) === digest(owner.evidence)))
        throw new TypeError(`consumer owner ${owner.consumerOwner}: evidence adapter is missing`)
      names.add(owner.consumerOwner)
    }
    return structuredClone(owners)
  }
  private publish(key: string, root: TenantState, call: MemoryCall): void {
    const next = { calls: new Map(root.calls), operations: new Map(root.operations) }
    next.calls.set(call.state.call, call)
    this.roots.set(key, next)
  }
  read<T>(
    input: Access<P> & { readonly call: ModelCallId },
    action: MemoryAction,
    work: (call: MemoryCall, root: TenantState) => Outcome<T, ModelFailure>,
  ): Outcome<T, ModelFailure> {
    const key = this.identity(input)
    if (typeof key !== 'string') return { failure: key }
    const root = this.root(key)
    const call = root.calls.get(input.call)
    const auth = this.authorize(input, action, call, input.call)
    if ('failure' in auth) return auth
    if (!call) {
      const pending = [...root.operations].find(
        ([, operation]) => operation.call === input.call && operation.status === 'unknown',
      )
      return {
        failure: pending
          ? { kind: 'commit-unknown', operation: pending[0] }
          : invalid('call', 'not-found'),
      }
    }
    return work(call, root)
  }
  write<T>(args: {
    input: WriteIdentity
    method: MemoryWriteMethod
    fields: unknown
    check: (call: MemoryCall | undefined, root: TenantState, replay: boolean) => ModelFailure | null
    apply: (draft: Draft) => Outcome<Applied<T>, ModelFailure>
    replay: (call: MemoryCall | undefined, binding: Binding) => Outcome<T, ModelFailure>
  }): Outcome<T, ModelFailure> {
    const { input } = args
    const key = this.identity(input)
    if (typeof key !== 'string') return { failure: key }
    if (
      'failure' in decodeModelOperationId(input.operation) ||
      input.operation.startsWith('mop_--')
    )
      return { failure: invalid('operation', 'reserved-or-invalid') }
    const root = this.root(key)
    const original = root.calls.get(input.call)
    const binding = root.operations.get(input.operation)
    const checked = args.check(original, root, binding !== undefined)
    if (checked) return { failure: checked }
    const fingerprint = digest({ version: 1, fields: args.fields })
    if (binding) {
      if (
        binding.call !== input.call ||
        binding.method !== args.method ||
        binding.fingerprint !== fingerprint
      )
        return {
          failure: {
            kind: 'conflict',
            operation: input.operation,
            revision: original?.state.revision ?? revision(),
          },
        }
      if (binding.status === 'unknown')
        return { failure: { kind: 'commit-unknown', operation: input.operation } }
      if (binding.status === 'committed') return args.replay(original, binding)
    }
    const orderedMethods: readonly MemoryWriteMethod[] = [
      'admit',
      'claim',
      'prepareDispatch',
      'recordMaterialization',
      'openReceiveWindow',
      'preserve',
      'prepareRetry',
      'decideRetry',
      'settle',
    ]
    if (orderedMethods.includes(args.method)) {
      const pending = [...root.operations].find(
        ([, operation]) =>
          operation.call === input.call &&
          operation.method === args.method &&
          operation.status === 'unknown',
      )
      if (pending) return { failure: { kind: 'commit-unknown', operation: pending[0] } }
    }
    const tenant = { calls: new Map(root.calls), operations: new Map(root.operations) }
    const draft: Draft = { tenant, call: original === undefined ? undefined : copyCall(original) }
    const applied = args.apply(draft)
    if ('failure' in applied) return applied
    if (draft.call) {
      if (
        draft.call.request !== null &&
        materialBytes(draft.call) > BigInt(draft.call.capacity.bytes)
      )
        return { failure: { kind: 'capacity', required: draft.call.capacity } }
      tenant.calls.set(input.call, draft.call)
    }
    const planKey = `${key}:${input.operation}`
    const plan = this.plans.get(planKey)
    const matched = plan?.call === input.call && plan.method === args.method ? plan : undefined
    const base = {
      call: input.call,
      method: args.method,
      fingerprint,
      revision: draft.call?.state.revision ?? revision(),
      receipt: applied.ok.receipt,
    }
    const nextBinding: Binding =
      matched === undefined
        ? { ...base, status: 'committed' }
        : { ...base, status: 'unknown', effect: matched.effect }
    if (matched?.effect === 'not-applied') {
      tenant.calls = new Map(root.calls)
      tenant.operations = new Map(root.operations)
    }
    tenant.operations.set(input.operation, nextBinding)
    this.roots.set(key, tenant)
    if (matched) {
      this.plans.delete(planKey)
      return { failure: { kind: 'commit-unknown', operation: input.operation } }
    }
    return { ok: applied.ok.value }
  }
  sendBinding(input: SendDemand<P>, call: MemoryCall | undefined): ModelFailure | null {
    if (
      input.execution.call !== input.call ||
      tenantKey(input.execution.tenant) !== tenantKey(input.tenant)
    )
      return invalid('execution', 'send-binding')
    const failure = this.execution(input.execution, call)
    if (failure) return failure
    if (!call || call.state.control.kind !== 'none' || call.state.phase === 'settled')
      return invalid('call', 'send-no-longer-valid')
    if (
      digest(input.request) !== call.requestDigest ||
      digest(input.consumer) !== digest(call.state.consumer) ||
      digest(input.initiator) !== digest(call.initiator)
    )
      return invalid('request', 'send-binding')
    const dispatch = call.dispatches.find(d => d.record.dispatch === input.dispatch)
    return !dispatch || digest(dispatch.record.supplier) !== digest(input.supplier)
      ? invalid('dispatch', 'send-not-prepared')
      : null
  }
  startSend(
    input: SendDemand<P>,
    materialized: MaterializedTransport,
    signal: AbortSignal,
  ): Outcome<AsyncIterable<TransportFact>, ModelFailure> {
    return this.exclusive(() => {
      const key = this.identity(input)
      if (typeof key !== 'string') return { failure: key }
      const call = this.root(key).calls.get(input.call)
      const auth = this.authorize(input, 'send', call, input.call)
      if ('failure' in auth) return auth
      const failure = this.sendBinding(input, call)
      if (failure) return { failure }
      const dispatch = call?.dispatches.find(d => d.record.dispatch === input.dispatch)
      if (
        !dispatch?.record.materialization ||
        dispatch.record.send !== 'prepared' ||
        digest(dispatch.record.materialization.receipt) !== digest(materialized.receipt) ||
        ![...dispatch.windows.values()].includes('open')
      )
        return { failure: invalid('dispatch', 'send-not-prepared') }
      if (signal.aborted) return { failure: unavailable('model-send', 'cancelled-before-start') }
      try {
        return { ok: materialized.start(signal) }
      } catch {
        return { failure: unavailable('model-send', 'transport-start-unknown') }
      }
    })
  }
  updateRead(
    input: Access<P> & { readonly call: ModelCallId },
    read: ReadId,
    action: 'next' | 'end' | 'refresh',
    after?: string,
  ): Outcome<ReadState, ModelFailure> {
    const key = this.identity(input)
    if (typeof key !== 'string') return { failure: key }
    const root = this.root(key)
    const original = root.calls.get(input.call)
    const auth = this.authorize(input, 'content', original, input.call)
    if (!original) return 'failure' in auth ? auth : { failure: invalid('call', 'not-found') }
    const call = copyCall(original)
    const relation = call.reads.get(read)
    if (!relation) return 'failure' in auth ? auth : { failure: invalid('read', 'not-found') }
    if ('failure' in auth) {
      if (auth.failure.kind === 'denied') {
        relation.state = { kind: 'ended', reason: 'denied' }
        this.publish(key, root, call)
      }
      return auth
    }
    if (relation.state.kind === 'ended') return { ok: structuredClone(relation.state) }
    if (action === 'end') relation.state = { kind: 'ended', reason: 'closed' }
    else if (
      Date.parse(this.options.clock.now()) - Date.parse(relation.lastProgress) >=
      this.options.limits.readIdleMs
    )
      relation.state = { kind: 'ended', reason: 'stalled' }
    else if (action === 'next') {
      if (after === undefined || !decimal(after) || BigInt(after) > BigInt(Number.MAX_SAFE_INTEGER))
        return { failure: invalid('after', 'page') }
      const offset = Number(after)
      if (
        offset === 0 ||
        offset >= resultParts(call).length ||
        offset >
          pageEnd(
            resultParts(call),
            relation.furthest,
            this.options.limits.resultPageParts,
            this.options.limits.resultPageTargetBytes,
          )
      )
        return { failure: invalid('after', 'page') }
      let boundary = 0
      const parts = resultParts(call)
      while (boundary < offset)
        boundary = pageEnd(
          parts,
          boundary,
          this.options.limits.resultPageParts,
          this.options.limits.resultPageTargetBytes,
        )
      if (boundary !== offset) return { failure: invalid('after', 'page') }
      relation.state =
        offset === parts.length
          ? { kind: 'ended', reason: 'complete' }
          : { kind: 'reading', offset }
      if (offset > relation.furthest) {
        relation.furthest = offset
        relation.lastProgress = this.options.clock.now()
      }
    }
    if (call.request !== null && materialBytes(call) > BigInt(call.capacity.bytes))
      return { failure: { kind: 'capacity', required: structuredClone(call.capacity) } }
    this.publish(key, root, call)
    return {
      ok:
        relation.state.kind === 'ended'
          ? structuredClone(relation.state)
          : this.page(call, relation.state.offset),
    }
  }
  page(call: MemoryCall, offset: number): ReadState {
    if (call.state.phase !== 'settled') throw new TypeError('read page without settlement')
    return {
      kind: 'reading',
      page: structuredClone(
        makePage(
          resultParts(call),
          offset,
          this.options.limits.resultPageParts,
          this.options.limits.resultPageTargetBytes,
          call.state.settlement,
        ),
      ),
    }
  }
}

export function expected(
  call: MemoryCall,
  value: Revision,
  operation: ModelOperationId,
): ModelFailure | null {
  return 'failure' in decodeRevision(value) || value !== call.state.revision
    ? { kind: 'conflict', operation, revision: call.state.revision }
    : null
}
export function authFailure(result: Outcome<ActorRef, ModelFailure>): ModelFailure | null {
  return 'failure' in result ? result.failure : null
}
export function missingReceipt(): never {
  throw new TypeError('inconsistent memory Model receipt')
}
