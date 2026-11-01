import type { CredentialSelection, SendCoordinator, SendStart } from '../send.ts'
import type { MemorySendSource } from './types.ts'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeModelOperationId } from '@omne-harness/model-contract'
import type {
  Access,
  ConsumerRef,
  MaterializationReceipt,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  ReadId,
  ReadState,
  ResultCapacity,
} from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  ModelConsumerOwnerDeclaration,
  SendDemand,
} from '@omne-harness/model-contract/provider'
import { encodedBytes, materialBytes } from '../commands/judge.ts'
import {
  ModelCommandCore,
  copyCall,
  type CallAccessInput,
  type WriteArguments,
} from '../commands/state.ts'
import type { CommandWrite, ModelCommandStorage } from '../commands/storage.ts'
import type {
  Binding,
  CallDocument,
  DispatchDocument,
  ReadRelation,
  TenantDocuments,
} from '../commands/types.ts'
import { MEMORY_WRITE_METHODS } from './types.ts'
import type {
  MemoryAction,
  MemoryModelCommandsOptions,
  MemoryModelControl,
  MemoryModelEvidence,
  UnknownInjection,
} from './types.ts'
import { positiveLimit } from './value.ts'

export type { Applied, Binding, Draft, Receipt, WriteIdentity } from '../commands/types.ts'
export { bump } from '../commands/state.ts'
export type MemoryRead = ReadRelation
export type MemoryDispatch = DispatchDocument
export type MemoryCall = CallDocument
export type TenantState = {
  calls: Map<ModelCallId, MemoryCall>
  operations: Map<ModelOperationId, Binding>
}

/**
 * The memory storage of the shared commands core, and the test controls over it. One
 * synchronous fence lets one attempt, control or send check run at a time.
 */
export class MemoryState<P> implements ModelCommandStorage {
  private roots = new Map<string, TenantState>()
  private plans = new Map<string, UnknownInjection>()
  private busy = false
  private sendClaims = new Map<string, 'claimed' | SendStart['kind']>()
  readonly core: ModelCommandCore<P>
  readonly control: MemoryModelControl
  readonly options: MemoryModelCommandsOptions<P>

