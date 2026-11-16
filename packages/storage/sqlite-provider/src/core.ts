import type { SqlIdentity, SqlMaterialCatalog, StorageScope } from '@omne-harness/sql-contract'
import { Admission, PendingIndex } from './admission.ts'
import { InFlight } from './close.ts'
import type { SqliteStorageConfig } from './config.ts'
import { Domains, type Lifecycle } from './domains.ts'
import { clipDiagnostic, scopeKey } from './fields.ts'
import { ReaderPool } from './reader-pool.ts'
import { WriteBarrier } from './write-barrier.ts'

export type Core = Readonly<{
  config: SqliteStorageConfig
  catalog: SqlMaterialCatalog
  lifecycle: Lifecycle
  domains: Domains
  readers: ReaderPool
  barrier: WriteBarrier
  admission: Admission
  pending: PendingIndex
  inFlight: InFlight
  replyObservationMs: number
  diagnostic(text: string): string
}>

export function createCore(
  config: SqliteStorageConfig,
  catalog: SqlMaterialCatalog,
  domains: (lifecycle: Lifecycle) => Domains,
): Core {
  const lifecycle: Lifecycle = { closing: false }
  const owned = domains(lifecycle)
  const barrier = new WriteBarrier()
  return {
    config,
    catalog,
    lifecycle,
    domains: owned,
    readers: new ReaderPool(config, owned, lifecycle, barrier),
    barrier,
    admission: new Admission(config),
    pending: new PendingIndex(),
    inFlight: new InFlight(),
    replyObservationMs: 2 * config.lockWaitMs,
    diagnostic: text => clipDiagnostic(text, config.maxDiagnosticBytes),
  }
}

export const sameScope = (a: StorageScope, b: StorageScope): boolean => scopeKey(a) === scopeKey(b)

export const identityKey = (identity: SqlIdentity): string =>
  JSON.stringify([
    scopeKey(identity.scope),
    identity.transactionDomain,
    identity.operation,
    identity.operationKey,
    identity.recall ?? null,
  ])
