import { join } from 'node:path'
import type { AssetLayerSource, OfficialAssets } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import {
  access as accessOf,
  tenantCodec,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillAccess, createSkillCatalog, orderDocuments } from '@omne-harness/skill'
import {
  skillBodyContract,
  type SkillAccess,
  type SkillCatalog,
} from '@omne-harness/skill-contract'
import {
  createContentStoreSource,
  createSkillDecisions,
  indexedInputs,
  skillInputsFromAssets,
  stackedInputs,
  type HeldNames,
  type PackageDirectoryOf,
  type PackageReaderOf,
} from '@omne-harness/skill-host-local'
import type { RankingParameters } from '@omne-harness/text-search'
import {
  inWorkspace,
  tenantLayers,
  turnKeyOf,
  turnLayers,
  workspaceLayer,
  type WorkspaceLayerPorts,
} from '../tenant-assets/layers.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import type { SessionSkillsService } from './session-skills.ts'

export type TenantSkills = Readonly<{
  catalog: SkillCatalog<unknown, unknown>
  access: SkillAccess<unknown, unknown>
  sessionCatalog: SkillCatalog<unknown, unknown>
  warm(): Promise<void>
}>

export type WorkspaceSkillPorts = WorkspaceLayerPorts

/** The skills the release brings: the official assets with their bodies, and the directory one version of them lies in. */
export type OfficialSkillPorts = Readonly<{
  assets: OfficialAssets
  directoryOf(ref: string, version: string): string | undefined
}>

export type TenantSkillsHostOptions = Readonly<{
  open(tenant: TenantId, tenantRef: string): Promise<TenantSkills | undefined>
}>

const SKILL = skillBodyContract().category
const SESSION_WORK = Object.freeze({ kind: 'session-work-of-the-tenant' } as const)
const GRANTED = Object.freeze({ kind: 'granted' } as const)
const REFUSED = Object.freeze({ kind: 'refused' } as const)

export function directoryOf(assets: Pick<AssetsLocal, 'packages'>): PackageDirectoryOf {
  return async ({ ref, digest }) => {
    const place = await assets.packages.locate({ assetRef: ref, version: digest })
    switch (place.kind) {
      case 'local-directory':
        return succeed(place.path)
      case 'absent':
        return succeed(null)
      case 'unavailable':
        return fail('unavailable')
    }
  }
}

export function tenantSkills(
  assets: AssetsLocal,
  tenant: TenantId,
  ranking: RankingParameters,
  workspace: WorkspaceSkillPorts,
  sources: readonly AssetLayerSource[],
  official: OfficialSkillPorts,
  held: (category: string) => HeldNames | undefined,
): TenantSkills {
  const contract = () => workspace.contractOf(SKILL)
  const tenantLayer = tenantLayers(assets, sources, contract, official.assets)
  const layers = (access: Access<unknown>, scope: unknown) =>
    turnLayers(tenantLayer, workspace, access, turnKeyOf(scope))
  const kept = indexedInputs<unknown, unknown>(skillInputsFromAssets(tenantLayer), () =>
    held(SKILL),
  )
  const inputs = (access: Access<unknown>, scope: unknown) => {
    const key = turnKeyOf(scope)
    return key === null
      ? kept
      : stackedInputs(kept, skillInputsFromAssets(workspaceLayer(workspace, access, key)))
  }
  const decisionsFor = (asWork: (principal: unknown) => boolean) =>
    createSkillDecisions<unknown, unknown>({
      layers: (access, scope, capability) =>
        inputs(access, scope).layers(access, scope, capability),
      identities: (access, scope) => inputs(access, scope).identities(access, scope),
      eligible: async who => (asWork(who.principal) ? 'yes' : 'no'),
      readable: async who => (asWork(who.principal) ? GRANTED : REFUSED),
    })
  const { resolution, readCheck } = decisionsFor(
    principal => sessionWorkOf(principal, tenant) !== undefined,
  )
  const directory = directoryOf(assets)
  const accessOver = (readerOf: PackageReaderOf) =>
    createSkillAccess({
      resolution,
      readCheck,
      source: createContentStoreSource({
        readerOf,
        async directoryOf(locator) {
          if (inWorkspace(locator.ref)) return succeed(null)
          const brought = official.directoryOf(locator.ref, locator.digest)
          if (brought !== undefined) return succeed(brought)
          const at = tenantLayer.withinOf(locator.ref, locator.digest)
          if (at === undefined) return directory(locator)
          const place = await assets.packages.locate({ assetRef: locator.ref, version: at.version })
          if (place.kind === 'unavailable') return fail('unavailable')
          return succeed(place.kind === 'local-directory' ? join(place.path, at.within) : null)
        },
      }),
    })
  const tenantAccess = accessOver(tenantLayer.readerOf)
  // A turn's reads go through its own layers; a call that names no turn shares the tenant's.
  const accessFor = (access: Access<unknown>, scope: unknown) =>
    turnKeyOf(scope) === null ? tenantAccess : accessOver(layers(access, scope).readerOf)
  const asSession = decisionsFor(() => true)
  return {
    catalog: createSkillCatalog({ resolution, readCheck }, { ranking }),
    sessionCatalog: createSkillCatalog(asSession, { ranking }),
    async warm() {
      await asSession.resolution.adopted(accessOf(SESSION_WORK, tenant), null)
    },
    access: {
      read: (access, scope, target, options) =>
        accessFor(access, scope).read(access, scope, target, options),
      list: (access, scope, capability, options) =>
        accessFor(access, scope).list(access, scope, capability, options),
    },
  }
}

