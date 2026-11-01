// The Cordis service definitions of the SQL storage contract (docs/cordis.md): the `storage` seam
// that providers extend, the `storageHost` service that only the assembly entry provides, and the
// `tenantDomains` enumeration and the trusted `tenantDomainLookup`. The root entry imports no
// Cordis; this entry imports no provider.
import { Service, type Context } from '@deepseek-ai/cordis'
import type { SqlStorage, StorageHost, TenantDomainLookup, TenantDomains } from './types.ts'

/**
 * The storage capability seam. Key `storage` (IC-7). Providers extend this class and do not
 * provide the key again (IC-2). The operations carry no principal: injecting `storage` is an
 * assembly scope, not access control (IC-18).
 * @owner packages/storage/sql-contract
 */
export abstract class StorageService extends Service implements SqlStorage {
  static readonly provide = 'storage'

  constructor(ctx: Context) {
    super(ctx, StorageService.provide)
  }

  abstract readonly registerCombination: SqlStorage['registerCombination']
  abstract readonly commit: SqlStorage['commit']
  abstract readonly query: SqlStorage['query']
  abstract readonly read: SqlStorage['read']
}
export const storageKey = StorageService.provide

/**
 * Runtime objects for the storage provider. Only the assembly entry provides it. Every property
 * is reachable by any plugin that injects `storageHost`, so the assembly gives the key only to the
 * `storage` row. This is assembly scope, not access control.
 * @owner packages/storage/sql-contract
 */
export abstract class StorageHostService extends Service implements StorageHost {
  static readonly provide = 'storageHost'

  constructor(ctx: Context) {
    super(ctx, StorageHostService.provide)
  }

  abstract readonly materials: StorageHost['materials']
  abstract readonly closeLeases: StorageHost['closeLeases']
  abstract readonly attachControl: StorageHost['attachControl']
}
export const storageHostKey = StorageHostService.provide

/**
 * Public deployment enumeration. The definition lives here until Context r3 may move it.
 * @owner packages/storage/sql-contract
 */
export abstract class TenantDomainsService<P> extends Service implements TenantDomains<P> {
  static readonly provide = 'tenantDomains'

  constructor(ctx: Context) {
    super(ctx, TenantDomainsService.provide)
  }

  abstract readonly enumerate: TenantDomains<P>['enumerate']
}
export const tenantDomainsKey = TenantDomainsService.provide

/**
 * Read-only lookup of a registered tenant's transaction domain in the published directory
 * snapshot. The session storage composite provides it in the trusted storage subtree; rows that
 * write joint commits (`agent-journal`) inject it. This is assembly scope, not access control.
 * @owner packages/storage/sql-contract
 */
export abstract class TenantDomainLookupService extends Service implements TenantDomainLookup {
  static readonly provide = 'tenantDomainLookup'

  constructor(ctx: Context) {
    super(ctx, TenantDomainLookupService.provide)
  }

  abstract readonly lookup: TenantDomainLookup['lookup']
}
export const tenantDomainLookupKey = TenantDomainLookupService.provide

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type.
  interface Context {
    storage: StorageService
    storageHost: StorageHostService
    tenantDomains: TenantDomainsService<unknown>
    tenantDomainLookup: TenantDomainLookupService
  }
}
