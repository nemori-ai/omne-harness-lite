// The real SQL pair under the session provider: session-storage-sql's `createSessionStoragePair`
// over the real sqlite-provider, with real files in a temporary directory, a real write Worker per
// transaction domain and the real read Worker pool. Everything is built through public entries;
// there is no `node:sqlite` double here. Two tenants, each with its own transaction domain. The
// setup follows the fixture of the session member (tests/fixtures/sql.ts) and that of
// session-storage-sql (tests/real-provider.spec.ts).
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import {
  createSessionStoragePair,
  sessionStorageMaterials,
} from '@omne-harness/session-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type CloseLeasePort,
  type SqlMaterialCatalog,
  type TenantDomain,
  type TenantDomainAccess,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { fixtureInitializationGuard, type BackendFactory } from './backends.ts'
import { TENANT_A, TENANT_B } from './tenants.ts'

const COMBINATION = 'c1'

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

/** The provider configuration: the values of session-storage-sql's own real-provider fixture. */
function config(storageRoot: string): SqliteStorageConfig {
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
    groupCollectMs: 5,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 100000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 3_600_000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

function catalogOf(): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants: ['session'] },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: ['session'] })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

export const sqlBackend: BackendFactory = {
  name: 'real sqlite-provider pair',
  open: async accessCheck => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'session-service-')))
    const { catalog, digest } = catalogOf()
    const closeLeases: CloseLeasePort = {
      admit: name => ({ name }),
      release: () => undefined,
    }
    const created = await createSqliteStorage({
      config: config(join(root, 'storage')),
      materials: catalog,
      closeLeases,
    })
    if (created.kind !== 'created')
      throw new Error(`provider rejected: ${created.reason}: ${created.problems.join('; ')}`)
    const entries: TenantDomain[] = [TENANT_A, TENANT_B].map((tenant, index) => ({
      tenant: textOf(tenant),
      domain: {
        scope: { kind: 'tenant', tenant: textOf(tenant) },
        transactionDomain: `dom_${String(index)}`,
      },
    }))
    const domains: TenantDomainAccess = {
      resolve: input => {
        const entry = entries.find(item => item.tenant === input.tenant)
        return Promise.resolve(
          entry === undefined
            ? { kind: 'unavailable', diagnostic: 'no domain for the tenant' }
            : { kind: 'ready', entry },
        )
      },
      snapshot: () =>
        Promise.resolve({ kind: 'ready', value: { revision: '1', entries: [...entries] } }),
    }
    for (const entry of entries) {
      const registered = await created.storage.registerCombination({
        scope: entry.domain.scope,
        transactionDomain: entry.domain.transactionDomain,
        combinationVersion: COMBINATION,
        manifestDigest: digest,
        participants: ['session'],
      })
      if (registered.kind !== 'registered')
        throw new Error(`registration of ${entry.domain.transactionDomain} is ${registered.kind}`)
    }
    const { transactions, delegated } = createSessionStoragePair<string>({
      storage: created.storage,
      domains,
      accessCheck,
      cursorSigning: createFixedSessionCursorSigning(),
      combination: { combinationVersion: COMBINATION, manifestDigest: digest },
    })
    return {
      name: 'real sqlite-provider pair',
      transactions,
      delegated,
      initializationGuards: command => Promise.resolve([fixtureInitializationGuard(command)]),
      dispose: async () => {
        await created.control.close({ initiator: 'disposal' }).catch(() => undefined)
        await rm(root, { recursive: true, force: true })
      },
    }
  },
}
