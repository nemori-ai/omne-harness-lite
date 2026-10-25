// The Cordis service definitions of the execution environment: the environment Service and the
// three port Services (recovery authority, environment authority, trusted scope binding), their keys
// and the intercept configuration type. It has no events; placement changes reach readers as Runtime
// Context blocks.
import { type Context, Service } from '@deepseek-ai/cordis'
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import type {
  EnvironmentAuthority,
  ExecutionEnvironment,
  FacilityDescriptor,
  FacilityKey,
  ProviderRegistrations,
  RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'

/** Parameters and result of one `ExecutionEnvironment` operation, so the signatures are written once. */
type Operation<P, O extends keyof ExecutionEnvironment<P>> = {
  args: Parameters<ExecutionEnvironment<P>[O]>
  result: ReturnType<ExecutionEnvironment<P>[O]>
}

/** Caller classes are assembly declarations, never an authorization credential. */
export type ExecutionEnvironmentIntercept = { caller: 'integrator' | 'maintainer' | 'provider' }
export type CallerClass = ExecutionEnvironmentIntercept['caller']
export type ServiceFace = 'environment' | 'recovery' | 'registration'
export type ServiceOperation = keyof ExecutionEnvironment<unknown> | keyof ProviderRegistrations
export const operationFaces: Readonly<Record<ServiceOperation, ServiceFace>> = Object.freeze({
  resolvePlacement: 'environment',
  acquire: 'environment',
  inspectAcquisition: 'environment',
  describe: 'environment',
  inspectRecoveryAcquisition: 'recovery',
  recoverOwned: 'recovery',
  releaseScope: 'recovery',
  registerFacility: 'registration',
  registerProvider: 'registration',
})
export const faceCallers: Readonly<Record<ServiceFace, CallerClass>> = Object.freeze({
  environment: 'integrator',
  recovery: 'maintainer',
  registration: 'provider',
})
/** Registration has no rejection result channel; a mismatched declaration throws this error. */
export class CallerClassMismatch extends Error {
  readonly operation: ServiceOperation
  readonly expected: CallerClass
  readonly declared: unknown
  constructor(operation: ServiceOperation, expected: CallerClass, declared: unknown) {
    super(`Caller declaration does not match ${operation}; expected ${expected}`)
    this.name = 'CallerClassMismatch'
    this.operation = operation
    this.expected = expected
    this.declared = declared
  }
}

/** @owner packages/execution/execution-environment-cordis-contract */
export abstract class ExecutionEnvironmentService<P>
  extends Service<ExecutionEnvironmentIntercept>
  implements ExecutionEnvironment<P>, ProviderRegistrations
{
  static readonly provide = 'executionEnvironment'
  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentService.provide)
  }
  private callerRefusal(operation: ServiceOperation): CallerClassMismatch | undefined {
    const config: unknown = this[Service.resolveConfig]()
    const present = typeof config === 'object' && config !== null && 'caller' in config
    const declared = present ? Reflect.get(config, 'caller') : undefined
    const face = operationFaces[operation]
    if (!present && face !== 'registration') return undefined
    const expected = faceCallers[face]
    return declared === expected
      ? undefined
      : new CallerClassMismatch(operation, expected, declared)
  }
  resolvePlacement(
    ...args: Operation<P, 'resolvePlacement'>['args']
  ): Operation<P, 'resolvePlacement'>['result'] {
    if (this.callerRefusal('resolvePlacement'))
      return Promise.resolve({ kind: 'rejected', reason: 'callerMismatch' })
    return this.onResolvePlacement(...args)
  }
  protected abstract onResolvePlacement(
    ...args: Operation<P, 'resolvePlacement'>['args']
  ): Operation<P, 'resolvePlacement'>['result']
  acquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'] {
    if (this.callerRefusal('acquire'))
      return Promise.resolve({ kind: 'rejected', reason: 'callerMismatch' })
    return this.onAcquire(...args)
  }
  protected abstract onAcquire(
    ...args: Operation<P, 'acquire'>['args']
  ): Operation<P, 'acquire'>['result']
  /** A caller mismatch is a query answer here, not a stored acquisition state. */
  inspectAcquisition(
    ...args: Operation<P, 'inspectAcquisition'>['args']
  ): Operation<P, 'inspectAcquisition'>['result'] {
    if (this.callerRefusal('inspectAcquisition'))
      return Promise.resolve({ kind: 'refused', reason: 'callerMismatch' })
    return this.onInspectAcquisition(...args)
  }
  protected abstract onInspectAcquisition(
    ...args: Operation<P, 'inspectAcquisition'>['args']
  ): Operation<P, 'inspectAcquisition'>['result']
  /** The maintainer's query by original description. A caller mismatch is a query answer. */
  inspectRecoveryAcquisition(
    ...args: Operation<P, 'inspectRecoveryAcquisition'>['args']
  ): Operation<P, 'inspectRecoveryAcquisition'>['result'] {
    if (this.callerRefusal('inspectRecoveryAcquisition'))
      return Promise.resolve({ kind: 'refused', reason: 'callerMismatch' })
    return this.onInspectRecoveryAcquisition(...args)
  }
  protected abstract onInspectRecoveryAcquisition(
    ...args: Operation<P, 'inspectRecoveryAcquisition'>['args']
  ): Operation<P, 'inspectRecoveryAcquisition'>['result']
  describe(...args: Operation<P, 'describe'>['args']): Operation<P, 'describe'>['result'] {
    if (this.callerRefusal('describe'))
      return Promise.resolve({ kind: 'rejected', reason: 'callerMismatch' })
    return this.onDescribe(...args)
  }
  protected abstract onDescribe(
    ...args: Operation<P, 'describe'>['args']
  ): Operation<P, 'describe'>['result']
  recoverOwned(
    ...args: Operation<P, 'recoverOwned'>['args']
  ): Operation<P, 'recoverOwned'>['result'] {
    if (this.callerRefusal('recoverOwned'))
      return Promise.resolve({ kind: 'rejected', reason: 'callerMismatch' })
    return this.onRecoverOwned(...args)
  }
  protected abstract onRecoverOwned(
    ...args: Operation<P, 'recoverOwned'>['args']
  ): Operation<P, 'recoverOwned'>['result']
  releaseScope(
    ...args: Operation<P, 'releaseScope'>['args']
  ): Operation<P, 'releaseScope'>['result'] {
    if (this.callerRefusal('releaseScope'))
      return Promise.resolve({ kind: 'rejected', reason: 'callerMismatch' })
    return this.onReleaseScope(...args)
  }
  protected abstract onReleaseScope(
    ...args: Operation<P, 'releaseScope'>['args']
  ): Operation<P, 'releaseScope'>['result']
  registerFacility<K extends FacilityKey>(
    descriptor: FacilityDescriptor<K>,
  ): ReturnType<ProviderRegistrations['registerFacility']> {
    const refusal = this.callerRefusal('registerFacility')
    if (refusal) throw refusal
    return this.onRegisterFacility(descriptor)
  }
  protected abstract onRegisterFacility<K extends FacilityKey>(
    descriptor: FacilityDescriptor<K>,
  ): ReturnType<ProviderRegistrations['registerFacility']>
  registerProvider(
    ...args: Parameters<ProviderRegistrations['registerProvider']>
  ): ReturnType<ProviderRegistrations['registerProvider']> {
    const refusal = this.callerRefusal('registerProvider')
    if (refusal) throw refusal
    return this.onRegisterProvider(...args)
  }
  protected abstract onRegisterProvider(
    ...args: Parameters<ProviderRegistrations['registerProvider']>
  ): ReturnType<ProviderRegistrations['registerProvider']>
}

