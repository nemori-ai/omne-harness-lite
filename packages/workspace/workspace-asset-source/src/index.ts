import {
  capabilityId,
  digestBytes,
  MAX_ASSET_PAGE,
  packageBody,
  packageDigest,
  type AssetEntry,
  type AssetLayerSource,
  type BodyContract,
  type Candidate,
  type JsonValue,
  type PackageReader,
  type PackageSourceFailure,
} from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SourceAdoption,
  SourceDigests,
  SourceLayout,
  SourcePackage,
  SourceRoot,
  WorkspaceSources,
} from '@omne-harness/workspace-contract'

const LAYER = 'workspace' as const
const ROOTS: readonly SourceRoot[] = ['local', 'shared']

export const assetDigests: SourceDigests = { file: digestBytes, package: packageDigest }

export function layoutsOf(contracts: readonly BodyContract[]): readonly SourceLayout[] {
  return contracts.flatMap(({ category, layout }) =>
    layout === undefined ? [] : [{ category, namespace: layout.namespace, limits: layout.limits }],
  )
}

export type WorkspaceLayerInput<P> = Readonly<{
  sources: Pick<WorkspaceSources<P>, 'adopted' | 'open'>
  access: Access<P>
  key: string
  /** The contract of a category, looked up when it is used: a category taken away reads as none. */
  contractOf(category: string): BodyContract | undefined
}>

type Placed = Pick<SourcePackage, 'root' | 'category' | 'name'>

/** `workspace/<root>/<category>/<name>`: only where to find the package again. */
export function workspaceAssetRef({ root, category, name }: Placed): string {
  return `${LAYER}/${root}/${category}/${name}`
}

function placedOf(assetRef: string): Placed | null {
  const [layer, root, category, name, ...rest] = assetRef.split('/')
  if (layer !== LAYER || rest.length > 0 || category === undefined || name === undefined)
    return null
  return ROOTS.includes(root as SourceRoot) ? { root: root as SourceRoot, category, name } : null
}

type Adopted = Extract<SourceAdoption, { kind: 'adopted' }>

