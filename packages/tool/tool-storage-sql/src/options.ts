import type {
  SqlStorage,
  TenantDomainListing,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'

export type SqlToolStorageOptions = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
}>

export type SqlToolLedgerStoreOptions = SqlToolStorageOptions &
  Readonly<{
    tenants: () => Promise<TenantDomainListing>
  }>

export const TOOL_STORAGE_OWNER = '@omne-harness/tool-storage-sql'
