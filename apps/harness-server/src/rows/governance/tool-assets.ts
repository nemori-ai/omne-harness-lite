import {
  capabilityId,
  isReadBody,
  pinBody,
  readBodyText,
  type BodyContract,
  type JudgeContext,
  type JsonValue,
} from '@omne-harness/assets'
import type { AssetPublicationRef } from '@omne-harness/assets-local'
import { writeJsonText } from '@omne-harness/json-text'
import { canonicalDigest } from '@omne-harness/tool'
import { toolBodyContract } from '@omne-harness/tool-contract'
import { scriptConstructionOf, scriptToolLayout } from '@omne-harness/tool-contract/provider'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'

const TOOL_CATEGORY = 'tool'

const limits = {
  maxBytes: 256 * 1024,
  maxDepth: 24,
  maxItems: 16384,
  maxMembers: 16384,
  maxStringLength: 8192,
  maxNumberLength: 32,
}
const bodyOf = (entry: ToolReleaseEntry) => ({
  asset: entry.asset,
  module: entry.module,
  definition: entry.definition,
  governance: entry.governance.declaration.reference,
})
function readBody(value: unknown): JsonValue {
  const read = readBodyText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('Tool asset publication exceeds its body contract')
  return read.value
}

export function toolAssetPublication(entry: ToolReleaseEntry) {
  const { origin, reference } = entry.governance.declaration
  if (origin.kind !== 'asset') throw new Error('Tool release has no asset origin')
  const identity = capabilityId('tool', entry.asset.name)
  if (!identity.ok) throw new Error('Tool release has no asset identity')
  const pinned = pinBody({
    identity: identity.id,
    version: reference.version,
    source: TOOL_GOVERNANCE_OWNER,
    body: readBody(bodyOf(entry)),
  })
  const publicationRef: AssetPublicationRef = {
    assetRef: origin.assetId,
    category: pinned.identity.category,
    name: pinned.identity.name,
    version: pinned.version,
    source: pinned.source,
    bodyDigest: canonicalDigest(pinned.body).slice(7),
  }
  return { assetRef: origin.assetId, pinned, publicationRef }
}

export function createToolAssetCategory(
  release: Extract<ToolRelease, { kind: 'trusted' }>,
): BodyContract {
  function entryFor(body: unknown, context?: JudgeContext) {
    if (!isReadBody(body)) return undefined
    const entry = release.manifest.entries.find(
      candidate =>
        candidate.asset.name === context?.capabilityName &&
        candidate.governance.declaration.reference.version === context?.definition,
    )
    if (entry === undefined) return undefined
    const text = writeJsonText(body)
    if (Buffer.byteLength(text) > limits.maxBytes) return undefined
    const native: unknown = JSON.parse(text)
    return canonicalDigest(native) === canonicalDigest(bodyOf(entry)) ? entry : undefined
  }
  const general = toolBodyContract()
  /** A body a tenant or a workspace wrote: the general tool body, implemented by the script executor of the release. */
  function scriptProblem(body: unknown, context?: JudgeContext): string | undefined {
    if (!isReadBody(body)) return 'unknown-tool-publication'
    const construction = scriptConstructionOf(body)
    if (construction === undefined) return 'unknown-tool-publication'
    if (!('ok' in construction)) return construction.failure.reason
    const judged = general.judge(body, context)
    return judged.ok ? undefined : judged.rejected
  }
  return {
    category: TOOL_CATEGORY,
    schema: readBody({ enum: release.manifest.entries.map(bodyOf) }),
    judge(body, context) {
      if (entryFor(body, context) !== undefined) return { ok: true }
      const rejected = scriptProblem(body, context)
      return rejected === undefined ? { ok: true } : { ok: false, rejected }
    },
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
    layout: scriptToolLayout,
    settings(body, context) {
      const entry = entryFor(body, context)
      if (entry === undefined && scriptProblem(body, context) === undefined) return null
      const declaration = entry?.governance.declaration
      if (
        declaration?.settings.length === 0 &&
        declaration.permissions.every(value => value.settings === null)
      )
        return null
      const definition = declaration?.settings[0]
      if (declaration?.settings.length !== 1 || definition === undefined)
        throw new Error('Tool asset Settings declaration is unavailable')
      return definition
    },
  }
}
