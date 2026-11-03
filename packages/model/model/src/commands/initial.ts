import { randomBytes } from 'node:crypto'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type CallAccess,
  type ConsumerRef,
  type DurableEvidence,
  type ModelFailure,
  type ModelInstanceId,
  type ModelOperationId,
  type Reply,
} from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  ModelCommands,
  ModelDriveInput,
} from '@omne-harness/model-contract/provider'
import type { SendCoordinator } from '../send.ts'
import type { ModelCommandCore } from './state.ts'
import type { RunScope } from './storage.ts'
import type {
  Binding,
  BindingBase,
  CallDocument,
  ModelCommandsEvidence,
  ModelConfirmationPass,
  ModelRunCompletion,
} from './types.ts'
import { checkedActor, digest, invalid, positiveLimit, tenantKey, unavailable } from './value.ts'

export type InitialTarget = Pick<ExecutionRef, 'tenant' | 'call'>
export type ModelAcceptedOrigin = InitialTarget &
  Readonly<{ initiator: ActorRef; consumer: ConsumerRef }>
export type ModelInitialRunLimits = Readonly<{
  maxRecords: number
  maxBindings: number
  maxCallsPerBinding: number
}>
declare const initialRunBrand: unique symbol
export interface ModelInitialRun<P> {
  readonly [initialRunBrand]: (principal: P) => P
}
export interface ModelInitialExecution<P> {
  readAcceptance(target: InitialTarget): Reply<ModelAcceptedOrigin>
  openHost(
    input: Readonly<{ instance: ModelInstanceId }>,
  ): Outcome<ModelInitialHostChannel<P>, ModelFailure>
  continuity(
    input: Parameters<ModelCommandsEvidence['continuity']>[0],
  ): Outcome<DurableEvidence, ModelFailure>
}
export interface ModelInitialHostChannel<P> {
  prepare(access: CallAccess<P>): Reply<ModelDriveInput<P>>
  qualifyExecution(input: ExecutionRef): Outcome<ActorRef, ModelFailure>
  readonly commands: ModelCommands<P>
  readonly coordinator: SendCoordinator<P> | null
  close(): void
}
export interface BoundCommandAccess<P> {
  claim(input: ModelDriveInput<P>, call: CallDocument | undefined): Outcome<void, ModelFailure>
  execution(input: ExecutionRef): Outcome<ActorRef, ModelFailure>
}
type LocalAdmission = Readonly<{
  tenant: string
  call: InitialTarget['call']
  admission: ModelOperationId
  admissionFingerprint: string
}>
type BoundRecord = LocalAdmission &
  Readonly<{
    kind: 'bound'
    binding: object
    instance: ModelInstanceId
    operation: ModelOperationId
    continuity: DurableEvidence
    evidenceAdoption: Adoption
    execution: ExecutionRef | null
  }>
type AdmittedRecord = LocalAdmission & Readonly<{ kind: 'admitted' }>
type InitialRecord = LocalAdmission &
  (Readonly<{ kind: 'admission-pending' }> | Readonly<{ kind: 'admitted' }> | BoundRecord)
const failure = (diagnostic: string) => unavailable('model-initial-execution', diagnostic)
const denied = (): ModelFailure => ({ kind: 'denied', action: 'execution-channel' })
const keyOf = (tenant: string, call: InitialTarget['call']) => JSON.stringify([tenant, call])
const initialRunAccess = Object.freeze({})

