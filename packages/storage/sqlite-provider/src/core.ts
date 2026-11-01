// The shared parts that every operation of one provider generation uses. The operations
// (register.ts, commit.ts, query.ts, read.ts) take a Core and return their function of the
// SqlStorage interface. Nothing here holds a Cordis object.
import type { SqlIdentity, SqlMaterialCatalog, StorageScope } from '@omne-harness/sql-contract'
import { Admission, PendingIndex } from './admission.ts'
import type { SqliteStorageConfig } from './config.ts'
import { Domains, type Lifecycle } from './domains.ts'
import { clipDiagnostic, scopeKey } from './fields.ts'
import { ReaderPool } from './reader-pool.ts'

export type Core = Readonly<{
  config: SqliteStorageConfig
  catalog: SqlMaterialCatalog
  lifecycle: Lifecycle
  domains: Domains
  readers: ReaderPool
  admission: Admission
  pending: PendingIndex
  /** A diagnostic of at most maxDiagnosticBytes. Callers branch on kind and reason only. */
  diagnostic(text: string): string
}>

export function createCore(
  config: SqliteStorageConfig,
  catalog: SqlMaterialCatalog,
  domains: (lifecycle: Lifecycle) => Domains,
): Core {
  const lifecycle: Lifecycle = { closing: false }
  const owned = domains(lifecycle)
  return {
    config,
    catalog,
    lifecycle,
    domains: owned,
    readers: new ReaderPool(config, owned, lifecycle),
    admission: new Admission(config),
    pending: new PendingIndex(),
    diagnostic: text => clipDiagnostic(text, config.maxDiagnosticBytes),
  }
}

export const sameScope = (a: StorageScope, b: StorageScope): boolean => scopeKey(a) === scopeKey(b)

/** The key of an identity in the pending index. The file of a domain fixes the protocol. */
export const identityKey = (identity: SqlIdentity): string =>
  JSON.stringify([
    scopeKey(identity.scope),
    identity.transactionDomain,
    identity.operation,
    identity.operationKey,
  ])
