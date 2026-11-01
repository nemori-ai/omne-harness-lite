// A composition of the Session storage over the real sqlite-provider: real files in a temporary
// directory, a real write Worker per transaction domain and the real read Worker pool. It builds
// the storage only through the public entry of `@omne-harness/sqlite-provider`; there is no
// `node:sqlite` double in this file. It does not import vitest, so a child process can run it.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SessionAccess, SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  ordinaryInput,
  sessionId,
  testingTenant,
} from '@omne-harness/session-contract/testing'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import {
  combinationManifest,
  manifestDigest,
  type CloseLeasePort,
  type QueryResultV2,
  type SqlIdentity,
  type SqlMaterialCatalog,
  type SqlStorage,
  type StorageCloseResult,
  type StorageControl,
  type TenantDomain,
  type TenantDomainAccess,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { createSessionStorage, sessionStorageMaterials } from '../../src/index.ts'

export const TENANT_A = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance000000000000000',
)
export const TENANT_B = testingTenant(
  'org_c0nf0rmance0ther0000000000',
  'acc_c0nf0rmance0ther0000000000',
)

export const textOf = (tenant: TenantId): string => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('not a minted tenant')
  return encoded.value
}

export const COMBINATION = 'c1'

/** The provider configuration of this fixture. Tests override single fields. */
export function realConfig(storageRoot: string): SqliteStorageConfig {
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
    // The physical-transaction count reads the WAL, so a checkpoint must not restart it mid-test.
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

/** The kinds of a storage `query` answer. This branch is the one place that reads the answer. */
export type QueryKind = 'committed' | 'rolled_back' | 'not_committed' | 'unknown'
export function queryKindOf(result: QueryResultV2): QueryKind {
  switch (result.kind) {
    case 'committed':
      return 'committed'
    case 'rolled_back':
      return 'rolled_back'
    case 'not_committed':
      return 'not_committed'
    case 'unknown':
      return 'unknown'
  }
}

/** The storage identity that the commit path gives generation `attempt` of one operation. */
export const identityOf = (
  tenant: TenantId,
  domain: string,
  operation: string,
  attempt = 1,
): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(tenant) },
  transactionDomain: domain,
  operation,
  protocolVersion: '2',
  operationKey: `${operation}#${String(attempt)}`,
})

export type WalSample = Readonly<{ commits: number; generation: string }>

/**
 * Commit frames in the live WAL file of a domain: each physical write transaction ends with one.
 * `generation` is the WAL salt pair; a changed salt means the WAL restarted and two samples are
 * not comparable. This reads the file as bytes; it asks nothing of the provider.
 */
export function walSample(file: string): WalSample {
  let bytes: Buffer
  try {
    bytes = readFileSync(`${file}-wal`)
  } catch {
    return { commits: 0, generation: 'none' }
  }
  if (bytes.length < 32) return { commits: 0, generation: 'none' }
  const pageSize = bytes.readUInt32BE(8)
  const salt1 = bytes.readUInt32BE(16)
  const salt2 = bytes.readUInt32BE(20)
  let commits = 0
  for (let at = 32; at + 24 + pageSize <= bytes.length; at += 24 + pageSize) {
    if (bytes.readUInt32BE(at + 8) !== salt1 || bytes.readUInt32BE(at + 12) !== salt2) break
    if (bytes.readUInt32BE(at + 4) !== 0) commits += 1
  }
  return { commits, generation: `${String(salt1)}:${String(salt2)}` }
}

export type RealAppOptions = Readonly<{
  /** An existing root to reopen. Without it a new temporary root is made and removed on dispose. */
  root?: string
  config?: Partial<SqliteStorageConfig>
  tenants?: readonly TenantId[]
}>