  constructor(options: MemoryModelCommandsOptions<P>) {
    this.core = new ModelCommandCore(options, this)
    this.options = this.core.options
    this.control = {
      configureResultPaging: input =>
        this.exclusive(() => {
          const key = this.identity(input)
          if (typeof key !== 'string') throw new TypeError('invalid paging identity')
          positiveLimit(input.resultPageParts, 'resultPageParts')
          positiveLimit(input.resultPageTargetBytes, 'resultPageTargetBytes')
          const root = this.roots.get(key)
          const original = root?.calls.get(input.call)
          if (!root || !original) throw new TypeError('unknown paging call')
          if (original.state.phase === 'settled' || original.reads.size > 0)
            throw new TypeError('result paging is frozen')
          const call = copyCall(original)
          call.resultPaging = {
            resultPageParts: input.resultPageParts,
            resultPageTargetBytes: input.resultPageTargetBytes,
          }
          if (materialBytes(call) > BigInt(call.capacity.bytes))
            throw new RangeError('result paging exceeds call capacity')
          this.publish(key, call)
        }),
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
          this.core.replaceOwners(owners)
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
          this.publish(key, call)
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

  // --- ModelCommandStorage.

  run<T>(work: () => Outcome<T, ModelFailure>): Promise<Outcome<T, ModelFailure>> {
    return Promise.resolve(this.exclusive(work))
  }
  documents(key: string): TenantDocuments {
    return this.root(key)
  }
  /** The memory storage sums every tenant: its capacity is one bound for the whole assembly. */
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
  /** An injected unknown makes the write unresolved; `not-applied` leaves the call unchanged. */
  commit(key: string, write: CommandWrite): 'committed' | 'unknown' {
    const root = this.root(key)
    const { call: id } = write.binding
    if (root.calls.get(id) !== write.expected)
      throw new TypeError('memory Model single writer: the call changed inside one attempt')
    const tenant = { calls: new Map(root.calls), operations: new Map(root.operations) }
    if (write.call) tenant.calls.set(id, write.call)
    const planKey = `${key}:${write.operation}`
    const plan = this.plans.get(planKey)
    const matched = plan?.call === id && plan.method === write.binding.method ? plan : undefined
    const binding: Binding =
      matched === undefined
        ? { ...write.binding, status: 'committed' }
        : { ...write.binding, status: 'unknown', effect: matched.effect }
    if (matched?.effect === 'not-applied') {
      tenant.calls = new Map(root.calls)
      tenant.operations = new Map(root.operations)
    }
    tenant.operations.set(write.operation, binding)
    this.roots.set(key, tenant)
    if (matched === undefined) return 'committed'
    this.plans.delete(planKey)
    return 'unknown'
  }
  publish(key: string, call: CallDocument): void {
    const root = this.root(key)
    const next = { calls: new Map(root.calls), operations: new Map(root.operations) }
    next.calls.set(call.state.call, call)
    this.roots.set(key, next)
  }

  // --- The memory state that the test assembly reads.

  identity(input: Pick<ExecutionRef, 'tenant' | 'call'>): string | ModelFailure {
    return this.core.identity(input)
  }
  root(key: string): TenantState {
    return this.roots.get(key) ?? { calls: new Map(), operations: new Map() }
  }
  read<T>(
    input: CallAccessInput<P>,
    action: MemoryAction,
    work: (call: MemoryCall, root: TenantDocuments) => Outcome<T, ModelFailure>,
  ): Outcome<T, ModelFailure> {
    return this.core.read(input, action, work)
  }
  execution(input: ExecutionRef, call: MemoryCall | undefined): ModelFailure | null {
    return this.core.execution(input, call)
  }
  authorize(
    input: Access<P>,
    action: MemoryAction,
    call?: MemoryCall,
    callId?: ModelCallId,
    consumer?: ConsumerRef,
  ): Outcome<ActorRef, ModelFailure> {
    return this.core.authorize(input, action, call, callId, consumer)
  }
  adapter(call: MemoryCall): MemoryModelEvidence | ModelFailure {
    return this.core.adapter(call)
  }
  owner(owner: string): ModelConsumerOwnerDeclaration | undefined {
    return this.core.owner(owner)
  }
  write<T>(args: WriteArguments<T>): Outcome<T, ModelFailure> {
    return this.core.write(args)
  }
  updateRead(
    input: CallAccessInput<P>,
    read: ReadId,
    action: 'next' | 'end' | 'refresh',
    after?: string,
  ): Outcome<ReadState, ModelFailure> {
    return this.core.updateRead(input, read, action, after)
  }
  page(call: MemoryCall, offset: number): ReadState {
    return this.core.page(call, offset)
  }
  sendBinding(
    input: SendDemand<P>,
    call: MemoryCall | undefined,
    stage: 'access' | 'prepare' = 'prepare',
  ): ModelFailure | null {
    return this.core.sendBinding(input, call, stage)
  }
  sendCoordinator(sources: readonly MemorySendSource<P>[]): SendCoordinator<P> {
    const registered = sources.map(source => ({
      ...source,
      profile: structuredClone(source.profile),
      supplier: structuredClone(source.supplier),
      credential: structuredClone(source.credential),
    }))
    const refused = (failure: ModelFailure): SendStart => ({ kind: 'refused', failure })
    return {
      check: (input, stage) =>
        this.exclusive(() =>
          this.read(input, 'send', call => {
            const failure = this.sendBinding(input, call, stage)
            return failure ? { failure } : { ok: undefined }
          }),
        ),
      withinCurrent: (input, receipt: MaterializationReceipt, window, start) =>
        this.exclusive(() => {
          const checked = this.read<CredentialSelection>(input, 'send', call => {
            return this.core.currentCredential(input, call, receipt, window, registered)
          })
          if ('failure' in checked) return refused(checked.failure)
          const key = this.identity(input)
          if (typeof key !== 'string') return refused(key)
          const claim = JSON.stringify([key, input.call, input.dispatch])
          if (this.sendClaims.has(claim))
            return { kind: 'unknown', diagnostic: 'dispatch-already-claimed' }
          this.sendClaims.set(claim, 'claimed')
          try {
            const result = start(checked.ok)
            this.sendClaims.set(claim, result.kind)
            return result
          } catch {
            this.sendClaims.set(claim, 'unknown')
            return { kind: 'unknown', diagnostic: 'transport-start-unknown' }
          }
        }),
    }
  }
}