export const executionEnvironmentKey = ExecutionEnvironmentService.provide

/**
 * The recovery authority of the execution environment as a service. The assembly entry provides it
 * by loading a subclass; the Service implementation reads it on each recovery operation and treats
 * its absence as `unavailable`. It is an optional dependency, so nobody writes it in `inject`.
 *
 * @owner packages/execution/execution-environment-cordis-contract
 */
export abstract class ExecutionRecoveryAuthorityService
  extends Service
  implements RecoveryAuthority
{
  static readonly provide = 'executionRecoveryAuthority'
  constructor(ctx: Context) {
    super(ctx, ExecutionRecoveryAuthorityService.provide)
  }
  abstract authorizeRecovery(
    ...args: Parameters<RecoveryAuthority['authorizeRecovery']>
  ): ReturnType<RecoveryAuthority['authorizeRecovery']>
}

export const executionRecoveryAuthorityKey = ExecutionRecoveryAuthorityService.provide

/**
 * The environment authority port as a service. The assembly entry provides it by loading a
 * subclass; the Service implementation reads it from its own load context on each ordinary
 * operation and treats its absence as `unavailable`. It is an optional dependency.
 *
 * @owner packages/execution/execution-environment-cordis-contract
 */
export abstract class ExecutionEnvironmentAuthorityService<P = unknown>
  extends Service
  implements EnvironmentAuthority<P>
{
  static readonly provide = 'executionEnvironmentAuthority'
  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentAuthorityService.provide)
  }
  abstract authorize(
    ...args: Parameters<EnvironmentAuthority<P>['authorize']>
  ): ReturnType<EnvironmentAuthority<P>['authorize']>
}

export const executionEnvironmentAuthorityKey = ExecutionEnvironmentAuthorityService.provide

/**
 * The trusted scope binding source as a service, with the same rules as the environment authority.
 * The binding type belongs to the Runtime Context contract.
 *
 * @owner packages/execution/execution-environment-cordis-contract
 */
export abstract class ExecutionScopeBindingService extends Service implements ScopeBindingSource {
  static readonly provide = 'executionScopeBinding'
  constructor(ctx: Context) {
    super(ctx, ExecutionScopeBindingService.provide)
  }
  abstract lookup(
    ...args: Parameters<ScopeBindingSource['lookup']>
  ): ReturnType<ScopeBindingSource['lookup']>
}

export const executionScopeBindingKey = ExecutionScopeBindingService.provide

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still check
  // every input at run time.
  interface Context {
    executionEnvironment: ExecutionEnvironmentService<unknown>
    executionRecoveryAuthority: ExecutionRecoveryAuthorityService
    executionEnvironmentAuthority: ExecutionEnvironmentAuthorityService<unknown>
    executionScopeBinding: ExecutionScopeBindingService
  }
}