export async function openRealApp(options: RealAppOptions = {}) {
  const owned = options.root === undefined
  const root = options.root ?? (await realpath(await mkdtemp(join(tmpdir(), 'session-real-'))))
  const storageRoot = join(root, 'storage')
  const { catalog, digest } = catalogOf()
  const events: string[] = []
  const closeLeases: CloseLeasePort = {
    admit(name) {
      events.push(`admit:${name}`)
      return { name }
    },
    release(handle) {
      events.push(`release:${(handle as { name: string }).name}`)
    },
  }
  const created = await createSqliteStorage({
    config: { ...realConfig(storageRoot), ...options.config },
    materials: catalog,
    closeLeases,
  })
  if (created.kind !== 'created')
    throw new Error(`provider rejected: ${created.reason}: ${created.problems.join('; ')}`)
  const real: SqlStorage = created.storage
  const control: StorageControl = created.control

  let ops = 0
  /** The real storage with a count of `commit` calls (original operations that reach the provider). */
  const storage: SqlStorage = {
    registerCombination: input => real.registerCombination(input),
    commit: request => {
      ops += 1
      return real.commit(request)
    },
    query: identity => real.query(identity),
    read: (input, readOptions) => real.read(input, readOptions),
  }

  const known = options.tenants ?? [TENANT_A, TENANT_B]
  const entries: TenantDomain[] = known.map((tenant, index) => ({
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
    const registered = await real.registerCombination({
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: COMBINATION,
      manifestDigest: digest,
      participants: ['session'],
    })
    if (registered.kind !== 'registered')
      throw new Error(
        `registration of ${entry.domain.transactionDomain} is ${registered.kind}: ${JSON.stringify(registered)}`,
      )
  }

  const accessCheck = createPolicySessionAccessCheck<string>(request => ({
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }))
  const port = createSessionStorage<string>({
    storage,
    domains,
    accessCheck,
    cursorSigning: createFixedSessionCursorSigning(),
    combination: { combinationVersion: COMBINATION, manifestDigest: digest },
  })
  const access = (tenant: TenantId, session = 'session-1'): SessionAccess<string> => ({
    principal: 'tester',
    tenant,
    session: sessionId(session),
  })
  const create = (tenant: TenantId, session = 'session-1') => {
    const command: SessionCommand = {
      kind: 'create',
      input: {
        tenant,
        session: sessionId(session),
        operation: operationId(`create-${session}`),
        creation: creation(),
      },
    }
    const guards = [
      initializationFixtureGuard(
        initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
      ),
    ]
    return port.commit({ access: access(tenant, session), command, guards })
  }
  const accept = (tenant: TenantId, session: string, name: string, text = name) =>
    port.commit({
      access: access(tenant, session),
      command: {
        kind: 'accept',
        input: {
          tenant,
          session: sessionId(session),
          operation: operationId(`accept-${name}`),
          value: ordinaryInput(text),
        },
      },
      guards: [guard('login', 'login-entry', 'present')],
    })

  let closed: StorageCloseResult | null = null
  const close = async (): Promise<StorageCloseResult> => {
    closed ??= await control.close({ initiator: 'disposal' })
    return closed
  }
  /** Closes the provider, then removes the root when this app made it. */
  const dispose = async (): Promise<void> => {
    await close().catch(() => undefined)
    if (owned) await rm(root, { recursive: true, force: true })
  }

  return {
    root,
    storageRoot,
    port,
    storage,
    control,
    events,
    access,
    create,
    accept,
    close,
    dispose,
    /** The SQLite file of a transaction domain. */
    domainFile: (domain: string): string =>
      join(storageRoot, 'domains', `${Buffer.from(domain).toString('hex')}.sqlite`),
    /** `commit` calls that reached the real storage. */
    opCount: () => ops,
    domainOf: (tenant: TenantId): string => {
      const entry = entries.find(item => item.tenant === textOf(tenant))
      if (entry === undefined) throw new Error('unknown tenant')
      return entry.domain.transactionDomain
    },
  }
}

export type RealApp = Awaited<ReturnType<typeof openRealApp>>
