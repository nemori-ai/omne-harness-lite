import {
  MAX_ASSET_PAGE,
  capabilityId,
  collectCandidates,
  evaluate,
  listAssets,
  type AssetLayerSource,
  type Candidate,
  type CapabilityId,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { readManifest, type PluginManifest } from '@omne-harness/plugin-protocol'
import { PLUGIN_CATEGORY } from './category.ts'

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
  /** The layers of one tenant, or nothing when they cannot be given now. */
  sources(tenant: string): readonly AssetLayerSource[] | undefined
  /** The body of one published version, or nothing when it cannot be read now. */
  body(
    tenant: string,
    held: Readonly<{ asset: string; version: string }>,
  ): Promise<JsonValue | undefined>
}>

const UNAVAILABLE: HeldPlugins = Object.freeze({ kind: 'unavailable' })
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

async function namesOf(
  sources: readonly AssetLayerSource[],
): Promise<readonly CapabilityId[] | undefined> {
  const named = new Map<string, CapabilityId>()
  let after: string | null = null
  do {
    const answer = await listAssets(sources, {
      category: PLUGIN_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return
    for (const item of answer.page.items) named.set(item.capability.name, item.capability)
    after = answer.page.next
  } while (after !== null)
  return [...named.values()]
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

export type HeldPart =
  | Readonly<{ kind: 'read'; part: Uint8Array; next: number | null; bytes: number }>
  | Readonly<{ kind: 'absent'; what: 'file' }>
  | Readonly<{ kind: 'unavailable' }>

/** One part of one file of a held plugin, read through the package of its version. */
export async function readHeldPart(
  reader: PackageReader,
  file: HeldFile,
  offset: number,
  limit: number,
): Promise<HeldPart> {
  const opened = await reader.open(file.path, file.digest)
  if (!('ok' in opened))
    return opened.failure === 'entry-not-found'
      ? { kind: 'absent', what: 'file' }
      : { kind: 'unavailable' }
  const bytes = opened.ok.length
  const part = opened.ok.subarray(offset, offset + limit)
  const end = offset + part.length
  return { kind: 'read', part, next: end < bytes ? end : null, bytes }
}
