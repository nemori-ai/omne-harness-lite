import { admitRevision, judgeCallAccount } from '@omne-harness/call-account'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
} from '@omne-harness/model-contract'
import type {
  Access,
  ConsumerRef,
  MaterializationReceipt,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  ReadId,
  ReadState,
  Revision,
  Termination,
  VisibleBlock,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  judgeFixedModelRequest,
  type ActorRef,
  type CallAccountReport,
  type ExecutionRef,
  type ModelConsumerOwnerDeclaration,
  type ProviderDiagnostic,
  type SendDemand,
  type TransportFact,
} from '@omne-harness/model-contract/provider'
import type { CredentialSelection } from '../send.ts'
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
import {
  capacityValid,
  completionOf,
  encodedBytes,
  hasContent,
  makePage,
  materialBytes,
  MAX_TERMINATION_BYTES,
  pageEnd,
  resultParts,
  sealed,
  sealsWhole,
  wellFormed,
} from './judge.ts'
import type { ModelCommandStorage, RunScope } from './storage.ts'
import type {
  Applied,
  Binding,
  CallDocument,
  CommandAction,
  DispatchDocument,
  Draft,
  ModelCommandsCoreOptions,
  ModelCommandsEvidence,
  ModelSendSource,
  ModelWriteMethod,
  ReadRelation,
  TenantDocuments,
  WriteIdentity,
} from './types.ts'

// The state machine of one call: the document changes that the methods make, and the core that
// reads, checks and writes call documents through the storage port.