/** A recovery read of a call that the storage does not hold has no initial record either. */
function recordMissing<T>(result: Outcome<T, ModelFailure>): Outcome<T, ModelFailure> {
  return 'failure' in result &&
    result.failure.kind === 'invalid' &&
    result.failure.field === 'call' &&
    result.failure.reason === 'not-found'
    ? { failure: failure('initial-record-missing') }
    : result
}
/** The call, operation and binding that one confirmed pass wrote or saw for the record's call. */
type ConfirmedWrite = Readonly<{
  call: CallDocument
  operation: ModelOperationId | undefined
  binding: BindingBase | Binding
}>
function passWrite(pass: ModelConfirmationPass, scope: RunScope) {
  const staged = pass.staged?.kind === 'write' ? pass.staged.write : undefined
  return {
    call: staged?.call ?? (pass.staged?.kind === 'publish' ? pass.staged.call : pass.seen?.call),
    operation: staged ? staged.operation : scope.operation,
    binding: staged?.binding ?? pass.seen?.operation,
  }
}
/** The write of the pass, when it names the record's call and admission under a committed binding. */
function confirmedWrite(
  pass: ModelConfirmationPass,
  scope: RunScope,
  record: LocalAdmission,
): ConfirmedWrite | null {
  const { call, operation, binding } = passWrite(pass, scope)
  if (
    !call ||
    call.state.call !== record.call ||
    call.admission !== record.admission ||
    !binding ||
    ('status' in binding && binding.status !== 'committed')
  )
    return null
  return { call, operation, binding }
}
/** The pending record's own admit, under its admission operation and fingerprint. */
function admitsPending(record: LocalAdmission, write: ConfirmedWrite): boolean {
  const { binding } = write
  return (
    write.operation === record.admission &&
    binding.call === record.call &&
    binding.method === 'admit' &&
    binding.fingerprint === record.admissionFingerprint
  )
}
/** The execution of the bound record's own claim, for its instance and the claimed generation. */
function claimedExecution(record: BoundRecord, write: ConfirmedWrite): ExecutionRef | null {
  const { binding, call } = write
  return write.operation === record.operation &&
    binding.call === record.call &&
    binding.method === 'claim' &&
    binding.receipt.kind === 'claim' &&
    call.execution?.instance === record.instance &&
    call.execution.generation === binding.receipt.generation
    ? call.execution
    : null
}

type InitialRunPort<P> = Readonly<{
  beginAdmission(input: LocalAdmission): Outcome<void, ModelFailure>
  finishConfirmation(pass: ModelConfirmationPass | null, completion: ModelRunCompletion): void
  failConfirmation(pass: ModelConfirmationPass | null): void
  boundAccess(bound: BoundCommandAccess<P> | undefined): BoundCommandAccess<P> | null
  createExecution(
    core: ModelCommandCore<P>,
    commands: (bound: BoundCommandAccess<P>) => ModelCommands<P>,
    coordinator?: (bound: BoundCommandAccess<P>) => SendCoordinator<P>,
  ): ModelInitialExecution<P>
}>

class InitialRun<P> implements ModelInitialRun<P> {
  declare readonly [initialRunBrand]: (principal: P) => P
  readonly #records = new Map<string, InitialRecord>()
  readonly #unavailable = new Set<string>()
  readonly #bindings = new Map<ModelInstanceId, object>()
  readonly #gates = new WeakSet<BoundCommandAccess<P>>()
  readonly #limits: ModelInitialRunLimits
  readonly #origin: (target: InitialTarget) => Outcome<void, ModelFailure>
  readonly #port: InitialRunPort<P>
  #closed = false

