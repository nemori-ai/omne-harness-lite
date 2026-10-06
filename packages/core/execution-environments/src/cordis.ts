import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ExecutionEnvironmentOperations,
  EnvironmentProviderRegistrations,
  ResourceRecoveryAuthority,
  EnvironmentPlacementRegistrations,
} from './index.ts'

/** @owner packages/core/execution-environments */
export abstract class ExecutionEnvironmentsService
  extends Service
  implements
    ExecutionEnvironmentOperations,
    EnvironmentProviderRegistrations,
    EnvironmentPlacementRegistrations
{
  static readonly provide = 'executionEnvironments'
  constructor(ctx: Context) {
    super(ctx, ExecutionEnvironmentsService.provide)
  }
  abstract resolvePlacement(
    ...args: Parameters<ExecutionEnvironmentOperations['resolvePlacement']>
  ): ReturnType<ExecutionEnvironmentOperations['resolvePlacement']>
  abstract describe(
    ...args: Parameters<ExecutionEnvironmentOperations['describe']>
  ): ReturnType<ExecutionEnvironmentOperations['describe']>
  abstract acquire(
    ...args: Parameters<ExecutionEnvironmentOperations['acquire']>
  ): ReturnType<ExecutionEnvironmentOperations['acquire']>
  abstract registerProvider(
    ...args: Parameters<EnvironmentProviderRegistrations['registerProvider']>
  ): ReturnType<EnvironmentProviderRegistrations['registerProvider']>
  abstract registerPlacementSource(
    ...args: Parameters<EnvironmentPlacementRegistrations['registerPlacementSource']>
  ): ReturnType<EnvironmentPlacementRegistrations['registerPlacementSource']>
  abstract recover(
    ...args: Parameters<EnvironmentProviderRegistrations['recover']>
  ): ReturnType<EnvironmentProviderRegistrations['recover']>
}
export const EXECUTION_ENVIRONMENTS = ExecutionEnvironmentsService.provide

/** @owner packages/core/execution-environments */
export abstract class ResourceRecoveryAuthorityService
  extends Service
  implements ResourceRecoveryAuthority
{
  static readonly provide = 'resourceRecoveryAuthority'
  constructor(ctx: Context) {
    super(ctx, ResourceRecoveryAuthorityService.provide)
  }
  abstract authorizeRecovery(
    ...args: Parameters<ResourceRecoveryAuthority['authorizeRecovery']>
  ): ReturnType<ResourceRecoveryAuthority['authorizeRecovery']>
}
export const RESOURCE_RECOVERY_AUTHORITY = ResourceRecoveryAuthorityService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    executionEnvironments: ExecutionEnvironmentsService
    resourceRecoveryAuthority: ResourceRecoveryAuthorityService
  }
}
