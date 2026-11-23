import { readdir, realpath, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  digestBytes,
  type AssetStanding,
  type CapabilityId,
  type ChangeImpact,
  type PackageReader,
  type Placement,
  type PublishContent,
} from '@omne-harness/assets'
import {
  assetCategoriesKey,
  assetManagementKey,
  assetPublishingKey,
} from '@omne-harness/assets-cordis-contract'
import {
  attachExtensionsSource,
  type ExtensionsCallSource,
  type ExtensionsFaces,
} from '@omne-harness/assets-tools'
import { CATALOG, list, type Contract, type Registry } from '@omne-harness/dynamis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ReportedClient } from '@omne-harness/plugin-access'
import {
  PLUGIN_CATEGORY,
  listedPlugins,
  pluginImpact,
  pluginPlacement,
  type KnownPoint,
  type ListedPlugins,
} from '@omne-harness/plugin-host-local'
import { MANIFEST_FILE, readManifest, type PluginManifest } from '@omne-harness/plugin-protocol'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { nodeFileIo } from '../plugin-access/file-io.ts'
import { pluginReportsKey, type PluginReportsService } from '../plugin-access/reports-service.ts'
import { tenantAssetsKey, type TenantAssetsService } from '../tenant-assets/service.ts'
import { admittedDirectory } from '../tool-runtime/environment.ts'
import { extensionRevisionOf } from './extension-points.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

type Described =
  | Readonly<{ kind: 'asset'; standing: AssetStanding }>
  | Readonly<{ kind: 'absent' | 'denied' | 'unavailable' }>

export type ExtensionsPorts = Readonly<{
  faces(): ExtensionsFaces | undefined
  /** The directory the call works in, admitted now: absent when it has none, unavailable when that cannot be asked. */
  workingDirectory(): Promise<string | 'absent' | 'unavailable'>
  listed(tenant: string): Promise<ListedPlugins>
  registry(): Registry | undefined
  reports(tenant: string): readonly ReportedClient[] | undefined
  describe(capability: CapabilityId): Promise<Described>
  pointOf(category: string): string | undefined
  revision(): string | null
  serverLoads: boolean
}>

const hidden = (name: string): boolean => name.startsWith('.')
const safe = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')

/** A directory on disk as a package: its files, none whose name begins with a dot, each opened only as it was listed. */
function directoryPackage(root: string): PackageReader {
  return {
    async manifest() {
      try {
        const found = await readdir(root, { recursive: true, withFileTypes: true })
        const files = found
          .filter(entry => entry.isFile())
          .map(entry =>
            join(entry.parentPath, entry.name)
              .slice(root.length + 1)
              .split(sep),
          )
          .filter(segments => !segments.some(hidden))
        const entries = await Promise.all(
          files.map(async segments => {
            const file = join(root, ...segments)
            const [{ size }, { digest }] = await Promise.all([
              stat(file),
              nodeFileIo.digest(file, false),
            ])
            return { path: segments.join('/'), bytes: size, digest: `sha256:${digest}` }
          }),
        )
        return { ok: { entries: entries.sort((left, right) => (left.path < right.path ? -1 : 1)) } }
      } catch {
        return { failure: 'unavailable' }
      }
    },
    async open(path, expected) {
      if (!safe(path)) return { failure: 'entry-not-found' }
      try {
        const file = join(root, ...path.split('/'))
        const { size } = await stat(file)
        const bytes = await nodeFileIo.range(file, 0, size)
        return digestBytes(bytes) === expected ? { ok: bytes } : { failure: 'material-unavailable' }
      } catch {
        return { failure: 'entry-not-found' }
      }
    },
  }
}

async function directoryIn(
  working: string,
  path: string,
): Promise<PackageReader | 'absent' | 'unavailable'> {
  if (!safe(path)) return 'absent'
  try {
    const inside = await realpath(working)
    const root = await realpath(join(inside, ...path.split('/'))).catch(() => undefined)
    if (root === undefined || !root.startsWith(inside + sep)) return 'absent'
    return (await stat(root)).isDirectory() ? directoryPackage(root) : 'absent'
  } catch {
    return 'unavailable'
  }
}

