import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  capabilityId,
  createCategoryPoint,
  type CapabilityId,
  type PackageReader,
} from '@omne-harness/assets'
import {
  assetsSqlMaterials,
  createAssetsLocal,
  tenantLayerSource,
  type AssetsLocal,
  type PackageLocation,
} from '@omne-harness/assets-local'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import { settingsSqlMaterials } from '@omne-harness/settings-local'
import { SETTINGS_RECOVERY_PARTICIPANTS } from '@omne-harness/settings-local/preparation'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { createSkillAccess } from '@omne-harness/skill'
import {
  isControlFile,
  MANIFEST_PATH,
  parseSkillPackage,
  skillBodyContract,
  skillCategoryDisplay,
  type Bytes,
  type ReadResult,
  type ResourceListing,
} from '@omne-harness/skill-contract'
import type {
  PackageLocator,
  Resolution,
  SkillPackageSource,
} from '@omne-harness/skill-contract/provider'
import {
  createContentStoreSource,
  createDirectorySource,
  createSkillDecisions,
  skillInputsFromAssets,
  type SkillCandidate,
  type SkillLayerInput,
  type VersionBody,
} from '@omne-harness/skill-host-local'

export type PublishJourneyOptions = Readonly<{
  packageDir: string
  officialDir: string
  officialImmutable: boolean
  stateDir: string
  reader: Readonly<{ access: Access<string>; tenant: TenantId }>
}>

export type PublishJourney = Readonly<{
  capability: CapabilityId
  version: string
  resolution: Resolution
  body: ReadResult
  listing: ResourceListing
  location: PackageLocation
}>

const SCOPE = 'tenant'
type Scope = typeof SCOPE

const OFFICIAL_SAMPLE = `---
name: sample-skill
description: The official copy of the sample Skill, a candidate of the official layer in the publish demo.
---

# Sample skill, official copy

This is the official copy. A tenant's own copy of the same name replaces it unless it declares that it cannot be replaced.
`

export async function writeOfficialSample(parent: string): Promise<string> {
  const dir = join(parent, 'official-sample-skill')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), OFFICIAL_SAMPLE)
  return dir
}

export function directoryReader(source: SkillPackageSource, root: string): PackageReader {
  const locator: PackageLocator = { kind: 'directory', root }
  return {
    async manifest() {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      return {
        ok: {
          entries: snapshot.ok.entries.map(entry => ({
            path: entry.path,
            bytes: entry.size,
            digest: entry.digest,
          })),
        },
      }
    },
    async open(path, expected) {
      const snapshot = await source.snapshot(locator)
      if (!('ok' in snapshot)) return { failure: 'unavailable' }
      const entry = snapshot.ok.entries.find(one => one.path === path && one.digest === expected)
      if (entry === undefined) return { failure: 'entry-not-found' }
      const bytes = await source.open(locator, snapshot.ok.digest, entry.path)
      return 'ok' in bytes ? bytes : { failure: 'unavailable' }
    },
  }
}

export async function openStorage(stateDir: string, tenantRef: string) {
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
    transactionDomain: 'skills.demo',
  }
  const participants = [
    ...assets.participants.map(participant => participant.participant),
    ...SETTINGS_RECOVERY_PARTICIPANTS,
  ]
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'skills-demo/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const created = await createSqliteStorage({
    config: storageConfig(join(stateDir, 'storage')),
    materials,
    closeLeases: { admit: () => ({}), release: () => {} },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const registered = await created.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return { storage: created.storage, control: created.control, domain, combination }
}

export function versionBodyOf(assets: AssetsLocal): VersionBody {
  return async candidate => {
    const read = await assets.readVersion({ assetRef: candidate.asset, version: candidate.version })
    return read.kind === 'version' ? read.version.body : undefined
  }
}

