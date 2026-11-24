import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LoopExtensionDeclaration, Passage } from '@omne-harness/agent-contract'
import {
  capabilityId,
  createCategoryPoint,
  createHeldBook,
  heldLayerSource,
  type AssetLayerSource,
  type PackageReader,
} from '@omne-harness/assets'
import {
  assetsSqlMaterials,
  createAssetsLocal,
  createTenantPublisher,
  publishedAssetRef,
  tenantListing,
} from '@omne-harness/assets-local'
import { loopExtensionsPoint } from '@omne-harness/loop-extension-cordis-contract/cordis'
import {
  access,
  tenantCodec,
  tenantEquals,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import { implementationOf } from '@omne-harness/loop-extension'
import {
  LOOP_EXTENSION_CATEGORY,
  loopExtensionBodyContract,
  loopExtensionCategoryDisplay,
  type ExtensionSources,
  type RunSetting,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { settingsSqlMaterials } from '@omne-harness/settings-local'
import { SETTINGS_RECOVERY_PARTICIPANTS } from '@omne-harness/settings-local/preparation'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'

export function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('Invalid fixture tenant')
  return parsed.value
}

export const tenantA = tenantOf('1')
export const tenantB = tenantOf('2')
export const reader = (tenant: TenantId): Access<string> => access('reader', tenant)

const digestOf = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)] as const),
  )
  return {
    async manifest() {
      return succeed({
        entries: [...bytes].map(([path, value]) => ({
          path,
          bytes: value.length,
          digest: digestOf(value),
        })),
      })
    },
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? fail('entry-not-found' as const) : succeed(found)
    },
  }
}

export const probe = (
  name: string,
  extra: Partial<LoopExtensionDeclaration> = {},
): LoopExtensionDeclaration => ({
  name,
  position: 'execution_started',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: name },
  ...extra,
})

/** The passage the Agent recorded for one member: only its exact version matters to the provider. */
export function passageOf(member: { capability: string; assetRef: string; version: string }) {
  return { implementation: implementationOf(member) } as Passage
}

function storageConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 100,
    globalAdmissionLimit: 100,
    admissionWaitMs: 1000,
    lockWaitMs: 1000,
    maxCommandsPerCommit: 5,
    maxCommandBytes: 16 << 20,
    maxRequestBytes: 20 << 20,
    globalInFlightWriteBytes: 64 << 20,
    maxJsonDepth: 50,
    maxJsonMembers: 100000,
    maxResponseBytes: 1 << 20,
    maxOperationResponseBytes: 2 << 20,
    globalWriteResponseBytes: 64 << 20,
    maxDiagnosticBytes: 1024,
    maxWorkers: 4,
    reservedWriterSlots: 1,
    maxReadWorkersPerDomain: 1,
    readQueuePerDomain: 50,
    readQueueGlobal: 50,
    readQueueTimeoutMs: 10000,
    maxReadInputBytes: 1 << 20,
    maxReadResultBytes: 8 << 20,
    globalReadResultBytes: 32 << 20,
    readObservationMs: 10000,
    readerIdleMs: 60000,
    queryQueuePerDomain: 50,
    queryQueueGlobal: 50,
    controlQueuePerDomain: 50,
    controlQueueGlobal: 50,
    writesPerControlTurn: 1,
    groupMaxOperations: 1,
    groupCollectMs: 0,
    groupMaxInputBytes: 32 << 20,
    groupMaxResponseReservationBytes: 8 << 20,
    groupMaxExecutionSliceMs: 100,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 8 << 20,
    checkpointIntervalMs: 60000,
    checkpointWalBytes: 8 << 20,
    walReadPauseBytes: 64 << 20,
    walWriteStopBytes: 128 << 20,
    closeDeadlineMs: 10000,
  }
}

