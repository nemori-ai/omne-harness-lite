// A real SQLite provider over a temporary storage root, with a catalog made of this member's own
// materials. Every `openSqliteStorage` call is a separate deployment. The caller closes it.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SqlMaterialCatalog, SqlStorage, StorageControl } from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { IDENTITY_DOMAIN, identitySqlMaterials } from '@omne-harness/identity-sql'

/** The candidate initial values of sqlite-provider SPEC §12.1, with a short close deadline. */
export function sqliteConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 5000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 4194304,
    globalReadResultBytes: 33554432,
    readObservationMs: 5000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

/** A catalog that holds only this member's materials, as an application would aggregate them. */
export function identityCatalog(): SqlMaterialCatalog {
  const materials = identitySqlMaterials()
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
}

/** Where the SQLite provider keeps the system identity domain under a storage root (SPEC §5.1). */
export function identityDomainFile(storageRoot: string): string {
  return join(storageRoot, 'domains', `${Buffer.from(IDENTITY_DOMAIN).toString('hex')}.sqlite`)
}

export type OpenedStorage = Readonly<{
  storage: SqlStorage
  control: StorageControl
  storageRoot: string
  /** Closes the provider. With `remove`, also deletes the temporary root. */
  close(options?: Readonly<{ remove?: boolean }>): Promise<void>
}>

export async function temporaryRoot(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'identity-sql-')))
}

export async function openSqliteStorage(root?: string): Promise<OpenedStorage> {
  const base = root ?? (await temporaryRoot())
  const storageRoot = join(base, 'storage')
  const created = await createSqliteStorage({
    config: sqliteConfig(storageRoot),
    materials: identityCatalog(),
    closeLeases: { admit: () => ({}), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(`sqlite rejected: ${created.problems.join('; ')}`)
  return {
    storage: created.storage,
    control: created.control,
    storageRoot,
    async close(options = {}) {
      await created.control.close({ initiator: 'disposal' })
      if (options.remove === true) await rm(base, { recursive: true, force: true })
    },
  }
}