/** What is known of a point of the server tree, from the contract it was declared with. */
function serverPoint(contract: Contract, takesDirectory: boolean): KnownPoint {
  const takes = takesDirectory ? 'directory' : contract.item.kind === 'data' ? 'data' : 'code'
  return {
    name: contract.name,
    side: 'server',
    takes,
    when: contract.binding === 'run' ? 'running' : 'build',
  }
}

function pointsOf(
  ports: ExtensionsPorts,
  clients: readonly ReportedClient[],
): readonly KnownPoint[] {
  const registry = ports.registry()
  const declared = registry === undefined ? undefined : list<Contract>(registry, CATALOG, null, [])
  const server = (declared?.kind === 'read' ? declared.items : []).map(({ entry }) =>
    serverPoint(entry.item, false),
  )
  const client = new Map<string, KnownPoint>()
  for (const { points } of clients)
    for (const { name } of points)
      client.set(name, { name, side: 'client', takes: null, when: null })
  return [...server, ...client.values()]
}

const UNREAD = Object.freeze({
  kind: 'unavailable' as const,
  reason: 'what the tenant holds cannot be read now',
})
const notHeld = (name: string) =>
  ({ kind: 'unavailable', reason: `the tenant holds no plugin named ${name}` }) as const

async function manifestIn(content: PublishContent): Promise<PluginManifest | string> {
  if (content.kind !== 'directory') return 'a plugin is published from a directory'
  const listed = await content.from.manifest()
  if (!('ok' in listed)) return `the directory cannot be read: ${listed.failure}`
  const entry = listed.ok.entries.find(found => found.path === MANIFEST_FILE)
  if (entry === undefined) return `the directory has no ${MANIFEST_FILE}`
  const opened = await content.from.open(entry.path, entry.digest)
  if (!('ok' in opened)) return `${MANIFEST_FILE} cannot be read: ${opened.failure}`
  const read = readManifest(new TextDecoder().decode(opened.ok))
  return read.kind === 'read' ? read.manifest : `${MANIFEST_FILE}: ${read.reason}`
}

const STANDING: Readonly<
  Record<AssetStanding['kind'], (standing: AssetStanding) => readonly [string, string]>
> = {
  selected: () => ['selected', 'sessions of this tenant get this one'],
  filtered: standing => ['not in effect', standing.kind === 'filtered' ? standing.reason : ''],
  unavailable: () => ['not known', 'a layer of the tenant cannot be read now'],
}

