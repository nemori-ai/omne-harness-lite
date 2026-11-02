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
import { modelCommands } from './commands.ts'
import type { ModelCommandCore } from './state.ts'
import type {
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
type InitialRecord = LocalAdmission &
  (Readonly<{ kind: 'admission-pending' }> | Readonly<{ kind: 'admitted' }> | BoundRecord)
const failure = (diagnostic: string) => unavailable('model-initial-execution', diagnostic)
const denied = (): ModelFailure => ({ kind: 'denied', action: 'execution-channel' })
const keyOf = (tenant: string, call: InitialTarget['call']) => JSON.stringify([tenant, call])
const initialRunAccess = Object.freeze({})

type InitialRunPort<P> = Readonly<{
  beginAdmission(input: LocalAdmission): Outcome<void, ModelFailure>
  finishConfirmation(pass: ModelConfirmationPass | null, completion: ModelRunCompletion): void
  failConfirmation(pass: ModelConfirmationPass | null): void
  boundAccess(bound: BoundCommandAccess<P> | undefined): BoundCommandAccess<P> | null
  createExecution(
    core: ModelCommandCore<P>,
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
      createExecution: (core, coordinator) => this.#createExecution(core, coordinator),
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
      const staged = pass.staged?.kind === 'write' ? pass.staged.write : undefined
      const call =
        staged?.call ?? (pass.staged?.kind === 'publish' ? pass.staged.call : pass.seen?.call)
      const operation = staged ? staged.operation : pass.scope.operation
      const binding = staged?.binding ?? pass.seen?.operation
      if (
        !call ||
        call.state.call !== record.call ||
        call.admission !== record.admission ||
        !binding ||
        ('status' in binding && binding.status !== 'committed')
      )
        return
      if (
        record.kind === 'admission-pending' &&
        operation === record.admission &&
        binding.call === record.call &&
        binding.method === 'admit' &&
        binding.fingerprint === record.admissionFingerprint
      )
        this.#records.set(key, { ...record, kind: 'admitted' })
      if (
        record.kind === 'bound' &&
        operation === record.operation &&
        binding.call === record.call &&
        binding.method === 'claim' &&
        binding.receipt.kind === 'claim' &&
        call.execution?.instance === record.instance &&
        call.execution.generation === binding.receipt.generation
      )
        this.#records.set(key, { ...record, execution: { ...call.execution } })
    } catch (error) {
      this.#disable(pass)
      throw error
    }
  }
  #disable(pass: ModelConfirmationPass | null): void {
    if (pass?.scope?.call === undefined) this.#closed = true
    else this.#unavailable.add(keyOf(pass.scope.tenant, pass.scope.call))
  }
  #boundAccess(bound: BoundCommandAccess<P> | undefined): BoundCommandAccess<P> | null {
    return bound !== undefined && this.#gates.has(bound) ? bound : null
  }
  #createExecution(
    core: ModelCommandCore<P>,
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
        this.#gates.add(gate)
        const channel: ModelInitialHostChannel<P> = {
          prepare: raw => {
            const access = { tenant: raw.tenant, call: raw.call, principal: raw.principal }
            if (!live) return Promise.resolve({ failure: denied() })
            const auth = core.authorize(access, 'recovery', undefined, access.call)
            if ('failure' in auth) return Promise.resolve(auth)
            return core.runRead(access, () => {
              const result = core.read(access, 'recovery', call => {
                if (!live) return { failure: denied() }
                const found = locate(access)
                if ('failure' in found) return found
                const { key, record } = found.ok
                if (!record || record.kind === 'admission-pending')
                  return { failure: failure('initial-record-missing') }
                if (record.admission !== call.admission)
                  return { failure: failure('successor-unavailable') }
                if (record.kind === 'bound') {
                  if (
                    record.binding !== binding ||
                    (record.execution !== null &&
                      digest(record.execution) !== digest(call.execution))
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
                if (call.execution !== null || call.request === null)
                  return { failure: failure('successor-unavailable') }
                if (calls >= this.#limits.maxCallsPerBinding)
                  return { failure: failure('call-capacity') }
                let operation: ModelOperationId
                let continuity: DurableEvidence
                try {
                  const decoded = decodeModelOperationId(`mop_${randomBytes(16).toString('hex')}`)
                  if ('failure' in decoded) return { failure: failure('identity-unavailable') }
                  operation = decoded.ok
                  if (
                    [...this.#records.values()].some(
                      r => r.kind === 'bound' && r.operation === operation,
                    )
                  )
                    return { failure: failure('identity-unavailable') }
                  continuity = {
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
                      evidenceAdoption: call.owner.evidence,
                    }),
                  }
                  if (
                    [...this.#records.values()].some(
                      r => r.kind === 'bound' && r.continuity.record === continuity.record,
                    )
                  )
                    return { failure: failure('identity-unavailable') }
                } catch {
                  return { failure: failure('identity-unavailable') }
                }
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
              })
              return 'failure' in result &&
                result.failure.kind === 'invalid' &&
                result.failure.field === 'call' &&
                result.failure.reason === 'not-found'
                ? { failure: failure('initial-record-missing') }
                : result
            })
          },
          qualifyExecution: gate.execution,
          commands: modelCommands(core, gate),
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
export function createModelInitialExecution<P>(
  input: Readonly<{
    run: ModelInitialRun<P>
    core: ModelCommandCore<P>
    coordinator?: (bound: BoundCommandAccess<P>) => SendCoordinator<P>
  }>,
): ModelInitialExecution<P> {
  if (input.core.options.initialRun !== input.run)
    throw new TypeError('initial execution must share the core initialRun')
  return initialRunPort(input.run).createExecution(input.core, input.coordinator)
}