async function readingOf<P>(
  input: WorkspaceLayerInput<P>,
): Promise<Adopted | 'none' | 'unreadable'> {
  try {
    const adopted = await input.sources.adopted(input.access, { key: input.key })
    if (adopted.kind === 'adopted') return adopted
    return adopted.kind === 'none' ? 'none' : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

type Unread = Readonly<{ layer: typeof LAYER; state: 'not-applicable' | 'unavailable' }>

async function readingFor<P>(input: WorkspaceLayerInput<P>, category: string) {
  if (input.contractOf(category)?.layout === undefined)
    return { layer: LAYER, state: 'not-applicable' } satisfies Unread
  const adopted = await readingOf(input)
  if (adopted === 'none') return { layer: LAYER, state: 'not-applicable' } satisfies Unread
  if (adopted === 'unreadable') return { layer: LAYER, state: 'unavailable' } satisfies Unread
  return adopted
}

const SOURCE_FAILURE: Readonly<Record<string, PackageSourceFailure>> = {
  changed: 'material-unavailable',
  'not-found': 'entry-not-found',
}

/** The files of one package, as the reading recorded them; a file that changed since is not read. */
function readerOf<P>(input: WorkspaceLayerInput<P>, pkg: SourcePackage): PackageReader {
  return {
    manifest: async () => succeed({ entries: pkg.entries }),
    async open(path, expected): Promise<Outcome<Uint8Array, PackageSourceFailure>> {
      const { category, name, root } = pkg
      const at = { category, name, root, path, digest: expected }
      const read = await input.sources.open(input.access, { key: input.key, at })
      return read.kind === 'bytes'
        ? succeed(read.bytes)
        : fail(SOURCE_FAILURE[read.kind] ?? 'unavailable')
    },
  }
}

/** The body by the check its category registered; `unreadable` when its files are not those read. */
async function judgedOf<P>(
  input: WorkspaceLayerInput<P>,
  pkg: SourcePackage,
): Promise<JsonValue | 'invalid' | 'unreadable'> {
  const contract = input.contractOf(pkg.category)
  if (contract?.layout === undefined) return 'invalid'
  const inspected = await contract.layout.inspect(readerOf(input, pkg))
  if (!('ok' in inspected))
    return inspected.failure.kind === 'source-failed' ? 'unreadable' : 'invalid'
  const body = packageBody(inspected.ok, { entries: pkg.entries })
  if (!('ok' in body)) return 'invalid'
  const judged = contract.judge(body.ok, { capabilityName: pkg.name, definition: pkg.version })
  return judged.ok ? body.ok : 'invalid'
}

const bodyOf = async <P>(input: WorkspaceLayerInput<P>, pkg: SourcePackage) => {
  const judged = await judgedOf(input, pkg)
  return typeof judged === 'string' ? undefined : judged
}

const candidateOf = (pkg: SourcePackage): Candidate => ({
  asset: workspaceAssetRef(pkg),
  version: pkg.version,
  disabled: false,
  immutable: false,
  replaceLocked: false,
})

async function validIn<P>(
  input: WorkspaceLayerInput<P>,
  adopted: Adopted,
  category: string,
  name?: string,
): Promise<Readonly<{ valid: readonly SourcePackage[]; unreadable: boolean }>> {
  const found = adopted.reading.packages.filter(
    pkg => pkg.category === category && (name === undefined || pkg.name === name),
  )
  const judged = await Promise.all(found.map(pkg => judgedOf(input, pkg)))
  return {
    valid: found.filter((_, at) => judged[at] !== 'invalid'),
    unreadable: judged.includes('unreadable'),
  }
}

const entryOf = (pkg: SourcePackage): AssetEntry[] => {
  const capability = capabilityId(pkg.category, pkg.name)
  if (!capability.ok) return []
  const { version } = pkg
  const asset = workspaceAssetRef(pkg)
  return [
    { capability: capability.id, layer: LAYER, asset, version, selection: 'follow', enabled: true },
  ]
}

/** The workspace as one asset layer: what the sources adopted for this turn, and nothing else. */
export function workspaceLayerSource<P>(input: WorkspaceLayerInput<P>): AssetLayerSource {
  return {
    layer: LAYER,
    async candidates(capability) {
      const adopted = await readingFor(input, capability.category)
      if ('state' in adopted) return adopted
      const { valid, unreadable } = await validIn(
        input,
        adopted,
        capability.category,
        capability.name,
      )
      // What the turn adopted is there but cannot be read: not read as gone, nor as another layer's.
      if (unreadable) return { layer: LAYER, state: 'unavailable' }
      return { layer: LAYER, state: 'read', candidates: valid.map(candidateOf) }
    },
    async list(request) {
      if (request.limit < 1 || request.limit > MAX_ASSET_PAGE) return { state: 'invalid' }
      const adopted = await readingFor(input, request.category)
      if ('state' in adopted) return adopted
      const { valid: found } = await validIn(input, adopted, request.category)
      const valid = found.filter(
        pkg => request.after === null || workspaceAssetRef(pkg) > request.after,
      )
      const items = valid.slice(0, request.limit).flatMap(entryOf)
      const next = valid.length > request.limit ? (items.at(-1)?.asset ?? null) : null
      return { layer: LAYER, state: 'read', page: { items, next, completeness: 'complete' } }
    },
  }
}

async function packageOf<P>(input: WorkspaceLayerInput<P>, assetRef: string, version: string) {
  const placed = placedOf(assetRef)
  if (placed === null) return undefined
  const adopted = await readingOf(input)
  if (typeof adopted === 'string') return undefined
  return adopted.reading.packages.find(
    pkg =>
      pkg.root === placed.root &&
      pkg.category === placed.category &&
      pkg.name === placed.name &&
      pkg.version === version,
  )
}

export function workspaceBody<P>(
  input: WorkspaceLayerInput<P>,
): (candidate: Candidate) => Promise<JsonValue | undefined> {
  return async candidate => {
    const pkg = await packageOf(input, candidate.asset, candidate.version)
    return pkg === undefined ? undefined : bodyOf(input, pkg)
  }
}

export function workspaceReader<P>(
  input: WorkspaceLayerInput<P>,
): (at: Readonly<{ assetRef: string; version: string }>) => PackageReader {
  return at => ({
    async manifest() {
      const pkg = await packageOf(input, at.assetRef, at.version)
      return pkg === undefined ? fail('package-not-found') : succeed({ entries: pkg.entries })
    },
    async open(path, expected) {
      const pkg = await packageOf(input, at.assetRef, at.version)
      return pkg === undefined
        ? fail('package-not-found')
        : readerOf(input, pkg).open(path, expected)
    },
  })
}
