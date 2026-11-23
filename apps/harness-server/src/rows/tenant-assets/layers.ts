import {
  packageBody,
  packageDigest,
  withinDirectory,
  type AssetLayerSource,
  type BodyContract,
  type Candidate,
  type PackageReader,
} from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import {
  workspaceBody,
  workspaceLayerSource,
  workspaceReader,
  type WorkspaceLayerInput,
} from '@omne-harness/workspace-asset-source'
import type { WorkspaceSources } from '@omne-harness/workspace-contract'

/** Where a turn's workspace layer comes from, looked up at each call. */
export type WorkspaceLayerPorts = Readonly<{
  sources(): WorkspaceSources<unknown> | undefined
  contractOf(category: string): BodyContract | undefined
}>

type Locator = Readonly<{ ref: string; digest: string }>

/** The layers one reader of a category takes its candidates, bodies and files from. */
export type AssetLayers = Readonly<{
  sources: readonly AssetLayerSource[]
  body(candidate: Candidate): Promise<JsonValue | undefined>
  readerOf(locator: Locator): PackageReader
}>

/** Where a body read from inside another package lies: the version and the directory within it. */
export type Within = Readonly<{ version: string; within: string }>

export type TenantAssetLayers = AssetLayers &
  Readonly<{ withinOf(ref: string, digest: string): Within | undefined }>

const ABSENT = Object.freeze({
  kind: 'unavailable',
  diagnostic: 'workspace sources absent',
} as const)
const ABSENT_SOURCES: Pick<WorkspaceSources<unknown>, 'adopted' | 'open'> = {
  adopted: async () => ABSENT,
  open: async () => ABSENT,
}

/** The key of the turn a call is made in; the workspace layer reads what that turn adopted. */
export function turnKeyOf(scope: unknown): string | null {
  const key = (scope as { key?: unknown } | null)?.key
  return typeof key === 'string' ? key : null
}

export const inWorkspace = (ref: string): boolean => ref.startsWith('workspace/')

type Judged = Readonly<{ body: JsonValue; digest: string }>

async function bodyWithin(contract: BodyContract | undefined, from: PackageReader) {
  const layout = contract?.layout
  if (layout === undefined) return undefined
  const listed = await from.manifest()
  if (!('ok' in listed)) return undefined
  const inspected = await layout.inspect(from)
  if (!('ok' in inspected)) return undefined
  const body = packageBody(inspected.ok, listed.ok)
  return 'ok' in body ? { body: body.ok, digest: packageDigest(listed.ok.entries) } : undefined
}

/** The official and the tenant layer of one tenant; `contract` is of the category being read. */
export function tenantLayers(
  assets: AssetsLocal,
  sources: readonly AssetLayerSource[],
  contract: () => BodyContract | undefined,
): TenantAssetLayers {
  const places = new Map<string, Within>()
  const judged = new Map<string, Judged>()
  const whole = (assetRef: string, version: string) => assets.packages.reader({ assetRef, version })
  return {
    sources,
    async body(candidate) {
      const { asset, version, within } = candidate
      if (within === undefined) {
        const read = await assets.readVersion({ assetRef: asset, version })
        return read.kind === 'version' ? read.version.body : undefined
      }
      const tag = `${asset}\n${version}\n${within}`
      const known =
        judged.get(tag) ??
        (await bodyWithin(contract(), withinDirectory(whole(asset, version), within)))
      if (known === undefined) return undefined
      judged.set(tag, known)
      places.set(`${asset}\n${known.digest}`, { version, within })
      return known.body
    },
    readerOf({ ref, digest }) {
      const at = places.get(`${ref}\n${digest}`)
      return at === undefined
        ? whole(ref, digest)
        : withinDirectory(whole(ref, at.version), at.within)
    },
    withinOf: (ref, digest) => places.get(`${ref}\n${digest}`),
  }
}

function withWorkspace(tenant: AssetLayers, input: WorkspaceLayerInput<unknown>): AssetLayers {
  const body = workspaceBody(input)
  const reader = workspaceReader(input)
  return {
    sources: [...tenant.sources, workspaceLayerSource(input)],
    body: candidate => (inWorkspace(candidate.asset) ? body(candidate) : tenant.body(candidate)),
    readerOf: locator =>
      inWorkspace(locator.ref)
        ? reader({ assetRef: locator.ref, version: locator.digest })
        : tenant.readerOf(locator),
  }
}

/** A turn's layers: the tenant's, and the workspace's as the turn adopted it. No turn: the tenant's. */
export function turnLayers(
  tenant: AssetLayers,
  workspace: WorkspaceLayerPorts,
  access: Access<unknown>,
  key: string | null,
): AssetLayers {
  if (key === null) return tenant
  const sources = workspace.sources() ?? ABSENT_SOURCES
  return withWorkspace(tenant, { sources, access, key, contractOf: workspace.contractOf })
}