/** What one call of OmneExtensions is given. Every answer is for the tenant of the call, whatever a question names. */
export function createExtensionsSource(
  ports: ExtensionsPorts,
  call: Readonly<{ tenant: string; principal: unknown }>,
): ExtensionsCallSource {
  const { tenant } = call
  const impact: ChangeImpact = {
    async of({ capability, change, content }) {
      if (capability.category !== PLUGIN_CATEGORY) {
        const point = ports.pointOf(capability.category)
        if (point === undefined)
          return { kind: 'unavailable', reason: `category ${capability.category} has no point now` }
        const mark = change === 'disable' || change === 'remove' ? '-' : '+'
        const says =
          mark === '+' ? '→ held; the asset rules pick which one sessions get' : '→ no longer held'
        return {
          kind: 'changes',
          lines: [{ mark, of: null, point, key: capability.name, says }],
          loads: null,
          advice: null,
        }
      }
      const holding = await ports.listed(tenant)
      if (holding.kind !== 'read') return UNREAD
      const mine = holding.plugins.find(each => each.name === capability.name)
      const manifest = content === undefined ? mine?.manifest : await manifestIn(content)
      if (manifest === undefined) return notHeld(capability.name)
      if (typeof manifest === 'string') return { kind: 'unavailable', reason: manifest }
      const clients = ports.reports(tenant) ?? []
      return {
        kind: 'changes',
        ...pluginImpact({
          name: capability.name,
          change,
          manifest,
          held: holding.plugins,
          points: pointsOf(ports, clients),
          unknownSides: clients.length === 0 ? ['client'] : [],
          serverLoads: ports.serverLoads,
        }),
      }
    },
  }
  const placement: Placement = {
    async of({ capability }) {
      if (capability.category !== PLUGIN_CATEGORY) {
        const described = await ports.describe(capability)
        const point = ports.pointOf(capability.category)
        if (described.kind !== 'asset' || point === undefined)
          return { kind: 'unavailable', reason: 'how this one stands cannot be read now' }
        const [standing, says] = STANDING[described.standing.kind](described.standing)
        return {
          kind: 'placed',
          places: [{ point, key: capability.name, standing, says }],
          clients: null,
          advice: null,
        }
      }
      const holding = await ports.listed(tenant)
      if (holding.kind !== 'read') return UNREAD
      const mine = holding.plugins.find(each => each.name === capability.name)
      if (mine === undefined) return notHeld(capability.name)
      const told = ports.reports(tenant)
      const clients =
        told === undefined
          ? null
          : told.map(({ client, plugins }) => {
              const one = plugins.find(
                each => each.name === mine.name && `sha256:${each.version}` === mine.held.version,
              )
              return { client, state: one?.state ?? null, reason: one?.reason ?? null }
            })
      return {
        kind: 'placed',
        ...pluginPlacement({
          name: mine.name,
          manifest: mine.manifest,
          enabled: mine.enabled,
          held: holding.plugins,
          clients,
        }),
      }
    },
  }
  return {
    tenant,
    principal: call.principal,
    faces: () => ports.faces(),
    async directory(path) {
      const working = await ports.workingDirectory()
      return typeof working === 'string' && working !== 'absent' && working !== 'unavailable'
        ? directoryIn(working, path)
        : working
    },
    impact,
    placement,
    revision: () => ports.revision(),
  }
}

/** OmneExtensions acts for the tenant of the call, with its principal; the model gives neither. */
export function bindReleaseExtensions(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const encoded = tenantCodec.encode(parent.tenant)
  if (!encoded.ok) return scope
  const tenant = encoded.value
  const assets = (): TenantAssetsService | undefined =>
    ctx.get(tenantAssetsKey) as TenantAssetsService | undefined
  const faces = (): ExtensionsFaces | undefined => {
    const categories = ctx.get(assetCategoriesKey)?.view
    const management = ctx.get(assetManagementKey)?.management
    const publishing = ctx.get(assetPublishingKey)
    return categories === undefined || management === undefined || publishing === undefined
      ? undefined
      : { categories, management, publishing }
  }
  const source = createExtensionsSource(
    {
      faces,
      async workingDirectory() {
        if (parent.request.directory === undefined) return 'absent'
        const admitted = await admittedDirectory(
          () => ctx.get(workspaceInstancesKey, false),
          parent,
        )
        if (!('ok' in admitted)) return 'unavailable'
        return admitted.ok?.path ?? 'absent'
      },
      async listed(of) {
        const held = assets()
        if (held === undefined) return { kind: 'unavailable' }
        return listedPlugins(
          {
            sources: each => held.layerSources(each),
            async body(each, { asset, version }) {
              const read = await (await held.open(each))?.readVersion({ assetRef: asset, version })
              return read?.kind === 'version' ? read.version.body : undefined
            },
          },
          of,
        )
      },
      registry: () => (ctx.get(dynamisKey) as DynamisService | undefined)?.registry(),
      reports: of => (ctx.get(pluginReportsKey) as PluginReportsService | undefined)?.reportsOf(of),
      async describe(capability) {
        const management = faces()?.management
        if (management === undefined) return { kind: 'unavailable' }
        const described = await management.describe({
          tenant,
          principal: parent.principal,
          capability,
        })
        return described.kind === 'asset'
          ? { kind: 'asset', standing: described.standing }
          : { kind: described.kind }
      },
      pointOf(category) {
        const listing = ctx.get(assetCategoriesKey)?.view.describe(category)
        return listing !== undefined && 'point' in listing ? listing.point : undefined
      },
      revision: () => extensionRevisionOf(ctx),
      serverLoads: false,
    },
    { tenant, principal: parent.principal },
  )
  return attachExtensionsSource(scope, source)
}