/** One Skill service set per tenant, made on first use over the tenant's one local assets. */
export class TenantSkillsHost {
  private readonly options: TenantSkillsHostOptions
  private readonly opening = new Map<string, Promise<TenantSkills | undefined>>()
  private closed = false

  constructor(options: TenantSkillsHostOptions) {
    this.options = options
  }

  get(tenant: TenantId): Promise<TenantSkills | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) return Promise.resolve(undefined)
    const key = encoded.value
    const known = this.opening.get(key)
    if (known !== undefined) return known
    const made = this.open(key, tenant)
    this.opening.set(key, made)
    void made.then(set => {
      if (set === undefined) this.opening.delete(key)
    })
    return made
  }

  private async open(key: string, tenant: TenantId): Promise<TenantSkills | undefined> {
    try {
      const set = await this.options.open(tenant, key)
      if (this.closed) return undefined
      void set?.warm()
      return set
    } catch {
      return undefined
    }
  }

  /** Every open set reads ahead what changed: the registry changed. */
  async warm(): Promise<void> {
    await Promise.all([...this.opening.values()].map(async made => (await made)?.warm()))
  }

  close(): void {
    this.closed = true
    this.opening.clear()
  }
}

const CATALOG_UNKNOWN = Object.freeze(fail('unknown' as const))
const ACCESS_UNKNOWN = Object.freeze(fail({ kind: 'unknown' } as const))

/** What the work of a session of the tenant would see for these Skills now: asked at an adoption point. */
export function sessionSkillsOf(host: TenantSkillsHost): SessionSkillsService['summaries'] {
  return async (tenant, capabilities) => {
    const set = await host.get(tenant)
    return set === undefined
      ? CATALOG_UNKNOWN
      : set.sessionCatalog.summaries(accessOf(SESSION_WORK, tenant), null, capabilities)
  }
}

/** The two Skill services over all tenants: each call goes to the set of its own tenant. */
export function routedSkills(
  host: TenantSkillsHost,
  ranking: RankingParameters,
): Readonly<{
  catalog: SkillCatalog<unknown, unknown>
  access: SkillAccess<unknown, unknown>
}> {
  return {
    catalog: {
      async summaries(access, scope, capabilities) {
        const set = await host.get(access.tenant)
        return set === undefined
          ? CATALOG_UNKNOWN
          : set.catalog.summaries(access, scope, capabilities)
      },
      async search(access, scope, query) {
        const set = await host.get(access.tenant)
        return set === undefined ? CATALOG_UNKNOWN : set.catalog.search(access, scope, query)
      },
      order: (text, documents) => orderDocuments(text, documents, ranking),
    },
    access: {
      async read(access, scope, target, options) {
        const set = await host.get(access.tenant)
        return set === undefined ? ACCESS_UNKNOWN : set.access.read(access, scope, target, options)
      },
      async list(access, scope, capability, options) {
        const set = await host.get(access.tenant)
        return set === undefined
          ? ACCESS_UNKNOWN
          : set.access.list(access, scope, capability, options)
      },
    },
  }
}
