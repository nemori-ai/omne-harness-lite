// What the Tool storage needs from the application: the SQL storage, the trusted tenant domain
// lookup and the combination the application registered for the tenant scope.
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'

export type SqlToolStorageOptions = Readonly<{
  storage: SqlStorage
  /**
   * The read-only lookup of the published tenant domain directory (sql-contract §2.4). A tenant
   * that it does not hold is not written; the storage never registers a tenant or a combination.
   */
  domains: TenantDomainLookup
  /** The combination version and manifest digest the application registered for the tenant scope. */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
}>

/** The owner named in every evidence and every content reference that the Tool storage mints. */
export const TOOL_STORAGE_OWNER = '@omne-harness/tool-storage-sql'
