import type { BodyContract, Candidate } from '@omne-harness/assets'
import { tenantLayerSource, type AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import {
  createContentStoreSource,
  createSkillDecisions,
  skillInputsFromAssets,
  type PackageDirectoryOf,
  type PackageReaderOf,
  type VersionBody,
} from '@omne-harness/skill-host-local'
import {
  workspaceBody,
  workspaceLayerSource,
  workspaceReader,
  type WorkspaceLayerInput,
} from '@omne-harness/workspace-asset-source'
import type { WorkspaceSources } from '@omne-harness/workspace-contract'
import type { RankingParameters } from '@omne-harness/text-search'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

export type TenantSkills = Readonly<{
  catalog: SkillCatalog<unknown, unknown>
  access: SkillAccess<unknown, unknown>
}>

/** Where a turn's workspace layer comes from, looked up at each call. */
export type WorkspaceSkillPorts = Readonly<{
  sources(): WorkspaceSources<unknown> | undefined
  contractOf(category: string): BodyContract | undefined
}>

export type TenantSkillsHostOptions = Readonly<{
  open(tenant: TenantId, tenantRef: string): Promise<TenantSkills | undefined>
}>

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

const ABSENT = Object.freeze({
  kind: 'unavailable',
  diagnostic: 'workspace sources absent',
} as const)
const ABSENT_SOURCES: Pick<WorkspaceSources<unknown>, 'adopted' | 'open'> = {
  adopted: async () => ABSENT,
  open: async () => ABSENT,
}

/** The key of the turn a call is made in; the workspace layer reads what that turn adopted. */
function keyOf(scope: unknown): string | null {
  const key = (scope as { key?: unknown } | null)?.key
  return typeof key === 'string' ? key : null
}

const inWorkspace = (ref: string) => ref.startsWith('workspace/')

type Layers = Readonly<{
  sources: Parameters<typeof skillInputsFromAssets>[0]['sources']
  body: VersionBody
  readerOf: PackageReaderOf
}>

function tenantLayers(assets: AssetsLocal): Layers {
  return {
    sources: [tenantLayerSource(assets)],
    async body(candidate) {
      const read = await assets.readVersion({
        assetRef: candidate.asset,
        version: candidate.version,
      })
      return read.kind === 'version' ? read.version.body : undefined
    },
    readerOf: ({ ref, digest }) => assets.packages.reader({ assetRef: ref, version: digest }),
  }
}

/** A turn's layers: the tenant's, and the workspace's as the turn adopted it. */
function turnLayers(tenant: Layers, input: WorkspaceLayerInput<unknown>): Layers {
  const body = workspaceBody(input)
  const reader = workspaceReader(input)
  return {
    sources: [...tenant.sources, workspaceLayerSource(input)],
    body: (candidate: Candidate) =>
      inWorkspace(candidate.asset) ? body(candidate) : tenant.body(candidate),
    readerOf: locator =>
      inWorkspace(locator.ref)
        ? reader({ assetRef: locator.ref, version: locator.digest })
        : tenant.readerOf(locator),
  }
}

export function tenantSkills(
  assets: AssetsLocal,
  tenant: TenantId,
  ranking: RankingParameters,
  workspace: WorkspaceSkillPorts,
): TenantSkills {
  const tenantLayer = tenantLayers(assets)
  const layers = (access: Access<unknown>, scope: unknown): Layers => {
    const key = keyOf(scope)
    if (key === null) return tenantLayer
    const sources = workspace.sources() ?? ABSENT_SOURCES
    return turnLayers(tenantLayer, { sources, access, key, contractOf: workspace.contractOf })
  }
  const inputs = (access: Access<unknown>, scope: unknown) => {
    const { sources, body } = layers(access, scope)
    return skillInputsFromAssets<unknown, unknown>({ sources, body })
  }
  const ownWork = (principal: unknown) => sessionWorkOf(principal, tenant) !== undefined
  const { resolution, readCheck } = createSkillDecisions<unknown, unknown>({
    layers: (access, scope, capability) => inputs(access, scope).layers(access, scope, capability),
    identities: (access, scope) => inputs(access, scope).identities(access, scope),
    eligible: async who => (ownWork(who.principal) ? 'yes' : 'no'),
    readable: async who => (ownWork(who.principal) ? GRANTED : REFUSED),
  })
  const directory = directoryOf(assets)
  const accessOver = (readerOf: PackageReaderOf) =>
    createSkillAccess({
      resolution,
      readCheck,
      source: createContentStoreSource({
        readerOf,
        directoryOf: locator =>
          inWorkspace(locator.ref) ? Promise.resolve(succeed(null)) : directory(locator),
      }),
    })
  const tenantAccess = accessOver(tenantLayer.readerOf)
  // A turn's reads go through its own layers; a call that names no turn shares the tenant's.
  const accessFor = (access: Access<unknown>, scope: unknown) =>
    keyOf(scope) === null ? tenantAccess : accessOver(layers(access, scope).readerOf)
  return {
    catalog: createSkillCatalog({ resolution, readCheck }, { ranking }),
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
      return this.closed ? undefined : set
    } catch {
      return undefined
    }
  }

  close(): void {
    this.closed = true
    this.opening.clear()
  }
}

const CATALOG_UNKNOWN = Object.freeze(fail('unknown' as const))
const ACCESS_UNKNOWN = Object.freeze(fail({ kind: 'unknown' } as const))

/** The two Skill services over all tenants: each call goes to the set of its own tenant. */
export function routedSkills(host: TenantSkillsHost): Readonly<{
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