  constructor(
    access: object,
    options: Readonly<{
      limits: ModelInitialRunLimits
      checkOriginRead(target: InitialTarget): Outcome<void, ModelFailure>
    }>,
  ) {
    if (access !== initialRunAccess) throw new TypeError('initialRun must come from its factory')
    for (const name of ['maxRecords', 'maxBindings', 'maxCallsPerBinding'] as const)
      positiveLimit(options.limits[name], name)
    this.#limits = Object.freeze({ ...options.limits })
    this.#origin = options.checkOriginRead
    this.#port = Object.freeze({
      beginAdmission: input => this.#beginAdmission(input),
      finishConfirmation: (pass, completion) => this.#finishConfirmation(pass, completion),
      failConfirmation: pass => this.#disable(pass),
      boundAccess: bound => this.#boundAccess(bound),
      createExecution: (core, commands, coordinator) =>
        this.#createExecution(core, commands, coordinator),
    })
  }
  static access<P>(access: object, run: ModelInitialRun<P>): InitialRunPort<P> {
    if (access !== initialRunAccess || !(run instanceof InitialRun) || !(#port in run))
      throw new TypeError('initialRun must be the original factory object')
    return run.#port
  }
  #beginAdmission(input: LocalAdmission): Outcome<void, ModelFailure> {
    if (this.#closed) return { failure: failure('confirmation-unavailable') }
    const key = keyOf(input.tenant, input.call)
    const previous = this.#records.get(key)
    if (previous)
      return previous.admission === input.admission &&
        previous.admissionFingerprint === input.admissionFingerprint
        ? { ok: undefined }
        : { failure: failure('successor-unavailable') }
    if (this.#records.size >= this.#limits.maxRecords)
      return { failure: failure('record-capacity') }
    this.#records.set(key, { ...input, kind: 'admission-pending' })
    return { ok: undefined }
  }
  #finishConfirmation(pass: ModelConfirmationPass | null, completion: ModelRunCompletion): void {
    try {
      if (completion.kind === 'threw') {
        this.#disable(pass)
        return
      }
      if (completion.kind !== 'confirmed' || pass?.scope?.call === undefined) return
      const key = keyOf(pass.scope.tenant, pass.scope.call)
      const record = this.#records.get(key)
      if (!record || this.#unavailable.has(key)) return
      const write = confirmedWrite(pass, pass.scope, record)
      if (write) this.#confirmRecord(key, record, write)
    } catch (error) {
      this.#disable(pass)
      throw error
    }
  }
  /** A confirmed admit makes the pending record admitted; a confirmed claim gives the bound one its execution. */
  #confirmRecord(key: string, record: InitialRecord, write: ConfirmedWrite): void {
    if (record.kind === 'admission-pending' && admitsPending(record, write))
      this.#records.set(key, { ...record, kind: 'admitted' })
    if (record.kind !== 'bound') return
    const execution = claimedExecution(record, write)
    if (execution) this.#records.set(key, { ...record, execution: { ...execution } })
  }
  #disable(pass: ModelConfirmationPass | null): void {
    if (pass?.scope?.call === undefined) this.#closed = true
    else this.#unavailable.add(keyOf(pass.scope.tenant, pass.scope.call))
  }
  #boundAccess(bound: BoundCommandAccess<P> | undefined): BoundCommandAccess<P> | null {
    return bound !== undefined && this.#gates.has(bound) ? bound : null
  }
  /** A random operation and continuity record that no bound record of this run uses yet. */
  #mintIdentity(
    record: LocalAdmission,
    instance: ModelInstanceId,
    evidenceAdoption: Adoption,
  ): Outcome<Readonly<{ operation: ModelOperationId; continuity: DurableEvidence }>, ModelFailure> {
    try {
      const decoded = decodeModelOperationId(`mop_${randomBytes(16).toString('hex')}`)
      if ('failure' in decoded) return { failure: failure('identity-unavailable') }
      const operation = decoded.ok
      if ([...this.#records.values()].some(r => r.kind === 'bound' && r.operation === operation))
        return { failure: failure('identity-unavailable') }
      const continuity: DurableEvidence = {
        owner: 'model',
        record: `initial:${randomBytes(16).toString('hex')}`,
        revision: '1',
        digest: digest({
          format: 'model-initial-v1',
          tenant: record.tenant,
          call: record.call,
          admission: record.admission,
          instance,
          operation,
          evidenceAdoption,
        }),
      }
      if (
        [...this.#records.values()].some(
          r => r.kind === 'bound' && r.continuity.record === continuity.record,
        )
      )
        return { failure: failure('identity-unavailable') }
      return { ok: { operation, continuity } }
    } catch {
      return { failure: failure('identity-unavailable') }
    }
  }
  #createExecution(
    core: ModelCommandCore<P>,
    commands: (bound: BoundCommandAccess<P>) => ModelCommands<P>,
    coordinator?: (bound: BoundCommandAccess<P>) => SendCoordinator<P>,
  ): ModelInitialExecution<P> {
    const locate = (
      target: InitialTarget,
    ): Outcome<{ key: string; record: InitialRecord | undefined }, ModelFailure> => {
      const tenant = core.identity(target)
      if (typeof tenant !== 'string') return { failure: tenant }
      const key = keyOf(tenant, target.call)
      if (this.#closed || this.#unavailable.has(key))
        return { failure: failure('confirmation-unavailable') }
      return { ok: { key, record: this.#records.get(key) } }
    }
    return Object.freeze({
      readAcceptance: (raw: InitialTarget) => {
        const target = { tenant: raw.tenant, call: raw.call }
        const identity = core.identity(target)
        if (typeof identity !== 'string') return Promise.resolve({ failure: identity })
        const checked = this.#origin(target)
        if ('failure' in checked) return Promise.resolve(checked)
        return core.runRead<ModelAcceptedOrigin>(target, () => {
          const current = this.#origin(target)
          if ('failure' in current) return current
          const documents = core.storage.documents(identity)
          const call = documents.calls.get(target.call)
          const unknown = [...documents.operations].find(
            ([, operation]) => operation.call === target.call && operation.status === 'unknown',
          )
          if (unknown) return { failure: { kind: 'commit-unknown', operation: unknown[0] } }
          if (!call) return { failure: invalid('call', 'not-found') }
          return {
            ok: {
              tenant: target.tenant,
              call: target.call,
              initiator: structuredClone(call.initiator),
              consumer: structuredClone(call.state.consumer),
            },
          }
        })
      },
      openHost: ({ instance }: Readonly<{ instance: ModelInstanceId }>) => {
        if (this.#closed) return { failure: failure('confirmation-unavailable') }
        if ('failure' in decodeModelInstanceId(instance))
          return { failure: invalid('instance', 'identity') }
        if (this.#bindings.has(instance)) return { failure: invalid('instance', 'already-bound') }
        if (this.#bindings.size >= this.#limits.maxBindings)
          return { failure: failure('binding-capacity') }
        const binding = Object.freeze({})
        this.#bindings.set(instance, binding)
        let live = true
        let calls = 0
        const belongs = (target: InitialTarget): Outcome<BoundRecord, ModelFailure> => {
          if (!live) return { failure: denied() }
          const found = locate(target)
          if ('failure' in found) return found
          const { record } = found.ok
          return record?.kind === 'bound' && record.binding === binding
            ? { ok: record }
            : { failure: denied() }
        }
        const gate: BoundCommandAccess<P> = {
          claim: (input, call) => {
            const found = belongs(input)
            if ('failure' in found) return found
            const record = found.ok
            if (
              input.instance !== instance ||
              input.operation !== record.operation ||
              digest(input.continuity) !== digest(record.continuity) ||
              call?.admission !== record.admission
            )
              return { failure: denied() }
            const auth = core.authorize(input, 'recovery', call, input.call)
            return 'failure' in auth ? auth : { ok: undefined }
          },
          execution: input => {
            const found = belongs(input)
            if ('failure' in found) return found
            const execution = found.ok.execution
            if (
              !execution ||
              execution.instance !== input.instance ||
              execution.generation !== input.generation
            )
              return { failure: denied() }
            return checkedActor(core.options.authority.execution(input))
          },
        }
        /** This binding's prepared input again, while the record is still its own original execution. */
        const rebound = (
          record: BoundRecord,
          access: CallAccess<P>,
          call: CallDocument,
        ): Outcome<ModelDriveInput<P>, ModelFailure> => {
          if (
            record.binding !== binding ||
            (record.execution !== null && digest(record.execution) !== digest(call.execution))
          )
            return { failure: failure('successor-unavailable') }
          return {
            ok: {
              ...access,
              instance,
              operation: record.operation,
              continuity: structuredClone(record.continuity),
            },
          }
        }
        /** Binds an admitted call to this channel under a fresh operation and continuity. */
        const bindFirst = (
          key: string,
          record: AdmittedRecord,
          access: CallAccess<P>,
          call: CallDocument,
        ): Outcome<ModelDriveInput<P>, ModelFailure> => {
          if (call.execution !== null || call.request === null)
            return { failure: failure('successor-unavailable') }
          if (calls >= this.#limits.maxCallsPerBinding) return { failure: failure('call-capacity') }
          const minted = this.#mintIdentity(record, instance, call.owner.evidence)
          if ('failure' in minted) return minted
          const { operation, continuity } = minted.ok
          this.#records.set(key, {
            ...record,
            kind: 'bound',
            binding,
            instance,
            operation,
            continuity,
            evidenceAdoption: structuredClone(call.owner.evidence),
            execution: null,
          })
          calls += 1
          return {
            ok: { ...access, instance, operation, continuity: structuredClone(continuity) },
          }
        }
        /** The input of a recovery read: the bound one again, or a first binding of an admitted call. */
        const recover = (
          access: CallAccess<P>,
          call: CallDocument,
        ): Outcome<ModelDriveInput<P>, ModelFailure> => {
          if (!live) return { failure: denied() }
          const found = locate(access)
          if ('failure' in found) return found
          const { key, record } = found.ok
          if (!record || record.kind === 'admission-pending')
            return { failure: failure('initial-record-missing') }
          if (record.admission !== call.admission)
            return { failure: failure('successor-unavailable') }
          return record.kind === 'bound'
            ? rebound(record, access, call)
            : bindFirst(key, record, access, call)
        }
        this.#gates.add(gate)
        const channel: ModelInitialHostChannel<P> = {
          prepare: raw => {
            const access = { tenant: raw.tenant, call: raw.call, principal: raw.principal }
            if (!live) return Promise.resolve({ failure: denied() })
            const auth = core.authorize(access, 'recovery', undefined, access.call)
            if ('failure' in auth) return Promise.resolve(auth)
            return core.runRead(access, () =>
              recordMissing(core.read(access, 'recovery', call => recover(access, call))),
            )
          },
          qualifyExecution: gate.execution,
          commands: commands(gate),
          coordinator: coordinator?.(gate) ?? null,
          close: () => {
            if (!live) return
            live = false
            this.#bindings.delete(instance)
          },
        }
        return { ok: Object.freeze(channel) }
      },
      continuity: (input: Parameters<ModelCommandsEvidence['continuity']>[0]) => {
        const found = locate(input)
        if ('failure' in found) return found
        const record = found.ok.record
        if (
          record?.kind !== 'bound' ||
          this.#bindings.get(record.instance) !== record.binding ||
          input.successor !== record.instance ||
          digest(input.source) !== digest(record.continuity) ||
          input.execution !== null
        )
          return { failure: denied() }
        const tenant = tenantKey(input.tenant)
        if (typeof tenant !== 'string' || tenant !== record.tenant) return { failure: denied() }
        const call = core.storage.documents(tenant).calls.get(input.call)
        if (
          !call ||
          call.admission !== record.admission ||
          digest(call.owner.evidence) !== digest(record.evidenceAdoption) ||
          digest(call.state.consumer) !== digest(input.consumer) ||
          digest(input.request) !== call.requestDigest
        )
          return { failure: denied() }
        return { ok: structuredClone(record.continuity) }
      },
    })
  }
}
Object.freeze(InitialRun.prototype)
Object.freeze(InitialRun)

export function initialRunPort<P>(run: ModelInitialRun<P>): InitialRunPort<P> {
  return InitialRun.access(initialRunAccess, run)
}
export function createModelInitialRun<P>(
  options: Readonly<{
    limits: ModelInitialRunLimits
    checkOriginRead(target: InitialTarget): Outcome<void, ModelFailure>
  }>,
): ModelInitialRun<P> {
  return Object.freeze(new InitialRun<P>(initialRunAccess, options))
}
