import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import {
  combinationManifest,
  manifestDigest,
  type DomainRef,
  type SqlMaterialCatalog,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import {
  createSqlToolLedgerStore,
  createSqlToolMaterialStore,
  createSqlToolOutputCustody,
  createSqlToolGuardedHostCommit,
  toolStorageMaterials,
  TOOL_PARTICIPANT,
} from '@omne-harness/tool-storage-sql'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'

// The budget scenario produces a 2,723,278-byte plan command, including retained request copies.
const DEFAULT_MAX_COMMAND_BYTES = 4_194_304

/**
 * Test fixture SQL capacity per R2-D115: aligned with production candidate (sqlite-provider
 * SPEC:326). The read handler maxOutputBytes is 4 MiB (worker/schema.ts:37), and each read
 * reserves that full amount. globalReadResultBytes = 134217728 allows 32 concurrent 4 MiB reads.
 * The old 16 MiB (readBytes × 4) only allowed 4, causing queue_full on the 5th read.
 *
 * One test lowers it (see `openStorage`'s `globalReadResultBytes` option) so the budget is
 * exhausted by a deterministic number of reads instead of a race with 32 concurrent calls.
 */
const DEFAULT_GLOBAL_READ_RESULT_BYTES = 134217728

/** Same provider policy dimensions as sqlite-provider/tests/support.ts, over this test's real root. */
function configuration(
  storageRoot: string,
  readBytes: number,
  globalReadResultBytes = DEFAULT_GLOBAL_READ_RESULT_BYTES,
  maxCommandBytes = DEFAULT_MAX_COMMAND_BYTES,
): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes,
    maxRequestBytes: 4_194_304,
    globalInFlightWriteBytes: 67_108_864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1_048_576,
    globalWriteResponseBytes: 33_554_432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 10_000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: readBytes,
    globalReadResultBytes,
    readObservationMs: 10_000,
    readerIdleMs: 30_000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4_194_304,
    groupMaxResponseReservationBytes: 8_388_608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67_108_864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16_777_216,
    walReadPauseBytes: 67_108_864,
    walWriteStopBytes: 134_217_728,
    closeDeadlineMs: 20_000,
  }
}
export async function openStorage(
  root: string,
  tenants: readonly TenantId[],
  options: Readonly<{ globalReadResultBytes?: number; maxCommandBytes?: number }> = {},
) {
  const maxCommandBytes = options.maxCommandBytes ?? DEFAULT_MAX_COMMAND_BYTES
  await mkdir(root, { recursive: true })
  const materials = toolStorageMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...materials,
    declaredCombinations: {
      tenant: { combinationVersion: 'windows-tool-e2-v1', participants: [TOOL_PARTICIPANT] },
      system: null,
    },
  }
  const built = combinationManifest({ catalog, participants: [TOOL_PARTICIPANT] })
  if (built.kind !== 'manifest') throw new Error(`Tool SQL combination unavailable: ${built.kind}`)
  const combination = {
    combinationVersion: 'windows-tool-e2-v1',
    manifestDigest: manifestDigest(built.manifest),
  }
  const leases = new Set<object>()
  let accepting = true
  const created = await createSqliteStorage({
    config: configuration(
      root,
      Math.max(4_194_304, ...materials.readHandlers.map(item => item.maxOutputBytes)),
      options.globalReadResultBytes ?? DEFAULT_GLOBAL_READ_RESULT_BYTES,
      maxCommandBytes,
    ),
    materials: catalog,
    closeLeases: {
      admit() {
        if (!accepting) throw new Error('The test storage assembly is closing')
        const lease = {}
        leases.add(lease)
        return lease
      },
      release(lease) {
        assert.ok(leases.delete(lease), 'SQL must release its original close lease exactly once')
      },
    },
  })
  if (created.kind !== 'created')
    throw new Error(`Real SQLite rejected: ${JSON.stringify(created)}`)
  const close = async () => {
    accepting = false
    const result = await created.control.close({ initiator: 'assembly' })
    created.control.assemblyReportSettled()
    assert.equal(result.kind, 'closed', JSON.stringify(result))
    assert.equal(leases.size, 0)
    return result
  }
  try {
    const entries = new Map<string, DomainRef>()
    for (const [index, tenant] of tenants.entries()) {
      const encoded = tenantCodec.encode(tenant)
      if (!encoded.ok) throw new Error('Unminted test tenant')
      const domain: DomainRef = {
        scope: { kind: 'tenant', tenant: encoded.value },
        transactionDomain: `windows-tool-${index}`,
      }
      const registered = await created.storage.registerCombination({
        ...domain,
        ...combination,
        participants: [TOOL_PARTICIPANT],
      })
      assert.equal(registered.kind, 'registered', JSON.stringify(registered))
      entries.set(encoded.value, domain)
    }
    const domains: TenantDomainLookup = {
      lookup: async ({ tenant }) => {
        const domain = entries.get(tenant)
        return domain ? { kind: 'ready', domain } : { kind: 'unregistered' }
      },
    }
    const options = { storage: created.storage, domains, combination }
    const materialProvider = {
      owner: 'windows-composition',
      name: 'materials',
      revision: '1',
      digest: 'sha256:materials',
    }
    return {
      /** The raw storage, for the read-budget case that must not depend on the whole assembly. */
      storage: created.storage,
      combination,
      domains,
      store: createSqlToolLedgerStore<ToolMessageContentBlock>(options),
      custody: createSqlToolOutputCustody<unknown>({
        ...options,
        maxCommandBytes,
        maxChunkBytes: 16384,
      }),
      materialProvider,
      materialStore: createSqlToolMaterialStore({
        ...options,
        provider: materialProvider,
        maxCommandBytes,
        maxChunkBytes: 16384,
      }),
      guarded: createSqlToolGuardedHostCommit(options),
      materials: catalog,
      close,
    }
  } catch (error) {
    try {
      await close()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'SQLite setup and cleanup failed')
    }
    throw error
  }
}