/** A copy of the document that a write may change without touching the stored one. */
export function copyCall(call: CallDocument): CallDocument {
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
export function bump(call: CallDocument): Revision {
  const next = nextRevision(call.state.revision)
  call.state = { ...call.state, revision: next }
  return next
}

// --- Stream facts into a dispatch.

/**
 * Keeps the account that a provider reported for a dispatch. The runtime adds the subject (this
 * call) and the receipt (`received` in the stream, `late` through `recordLateFact`). A report that
 * names a subject or a receipt itself is refused. The same event with the same report is accepted
 * once on either path; the same event with another report is a conflict.
 */
export function accountFact(
  call: CallDocument,
  dispatch: DispatchDocument,
  input: Readonly<{ event: string; report: CallAccountReport; receipt: 'received' | 'late' }>,
): ModelFailure | null {
  const { event, report, receipt } = input
  if (!event || Object.hasOwn(report, 'subject') || Object.hasOwn(report, 'receipt'))
    return invalid('account', 'shape-or-subject')
  const judged = judgeCallAccount({
    ...report,
    subject: { kind: 'model_call', id: call.state.call },
    receipt,
  })
  if ('rejected' in judged) return invalid('account', 'shape-or-subject')
  const { receipt: _receipt, ...reported } = judged.ok
  const fingerprint = digest(reported)
  const seen = dispatch.events.get(`account:${event}`)
  if (seen !== undefined) return seen === fingerprint ? null : invalid('event', 'conflict')
  if (dispatch.record.account) {
    const previous = dispatch.record.account
    if (BigInt(judged.ok.revision) <= BigInt(previous.revision))
      return invalid('account.revision', 'not-increasing')
    const next = admitRevision(previous, judged.ok)
    if ('rejected' in next) return invalid('account', next.rejected)
  }
  dispatch.events.set(`account:${event}`, fingerprint)
  dispatch.record = { ...dispatch.record, account: structuredClone(judged.ok) }
  return null
}
function endDispatch(
  call: CallDocument,
  dispatch: DispatchDocument,
  termination: Extract<TransportFact, { kind: 'ended' }>['termination'],
): ModelFailure | null {
  if (encodedBytes(termination) > MAX_TERMINATION_BYTES)
    return invalid('termination', 'encoded-byte-limit')
  const completion = completionOf(call, dispatch, termination)
  if (completion.kind !== 'formed') return completion.failure
  const actual =
    termination.kind === 'interrupted'
      ? call.state.control.kind === 'requested'
        ? { kind: 'interrupted' as const, control: call.state.control.operation }
        : {
            kind: 'failed' as const,
            fault: {
              cause: 'stream-lost' as const,
              diagnostic: 'unmanaged-interruption',
              upstreamStatus: null,
            },
          }
      : termination
  dispatch.logicalTerminal = structuredClone(actual)
  dispatch.record = { ...dispatch.record, terminal: structuredClone(actual) }
  return null
}
function openBlock(
  dispatch: DispatchDocument,
  fact: Extract<TransportFact, { kind: 'block-open' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  const last = dispatch.blocks.at(-1)
  if (prior || (last && BigInt(fact.index) <= BigInt(last.index)))
    return invalid('index', 'order-or-duplicate')
  dispatch.blocks = [
    ...dispatch.blocks,
    { kind: 'growing', index: fact.index, mode: fact.mode, content: fact.content, value: '' },
  ]
  dispatch.nextSeq.set(fact.index, '0')
  return null
}
function fillBlock(
  dispatch: DispatchDocument,
  fact: Extract<TransportFact, { kind: 'block-delta' | 'block-replace' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (!prior || prior.kind !== 'growing') return invalid('block', 'unopened-or-closed')
  if (prior.mode !== (fact.kind === 'block-delta' ? 'append' : 'replace'))
    return invalid('mode', 'changed')
  const value = fact.kind === 'block-delta' ? prior.value + fact.delta : fact.value
  dispatch.blocks = dispatch.blocks.map(b => (b.index === prior.index ? { ...prior, value } : b))
  dispatch.nextSeq.set(fact.index, String(BigInt(dispatch.nextSeq.get(fact.index) ?? '0') + 1n))
  if ((fact.kind === 'block-delta' ? fact.delta : fact.value).length > 0) {
    dispatch.hadContent.add(fact.index)
    dispatch.record = { ...dispatch.record, firstContent: 'observed' }
  }
  return null
}
function sealBlock(
  dispatch: DispatchDocument,
  fact: Extract<TransportFact, { kind: 'block-seal' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (!prior && !sealsWhole(fact.block)) return invalid('block', 'unopened')
  if (!prior && dispatch.blocks.some(b => BigInt(b.index) >= BigInt(fact.index)))
    return invalid('index', 'order')
  const failure = sealed(
    fact.block,
    prior,
    dispatch.trims.has(fact.index),
    dispatch.nextSeq.get(fact.index) !== undefined && dispatch.nextSeq.get(fact.index) !== '0',
  )
  if (failure) return failure
  const next: VisibleBlock = {
    kind: 'sealed',
    index: fact.index,
    block: structuredClone(fact.block),
  }
  dispatch.blocks = prior
    ? dispatch.blocks.map(b => (b.index === fact.index ? next : b))
    : [...dispatch.blocks, next]
  if (hasContent(fact.block)) dispatch.record = { ...dispatch.record, firstContent: 'observed' }
  return null
}
function trimBlock(
  dispatch: DispatchDocument,
  fact: Extract<TransportFact, { kind: 'trim' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (
    !prior ||
    prior.kind !== 'growing' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(fact.removed) ||
    fact.reason.length === 0
  )
    return invalid('trim', 'shape-or-closed')
  dispatch.trims.set(fact.index, [
    ...(dispatch.trims.get(fact.index) ?? []),
    { removed: fact.removed, reason: fact.reason },
  ])
  return null
}
/** Keeps a diagnostic on the dispatch. It changes no block, no first content and no terminal. */
function diagnosticFact(
  dispatch: DispatchDocument,
  diagnostic: ProviderDiagnostic,
): ModelFailure | null {
  if (!wellFormed(diagnostic)) return invalid('diagnostic', 'shape')
  dispatch.diagnostics = [...dispatch.diagnostics, structuredClone(diagnostic)]
  return null
}
function reduceFact(
  call: CallDocument,
  dispatch: DispatchDocument,
  fact: TransportFact,
): ModelFailure | null {
  if (fact.kind !== 'account' && dispatch.logicalTerminal !== null)
    return invalid('facts', 'after-terminal')
  if (fact.kind === 'account')
    return accountFact(call, dispatch, {
      event: fact.event,
      report: fact.value,
      receipt: 'received',
    })
  if (fact.kind === 'diagnostic') return diagnosticFact(dispatch, fact.value)
  if (fact.kind === 'ended') return endDispatch(call, dispatch, fact.termination)
  return reduceBlock(dispatch, fact)
}
function reduceBlock(
  dispatch: DispatchDocument,
  fact: Exclude<TransportFact, { kind: 'account' | 'diagnostic' | 'ended' }>,
): ModelFailure | null {
  if (!decimal(fact.index) || !Number.isSafeInteger(Number(fact.index)))
    return invalid('index', 'safe-integer')
  const prior = dispatch.blocks.find(b => b.index === fact.index)
  if (fact.kind === 'block-open') return openBlock(dispatch, fact, prior)
  if (fact.kind === 'block-delta' || fact.kind === 'block-replace')
    return fillBlock(dispatch, fact, prior)
  if (fact.kind === 'block-seal') return sealBlock(dispatch, fact, prior)
  return trimBlock(dispatch, fact, prior)
}
export function reduceFacts(
  call: CallDocument,
  dispatch: DispatchDocument,
  facts: readonly TransportFact[],
): ModelFailure | null {
  for (const fact of facts) {
    const failure = reduceFact(call, dispatch, fact)
    if (failure) return failure
  }
  return null
}
/**
 * Records an actual terminal that arrived late. Content that does not form a message leaves the
 * logical terminal open; reasoning state without a known replay range refuses the whole fact, as
 * at the finish.
 */
export function lateTerminal(
  call: CallDocument,
  dispatch: DispatchDocument,
  actual: Termination,
): ModelFailure | null {
  dispatch.record = { ...dispatch.record, terminal: structuredClone(actual) }
  if (dispatch.logicalTerminal !== null) return null
  const completion = completionOf(call, dispatch, actual)
  if (completion.kind === 'replay-unknown') return completion.failure
  if (completion.kind === 'formed') dispatch.logicalTerminal = structuredClone(actual)
  return null
}
export function mergeReceiveWindow(
  call: CallDocument,
  dispatch: DispatchDocument,
  window: string,
  proven: boolean,
): void {
  dispatch.windows.set(
    window,
    dispatch.record.firstContent === 'observed' || proven ? 'closed' : 'unproven',
  )
  const otherOpen = call.dispatches.some(d =>
    [...d.windows.values()].some(state => state !== 'closed'),
  )
  if (dispatch.record.firstContent !== 'observed' && proven && !otherOpen)
    dispatch.record = { ...dispatch.record, firstContent: 'none-proven' }
  if (call.state.phase === 'running')
    call.state = { ...call.state, firstContent: dispatch.record.firstContent }
}

// --- Consumption: read relations and cleanup.

export function expireReads(call: CallDocument, now: () => string, idleMs: number): void {
  for (const read of call.reads.values()) {
    if (
      read.state.kind === 'reading' &&
      Date.parse(now()) - Date.parse(read.lastProgress) >= idleMs
    )
      read.state = { kind: 'ended', reason: 'stalled' }
  }
}
export function releaseMaterial(call: CallDocument): void {
  call.request = null
  call.snapshots.clear()
  for (const dispatch of call.dispatches) {
    dispatch.blocks = []
    dispatch.assembly = null
    dispatch.nextSeq.clear()
    dispatch.trims.clear()
    dispatch.hadContent.clear()
    dispatch.windows.clear()
  }
}

// --- The core.

/** The methods whose unresolved write blocks a later write of the same method on the same call. */
const ORDERED_METHODS: readonly ModelWriteMethod[] = [
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

export type WriteArguments<T> = {
  input: WriteIdentity
  method: ModelWriteMethod
  fields: unknown
  check: (
    call: CallDocument | undefined,
    root: TenantDocuments,
    replay: boolean,
  ) => ModelFailure | null
  apply: (draft: Draft) => Outcome<Applied<T>, ModelFailure>
  replay: (call: CallDocument | undefined, binding: Binding) => Outcome<T, ModelFailure>
}
export type CallAccessInput<P> = Access<P> & { readonly call: ModelCallId }

/**
 * The shared commands core. It owns the rules of the 22 methods and reads and writes documents
 * only through `storage`. One write: identity, access, fingerprint, recovery of a bound operation,
 * the block of an unresolved ordered write, the change on a copy, the call capacity, then one
 * `commit`.
 */
export class ModelCommandCore<P> {
  readonly options: ModelCommandsCoreOptions<P>
  readonly storage: ModelCommandStorage
  private owners: readonly ModelConsumerOwnerDeclaration[]

  constructor(options: ModelCommandsCoreOptions<P>, storage: ModelCommandStorage) {
    this.storage = storage
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
  }
  replaceOwners(owners: readonly ModelConsumerOwnerDeclaration[]): void {
    this.owners = this.checkOwners(owners)
  }
  /**
   * Runs a read attempt under the scope of its tenant and, when it names one, its call. A read
   * names no operation, even when its input carries one. A tenant that has no canonical text gets
   * no scope: `work` then answers it with the same `denied` failure as before.
   */
  runRead<T>(
    input: Readonly<{ tenant: TenantId; call?: ModelCallId }>,
    work: () => Outcome<T, ModelFailure>,
  ): Promise<Outcome<T, ModelFailure>> {
    const tenant = tenantKey(input.tenant)
    if (typeof tenant !== 'string') return this.storage.run(work)
    const scope: RunScope = input.call === undefined ? { tenant } : { tenant, call: input.call }
    return this.storage.run(work, scope)
  }
  /** Runs a write attempt under the scope of its tenant, call and operation. */
  runWrite<T>(
    input: Readonly<{ tenant: TenantId; call: ModelCallId; operation: ModelOperationId }>,
    work: () => Outcome<T, ModelFailure>,
  ): Promise<Outcome<T, ModelFailure>> {
    const tenant = tenantKey(input.tenant)
    if (typeof tenant !== 'string') return this.storage.run(work)
    return this.storage.run(work, { tenant, call: input.call, operation: input.operation })
  }
  identity(input: Pick<ExecutionRef, 'tenant' | 'call'>): string | ModelFailure {
    const key = tenantKey(input.tenant)
    if (typeof key !== 'string') return key
    const id = decodeModelCallId(input.call)
    return 'failure' in id ? invalid('call', id.failure.reason) : key
  }
  authorize(
    input: Access<P>,
    action: CommandAction,
    call?: CallDocument,
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
  execution(input: ExecutionRef, call: CallDocument | undefined): ModelFailure | null {
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
  adapter(call: CallDocument): ModelCommandsEvidence | ModelFailure {
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
  read<T>(
    input: CallAccessInput<P>,
    action: CommandAction,
    work: (call: CallDocument, root: TenantDocuments) => Outcome<T, ModelFailure>,
  ): Outcome<T, ModelFailure> {
    const key = this.identity(input)
    if (typeof key !== 'string') return { failure: key }
    const root = this.storage.documents(key)
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
  private writeIdentity(input: WriteIdentity): string | ModelFailure {
    const key = this.identity(input)
    if (typeof key !== 'string') return key
    if (
      'failure' in decodeModelOperationId(input.operation) ||
      input.operation.startsWith('mop_--')
    )
      return invalid('operation', 'reserved-or-invalid')
    return key
  }
  private replayWrite<T>(
    args: WriteArguments<T>,
    original: CallDocument | undefined,
    binding: Binding | undefined,
    fingerprint: string,
  ): Outcome<T, ModelFailure> | null {
    const { input } = args
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
    return null
  }
  private pendingWrite(
    root: TenantDocuments,
    call: ModelCallId,
    method: ModelWriteMethod,
  ): ModelFailure | null {
    if (ORDERED_METHODS.includes(method)) {
      const pending = [...root.operations].find(
        ([, operation]) =>
          operation.call === call && operation.method === method && operation.status === 'unknown',
      )
      if (pending) return { kind: 'commit-unknown', operation: pending[0] }
    }
    return null
  }
  write<T>(args: WriteArguments<T>): Outcome<T, ModelFailure> {
    const { input } = args
    const key = this.writeIdentity(input)
    if (typeof key !== 'string') return { failure: key }
    const root = this.storage.documents(key)
    const original = root.calls.get(input.call)
    const binding = root.operations.get(input.operation)
    const checked = args.check(original, root, binding !== undefined)
    if (checked) return { failure: checked }
    const fingerprint = digest({ version: 1, fields: args.fields })
    const replayed = this.replayWrite(args, original, binding, fingerprint)
    if (replayed) return replayed
    const pending = this.pendingWrite(root, input.call, args.method)
    if (pending) return { failure: pending }
    const draft: Draft = {
      tenant: root,
      call: original === undefined ? undefined : copyCall(original),
    }
    const applied = args.apply(draft)
    if ('failure' in applied) return applied
    const call = draft.call
    if (call && call.request !== null && materialBytes(call) > BigInt(call.capacity.bytes))
      return { failure: { kind: 'capacity', required: call.capacity } }
    const status = this.storage.commit(key, {
      operation: input.operation,
      expected: original,
      call,
      binding: {
        call: input.call,
        method: args.method,
        fingerprint,
        revision: call?.state.revision ?? revision(),
        receipt: applied.ok.receipt,
      },
    })
    if (status === 'unknown')
      return { failure: { kind: 'commit-unknown', operation: input.operation } }
    return { ok: applied.ok.value }
  }

  // --- Send binding: whether a send demand still matches the prepared dispatch.

  sendBinding(
    input: SendDemand<P>,
    call: CallDocument | undefined,
    stage: 'access' | 'prepare' = 'prepare',
  ): ModelFailure | null {
    if (
      input.execution.call !== input.call ||
      tenantKey(input.execution.tenant) !== tenantKey(input.tenant)
    )
      return invalid('execution', 'send-binding')
    if (!call) return invalid('call', 'not-found')
    if (stage === 'prepare') {
      const failure = this.execution(input.execution, call)
      if (failure) return failure
      if (call.state.control.kind !== 'none' || call.state.phase === 'settled')
        return invalid('call', 'send-no-longer-valid')
    }
    return this.requestBinding(input, call)
  }
  private requestBinding(input: SendDemand<P>, call: CallDocument): ModelFailure | null {
    const checked = judgeFixedModelRequest(input.request)
    if ('failure' in checked) return invalid(checked.failure.field, checked.failure.reason)
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
  currentCredential(
    input: SendDemand<P>,
    call: CallDocument,
    receipt: MaterializationReceipt,
    window: string,
    registered: readonly ModelSendSource<P>[],
  ): Outcome<CredentialSelection, ModelFailure> {
    const failure = this.sendBinding(input, call)
    if (failure) return { failure }
    const dispatch = call.dispatches.find(d => d.record.dispatch === input.dispatch)
    if (
      !dispatch?.record.materialization ||
      dispatch.record.send !== 'prepared' ||
      digest(dispatch.record.materialization.receipt) !== digest(receipt) ||
      dispatch.windows.get(window) !== 'open'
    )
      return { failure: invalid('dispatch', 'send-not-prepared') }
    const source = registered.find(
      source =>
        digest(source.profile) === digest(input.request.profile) &&
        digest(source.supplier) === digest(input.supplier.adoption) &&
        source.recipient === input.supplier.recipient &&
        source.model === input.supplier.model,
    )
    if (!source) return { failure: unavailable('model-send-source', 'source-not-registered') }
    return this.sourceCredential(input, source)
  }
  private sourceCredential(
    input: SendDemand<P>,
    source: ModelSendSource<P>,
  ): Outcome<CredentialSelection, ModelFailure> {
    const current = source.current(input)
    if ('failure' in current) return current
    if (!current.ok.authorized) return { failure: { kind: 'denied', action: 'send-source' } }
    const credential = input.supplier.credential
    if (credential.kind === 'tenant') return { ok: { id: credential.id, scope: 'tenant' as const } }
    if (
      source.credential.kind !== 'factory' ||
      source.credential.official !== true ||
      !current.ok.noTenantBinding ||
      'failure' in decodeCredentialId(source.credential.queryId)
    )
      return { failure: unavailable('model-send-source', 'factory-source-unavailable') }
    return { ok: { id: source.credential.queryId, scope: 'factory' as const } }
  }

  // --- Read relations and result pages.

  private authorizedRead(
    input: CallAccessInput<P>,
    read: ReadId,
  ): Outcome<{ key: string; call: CallDocument; relation: ReadRelation }, ModelFailure> {
    const key = this.identity(input)
    if (typeof key !== 'string') return { failure: key }
    const root = this.storage.documents(key)
    const original = root.calls.get(input.call)
    const auth = this.authorize(input, 'content', original, input.call)
    if (!original) return 'failure' in auth ? auth : { failure: invalid('call', 'not-found') }
    const call = copyCall(original)
    const relation = call.reads.get(read)
    if (!relation) return 'failure' in auth ? auth : { failure: invalid('read', 'not-found') }
    if ('failure' in auth) {
      if (auth.failure.kind === 'denied') {
        relation.state = { kind: 'ended', reason: 'denied' }
        this.storage.publish(key, call)
      }
      return auth
    }
    return { ok: { key, call, relation } }
  }
  private readOffset(
    call: CallDocument,
    relation: ReadRelation,
    after: string | undefined,
  ): Outcome<{ offset: number; total: number }, ModelFailure> {
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
          call.resultPaging.resultPageParts,
          call.resultPaging.resultPageTargetBytes,
        )
    )
      return { failure: invalid('after', 'page') }
    let boundary = 0
    const parts = resultParts(call)
    while (boundary < offset)
      boundary = pageEnd(
        parts,
        boundary,
        call.resultPaging.resultPageParts,
        call.resultPaging.resultPageTargetBytes,
      )
    if (boundary !== offset) return { failure: invalid('after', 'page') }
    return { ok: { offset, total: parts.length } }
  }
  private advanceRead(
    call: CallDocument,
    relation: ReadRelation,
    action: 'next' | 'end' | 'refresh',
    after: string | undefined,
  ): Outcome<ReadRelation['state'], ModelFailure> {
    if (action === 'end') relation.state = { kind: 'ended', reason: 'closed' }
    else if (
      Date.parse(this.options.clock.now()) - Date.parse(relation.lastProgress) >=
      this.options.limits.readIdleMs
    )
      relation.state = { kind: 'ended', reason: 'stalled' }
    else if (action === 'next') {
      const checked = this.readOffset(call, relation, after)
      if ('failure' in checked) return checked
      const { offset, total } = checked.ok
      relation.state =
        offset === total ? { kind: 'ended', reason: 'complete' } : { kind: 'reading', offset }
      if (offset > relation.furthest) {
        relation.furthest = offset
        relation.lastProgress = this.options.clock.now()
      }
    }
    return { ok: relation.state }
  }
  updateRead(
    input: CallAccessInput<P>,
    read: ReadId,
    action: 'next' | 'end' | 'refresh',
    after?: string,
  ): Outcome<ReadState, ModelFailure> {
    const authorized = this.authorizedRead(input, read)
    if ('failure' in authorized) return authorized
    const { key, call, relation } = authorized.ok
    if (relation.state.kind === 'ended') return { ok: structuredClone(relation.state) }
    const advanced = this.advanceRead(call, relation, action, after)
    if ('failure' in advanced) return advanced
    if (call.request !== null && materialBytes(call) > BigInt(call.capacity.bytes))
      return { failure: { kind: 'capacity', required: structuredClone(call.capacity) } }
    this.storage.publish(key, call)
    return {
      ok:
        advanced.ok.kind === 'ended'
          ? structuredClone(advanced.ok)
          : this.page(call, advanced.ok.offset),
    }
  }
  page(call: CallDocument, offset: number): ReadState {
    if (call.state.phase !== 'settled') throw new TypeError('read page without settlement')
    return {
      kind: 'reading',
      page: structuredClone(
        makePage(
          resultParts(call),
          offset,
          call.resultPaging.resultPageParts,
          call.resultPaging.resultPageTargetBytes,
          call.state.settlement,
        ),
      ),
    }
  }
}