async function openStorage(root: string, tenantRef: string) {
  const assets = assetsSqlMaterials()
  const settings = settingsSqlMaterials()
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [...assets.participants, ...settings.participants],
    migrations: [...assets.migrations, ...settings.migrations],
    readHandlers: [...assets.readHandlers, ...settings.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const domain = {
    scope: { kind: 'tenant', tenant: tenantRef } as const,
    transactionDomain: 'loop-extension.test',
  }
  const participants = [
    ...assets.participants.map(participant => participant.participant),
    ...SETTINGS_RECOVERY_PARTICIPANTS,
  ]
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'loop-extension-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const created = await createSqliteStorage({
    config: storageConfig(join(root, 'storage')),
    materials,
    closeLeases: { admit: () => ({}), release: () => {} },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const registered = await created.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return { ...created, domain, combination }
}

/** One tenant on a real assets provider. The settings are a stand-in: a value of `run` for each extension, with its own revision and signal. */
export async function openTenant(tenant: TenantId) {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('Invalid fixture tenant')
  const tenantRef = encoded.value
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/loop-extension-host-local/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'case-'))
  const opened = await openStorage(root, tenantRef)
  const categories = createCategoryPoint()
  categories.contribute({
    contract: loopExtensionBodyContract(),
    display: loopExtensionCategoryDisplay,
    point: loopExtensionsPoint.name,
  })
  const listeners = new Set<() => void>()
  const book = createHeldBook(tenantRef)
  const assets = createAssetsLocal({
    storage: opened.storage,
    domain: opened.domain,
    combinationVersion: opened.combination.combinationVersion,
    manifestDigest: opened.combination.manifestDigest,
    categories,
    packageRoot: join(root, 'packages'),
    held: book,
    onCommitted: () => listeners.forEach(listener => listener()),
  })
  await assets.packages.recover()
  await assets.syncHeld()
  const publisher = createTenantPublisher(assets, tenantRef)
  const held = new Map<string, string>()
  const runs = new Map<string, RunSetting>()
  const reads = { list: 0, basis: 0 }
  const broken = { basis: false, body: null as (() => Promise<void>) | null }
  let settingsRevision = 0
  let operations = 0
  const listed = tenantListing(assets)
  const layer: AssetLayerSource = heldLayerSource({
    layer: 'tenant',
    tenant: tenantRef,
    read: book.read,
    list(request) {
      reads.list += 1
      return listed(request)
    },
  })
  const sources: TenantExtensionSources = {
    layers: [layer],
    async body({ asset, version }) {
      await broken.body?.()
      const read = await assets.readVersion({ assetRef: asset, version })
      return read.kind === 'version' ? read.version.body : undefined
    },
    async locate({ asset, version }) {
      const found = await assets.packages.locate({ assetRef: asset, version })
      return found.kind === 'local-directory' ? { kind: 'directory', path: found.path } : found
    },
    async run({ capability }) {
      return runs.get(capability.name) ?? { kind: 'absent' }
    },
    async basis() {
      reads.basis += 1
      const revision = await assets.domainRevision()
      return broken.basis || revision.kind !== 'domain'
        ? undefined
        : { assets: String(revision.revision), settings: String(settingsRevision) }
    },
    changes: {
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    },
  }
  const refOf = (name: string) => {
    const made = capabilityId(LOOP_EXTENSION_CATEGORY, name)
    if (!made.ok) throw new Error('not a capability identity')
    return { capability: made.id, ref: publishedAssetRef(made.id) }
  }
  const assetRef = (name: string) => refOf(name).ref
  const holdingRef = (name: string) => {
    const ref = held.get(name)
    if (ref === undefined) throw new Error(`${name} is not held`)
    return ref
  }
  /** Publishes a version and holds it in the same commit; a later version of a held asset is pinned in its place. */
  async function publish(
    declaration: LoopExtensionDeclaration,
    files: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const published = await publisher.publish({
      capability: refOf(declaration.name).capability,
      operationId: `publish-${(operations += 1)}`,
      content: {
        kind: 'directory',
        from: packageOf({ ...files, 'extension.json': JSON.stringify(declaration) }),
      },
    })
    if (published.kind !== 'published') throw new Error(JSON.stringify(published))
    held.set(declaration.name, published.holdingRef)
    return published.version
  }
  async function setEnabled(name: string, enabled: boolean): Promise<void> {
    const holding = await assets.readHolding({ holdingRef: holdingRef(name), scopeRef: tenantRef })
    if (holding.kind !== 'holding') throw new Error(JSON.stringify(holding))
    const changed = await assets.changeHolding({
      operationId: `enable-${(operations += 1)}`,
      holdingRef: holdingRef(name),
      scopeRef: tenantRef,
      expectedRevision: holding.holding.revision,
      change: { kind: 'setEnabled', enabled },
    })
    if (changed.kind !== 'committed') throw new Error(JSON.stringify(changed))
  }
  /** Writes the stand-in setting and gives the signal a settings writer gives after its commit. */
  function setRun(name: string, value: RunSetting): void {
    runs.set(name, value)
    settingsRevision += 1
    for (const listener of listeners) listener()
  }
  return {
    tenant,
    assets,
    sources,
    reads,
    broken,
    assetRef,
    publish,
    setEnabled,
    setRun,
    listening: () => listeners.size,
    async close() {
      await assets.close()
      const closed = await opened.control.close({ initiator: 'disposal' })
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
    },
  }
}

export type TenantWorld = Awaited<ReturnType<typeof openTenant>>

/** The port the assembly provides: the sources of the tenant of the access, and nothing of another tenant. */
export function sourcesOf(...worlds: readonly TenantWorld[]): ExtensionSources<string> & {
  asked: TenantId[]
} {
  const asked: TenantId[] = []
  return {
    asked,
    async of(input) {
      asked.push(input.tenant)
      return worlds.find(world => tenantEquals(world.tenant, input.tenant))?.sources
    },
  }
}