export async function runPublishJourney(options: PublishJourneyOptions): Promise<PublishJourney> {
  const tenantRef = 'demo-tenant'
  await mkdir(options.stateDir, { recursive: true })
  const opened = await openStorage(options.stateDir, tenantRef)
  const categories = createCategoryPoint()
  categories.contribute({ contract: skillBodyContract(), display: skillCategoryDisplay })
  const assets: AssetsLocal = createAssetsLocal({
    storage: opened.storage,
    domain: opened.domain,
    combinationVersion: opened.combination.combinationVersion,
    manifestDigest: opened.combination.manifestDigest,
    categories,
    packageRoot: join(options.stateDir, 'packages'),
  })
  try {
    await assets.packages.recover()
    const directories = createDirectorySource()
    const made = capabilityId('skill', 'sample-skill')
    if (!made.ok) throw new Error('not a capability identity')
    const capability = made.id
    const assetRef = 'tenant/skill/sample-skill'

    const published = await assets.packages.publish({
      capability,
      assetRef,
      from: directoryReader(directories, options.packageDir),
      operationId: 'publish-sample-skill',
    })
    if (published.kind !== 'published') throw new Error(JSON.stringify(published))
    const held = await assets.hold({
      operationId: 'hold-sample-skill',
      holdingRef: 'skill.sample-skill',
      scopeRef: tenantRef,
      assetRef,
      selection: { kind: 'follow' },
      sources: [
        { sourceId: 'tenant', ownerRef: tenantRef, scope: { kind: 'owner', subjectRef: 'skills' } },
      ],
      grants: [],
    })
    if (held.kind !== 'committed') throw new Error(JSON.stringify(held))

    async function official(): Promise<SkillLayerInput> {
      const root = options.officialDir
      const locator: PackageLocator = { kind: 'directory', root }
      const unavailable: SkillLayerInput = { layer: 'official', state: 'unavailable' }
      const taken = await directories.snapshot(locator)
      if (!('ok' in taken)) return unavailable
      const control: { manifest?: Bytes; declaration?: Bytes } = {}
      for (const entry of taken.ok.entries) {
        if (!isControlFile(entry.path)) continue
        const bytes = await directories.open(locator, taken.ok.digest, entry.path)
        if (!('ok' in bytes)) return unavailable
        control[entry.path === MANIFEST_PATH ? 'manifest' : 'declaration'] = bytes.ok
      }
      const inspected = parseSkillPackage({ snapshot: taken.ok, control })
      if (!('ok' in inspected)) return unavailable
      const { manifest, declaration, snapshot } = inspected.ok
      const candidate: SkillCandidate = {
        asset: 'official/skill/sample-skill',
        version: snapshot.digest,
        disabled: false,
        immutable: options.officialImmutable,
        replaceLocked: false,
        locator: { kind: 'directory', root },
        digest: snapshot.digest,
        declared: {
          name: manifest.name,
          description: manifest.description,
          tools: declaration.dependencies,
        },
      }
      return { layer: 'official', state: 'read', candidates: [candidate] }
    }
    const fromAssets = skillInputsFromAssets<string, Scope>({
      sources: [tenantLayerSource(assets)],
      body: versionBodyOf(assets),
    })
    const sameTenant = (who: Access<string>) =>
      JSON.stringify(who.tenant) === JSON.stringify(options.reader.tenant)
    const { resolution, readCheck } = createSkillDecisions<string, Scope>({
      layers: async (who, scope, wanted) => [
        await official(),
        ...(await fromAssets.layers(who, scope, wanted)),
      ],
      eligible: async who => (sameTenant(who) ? 'yes' : 'no'),
      identities: fromAssets.identities,
      readable: async who => (sameTenant(who) ? { kind: 'granted' } : { kind: 'refused' }),
    })

    const contentStore = createContentStoreSource({
      readerOf: ({ ref, digest }) => assets.packages.reader({ assetRef: ref, version: digest }),
    })
    const source: SkillPackageSource = {
      snapshot: locator =>
        locator.kind === 'directory'
          ? directories.snapshot(locator)
          : contentStore.snapshot(locator),
      open: (locator, digest, path) =>
        locator.kind === 'directory'
          ? directories.open(locator, digest, path)
          : contentStore.open(locator, digest, path),
    }
    const access = createSkillAccess<string, Scope>({ readCheck, resolution, source })
    const who = options.reader.access
    const answer = await resolution.resolve(who, SCOPE, capability)
    const body = await access.read(who, SCOPE, { capability, part: { kind: 'body' } })
    if (!('ok' in body)) throw new Error(JSON.stringify(body))
    const listing = await access.list(who, SCOPE, capability)
    if (!('ok' in listing)) throw new Error(JSON.stringify(listing))
    return {
      capability,
      version: published.version,
      resolution: answer,
      body: body.ok,
      listing: listing.ok,
      location: await assets.packages.locate({ assetRef, version: published.version }),
    }
  } finally {
    await assets.close()
    await opened.control.close({ initiator: 'disposal' })
  }
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
