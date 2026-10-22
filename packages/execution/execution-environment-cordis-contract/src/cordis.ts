// PACKAGE_TEMPLATE_DRAFT: The service keys, the abstract Services and the intercept configuration type are in place; enforcement of the caller class for the two recovery operations is not yet accepted.
// The Cordis service definitions of the execution environment: the environment Service and the
// recovery authority Service, their keys and the intercept configuration type. It has no events;
// placement changes reach readers as Runtime Context blocks.
import { type Context, Service } from '@deepseek-ai/cordis'
import type {
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

/** Caller class read through intercept configuration. Only `maintainer` is meant for the recovery operations. */
export type ExecutionEnvironmentIntercept = { caller: 'integrator' | 'maintainer' | 'provider' }

/** @owner packages/execution/execution-environment-cordis-contract */
export abstract class ExecutionEnvironmentService<P>
  extends Service<ExecutionEnvironmentIntercept>
  implements ExecutionEnvironment<P>, ProviderRegistrations
{
  static readonly provide = 'executionEnvironment'
  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentService.provide)
  }
  // Members are methods, not fields: a method reads `this.ctx` as the caller's context, so a
  // registration made through `ctx.executionEnvironment` lands on the caller's fiber (IC-13).
  abstract resolvePlacement(
    ...args: Operation<P, 'resolvePlacement'>['args']
  ): Operation<P, 'resolvePlacement'>['result']
  abstract acquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result']
  abstract inspectAcquisition(
    ...args: Operation<P, 'inspectAcquisition'>['args']
  ): Operation<P, 'inspectAcquisition'>['result']
  abstract describe(...args: Operation<P, 'describe'>['args']): Operation<P, 'describe'>['result']
  abstract recoverOwned(
    ...args: Operation<P, 'recoverOwned'>['args']
  ): Operation<P, 'recoverOwned'>['result']
  abstract releaseScope(
    ...args: Operation<P, 'releaseScope'>['args']
  ): Operation<P, 'releaseScope'>['result']
  abstract registerFacility<K extends FacilityKey>(
    descriptor: FacilityDescriptor<K>,
  ): ReturnType<ProviderRegistrations['registerFacility']>
  abstract registerProvider(
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

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still check
  // every input at run time.
  interface Context {
    executionEnvironment: ExecutionEnvironmentService<unknown>
    executionRecoveryAuthority: ExecutionRecoveryAuthorityService
  }
}
