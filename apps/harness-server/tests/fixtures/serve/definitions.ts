// 夹具「定义包」：真实行与入口对象引用的服务定义与键常量（DP1-C4）。键的文本只写在这里一次。
// 夹具行 id 与键取自 AA 行表，这样 `real-manifests-sync` 能把夹具行与 `stubs.ts` 的同一行比较。
import { Service, type Context } from '@deepseek-ai/cordis'

/** 存储控制口的夹具形状（sql-contract §2.3 的最小投影）。 */
export type FixtureStorageControl = Readonly<{
  close(options: Readonly<{ initiator: 'assembly' }>): Promise<'closed'>
  assemblyReportSettled(): void
}>

export abstract class FixtureStorageService extends Service {
  static readonly provide = 'storage'
  constructor(ctx: Context) {
    super(ctx, FixtureStorageService.provide)
  }
}
export const storageKey = FixtureStorageService.provide

export abstract class FixtureStorageHostService extends Service {
  static readonly provide = 'storageHost'
  constructor(ctx: Context) {
    super(ctx, FixtureStorageHostService.provide)
  }
  abstract attachControl(control: FixtureStorageControl): void
}
export const storageHostKey = FixtureStorageHostService.provide

export abstract class FixtureIdentityService extends Service {
  static readonly provide = 'identityOperations'
  constructor(ctx: Context) {
    super(ctx, FixtureIdentityService.provide)
  }
}
export const identityKey = FixtureIdentityService.provide

export abstract class FixtureTenantStandingSourceService extends Service {
  static readonly provide = 'tenantStanding'
  constructor(ctx: Context) {
    super(ctx, FixtureTenantStandingSourceService.provide)
  }
}
export const tenantStandingSourceKey = FixtureTenantStandingSourceService.provide

export abstract class FixtureRuntimeContextService extends Service {
  static readonly provide = 'runtimeContext'
  constructor(ctx: Context) {
    super(ctx, FixtureRuntimeContextService.provide)
  }
}
export const runtimeContextKey = FixtureRuntimeContextService.provide

export abstract class FixtureRuntimeContextTrustService extends Service {
  static readonly provide = 'runtimeContextTrust'
  constructor(ctx: Context) {
    super(ctx, FixtureRuntimeContextTrustService.provide)
  }
}
export const runtimeContextTrustKey = FixtureRuntimeContextTrustService.provide
