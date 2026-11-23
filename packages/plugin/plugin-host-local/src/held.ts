import {
  MAX_ASSET_PAGE,
  capabilityId,
  collectCandidates,
  evaluate,
  listAssets,
  type AssetEntry,
  type AssetLayerSource,
  type Candidate,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { readManifest, type PluginManifest } from '@omne-harness/plugin-protocol'
import { PLUGIN_CATEGORY } from './category.ts'
import type { KeptContents } from './contents.ts'

export type HeldFile = Readonly<{ path: string; digest: string; bytes: number }>

/** One plugin a tenant holds and the evaluation chooses. `version` is the digest of its package, written so that it fits in a path. */
export type HeldPlugin = Readonly<{
  name: string
  version: string
  manifestText: string
  manifest: PluginManifest
  files: readonly HeldFile[]
  held: Readonly<{ asset: string; version: string }>
}>

export type HeldPlugins =
  | Readonly<{ kind: 'read'; plugins: readonly HeldPlugin[] }>
  | Readonly<{ kind: 'unavailable' }>

export type HeldPluginPorts = Readonly<{
  sources(tenant: string): readonly AssetLayerSource[] | undefined
  body(
    tenant: string,
    held: Readonly<{ asset: string; version: string }>,
  ): Promise<JsonValue | undefined>
}>

const UNAVAILABLE = Object.freeze({ kind: 'unavailable' as const })
const DIGEST = /^sha256:([0-9a-f]{64})$/u

const field = (tree: JsonValue, key: string): JsonValue | undefined =>
  tree.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined

function fileOf(entry: JsonValue): HeldFile | undefined {
  const path = field(entry, 'path')
  const digest = field(entry, 'digest')
  const bytes = field(entry, 'bytes')
  if (path?.kind !== 'string' || digest?.kind !== 'string' || bytes?.kind !== 'number') return
  return { path: path.value, digest: digest.value, bytes: Number(bytes.lexeme) }
}

/** The manifest and the file list a published body carries, or nothing when the body is not one of a plugin. */
function writtenIn(
  body: JsonValue,
): Pick<HeldPlugin, 'manifestText' | 'manifest' | 'files'> | undefined {
  if (body.kind !== 'object') return
  const packed = field(body, 'manifest')
  const listed = packed === undefined ? undefined : field(packed, 'entries')
  const files = listed?.kind === 'array' ? listed.items.map(fileOf) : undefined
  if (files === undefined || files.includes(undefined)) return
  const written = body.entries.filter(entry => entry.key !== 'manifest')
  const manifestText = writeJsonText({ kind: 'object', entries: written })
  const read = readManifest(manifestText)
  if (read.kind !== 'read') return
  return { manifestText, manifest: read.manifest, files: files as readonly HeldFile[] }
}

/** Every entry the layers list in this category, read page by page; nothing when a page cannot be read whole. */
async function entriesOf(
  sources: readonly AssetLayerSource[],
): Promise<readonly AssetEntry[] | undefined> {
  const entries: AssetEntry[] = []
  let after: string | null = null
  do {
    const answer = await listAssets(sources, {
      category: PLUGIN_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return
    entries.push(...answer.page.items)
    after = answer.page.next
  } while (after !== null)
  return entries
}

async function namesOf(
  sources: readonly AssetLayerSource[],
): Promise<readonly CapabilityId[] | undefined> {
  const entries = await entriesOf(sources)
  if (entries === undefined) return
  return [...new Map(entries.map(entry => [entry.capability.name, entry.capability])).values()]
}

type Chosen = Candidate | 'none' | 'unavailable'

async function chosen(sources: readonly AssetLayerSource[], name: string): Promise<Chosen> {
  const capability = capabilityId(PLUGIN_CATEGORY, name)
  if (!capability.ok) return 'none'
  const layers = await collectCandidates(sources, capability.id)
  const evaluation = evaluate({ layers, eligible: () => 'yes' })
  if (evaluation.kind === 'unavailable') return 'unavailable'
  return evaluation.kind === 'winner' ? evaluation.candidate : 'none'
}

/** The plugins one tenant is to load, from what it holds: for each name the version the evaluation chooses. */
export async function heldPlugins(ports: HeldPluginPorts, tenant: string): Promise<HeldPlugins> {
  const sources = ports.sources(tenant)
  if (sources === undefined) return UNAVAILABLE
  const names = await namesOf(sources)
  if (names === undefined) return UNAVAILABLE
  const plugins: HeldPlugin[] = []
  for (const { name } of names) {
    const candidate = await chosen(sources, name)
    if (candidate === 'unavailable') return UNAVAILABLE
    if (candidate === 'none') continue
    const held = { asset: candidate.asset, version: candidate.version }
    const body = await ports.body(tenant, held)
    if (body === undefined) return UNAVAILABLE
    const written = writtenIn(body)
    const version = DIGEST.exec(candidate.version)?.[1]
    if (written === undefined || version === undefined) continue
    plugins.push({ name, version, ...written, held })
  }
  return { kind: 'read', plugins: plugins.sort((left, right) => (left.name < right.name ? -1 : 1)) }
}

export type ListedPlugin = Readonly<{
  name: string
  enabled: boolean
  manifest: PluginManifest
  held: Readonly<{ asset: string; version: string }>
}>

export type ListedPlugins =
  | Readonly<{ kind: 'read'; plugins: readonly ListedPlugin[] }>
  | Readonly<{ kind: 'unavailable' }>

/** Every plugin a tenant holds, enabled or not, with the manifest of the version it holds. */
export async function listedPlugins(
  ports: HeldPluginPorts,
  tenant: string,
): Promise<ListedPlugins> {
  const sources = ports.sources(tenant)
  if (sources === undefined) return UNAVAILABLE
  const entries = await entriesOf(sources)
  if (entries === undefined) return UNAVAILABLE
  const plugins: ListedPlugin[] = []
  for (const { capability, asset, version, enabled } of entries) {
    const body = await ports.body(tenant, { asset, version })
    if (body === undefined) return UNAVAILABLE
    const written = writtenIn(body)
    if (written === undefined) continue
    plugins.push({
      name: capability.name,
      enabled,
      manifest: written.manifest,
      held: { asset, version },
    })
  }
  return { kind: 'read', plugins: plugins.sort((left, right) => (left.name < right.name ? -1 : 1)) }
}

export type HeldPart =
  | Readonly<{ kind: 'read'; part: Uint8Array; next: number | null; bytes: number }>
  | Readonly<{ kind: 'absent'; what: 'file' }>
  | Readonly<{ kind: 'unavailable' }>

/** One part of one file of a held plugin, read through the package of its version. With kept contents, the parts of one file are cut from one opening of it. */
export async function readHeldPart(
  reader: PackageReader,
  file: HeldFile,
  offset: number,
  limit: number,
  kept?: KeptContents,
): Promise<HeldPart> {
  let content = kept?.get(file.digest)
  if (content === undefined) {
    const opened = await reader.open(file.path, file.digest)
    if (!('ok' in opened))
      return opened.failure === 'entry-not-found'
        ? { kind: 'absent', what: 'file' }
        : { kind: 'unavailable' }
    content = opened.ok
    kept?.keep(file.digest, content)
  }
  const bytes = content.length
  const part = content.subarray(offset, offset + limit)
  const end = offset + part.length
  return { kind: 'read', part, next: end < bytes ? end : null, bytes }
}
