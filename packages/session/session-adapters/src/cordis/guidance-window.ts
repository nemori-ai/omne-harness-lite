import type { ModelViewRow } from '@omne-harness/session-contract'
import { createHash } from 'node:crypto'
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import {
  workspaceGuidanceBodySchema,
  WORKSPACE_GUIDANCE_PROVENANCE,
  workspaceGuidanceManifestSchema,
  type WorkspaceGuidance,
  type WorkspaceGuidanceScope,
} from '../workspace-guidance.ts'

const manifestPrefix = 'blk_guidance_scope_'
const sourcePrefix = 'blk_guidance_source_'
function blockId(prefix: string, partition: string, text: string): BlockId {
  const digest = createHash('sha256')
    .update(JSON.stringify([partition, text]))
    .digest('base64url')
  return (prefix + digest) as BlockId
}

function block(prefix: string, partition: string, value: unknown): TextContentBlock {
  const text = JSON.stringify(value)
  return {
    kind: 'text',
    id: blockId(prefix, partition, text),
    text,
    visibility: { toModel: true, toHuman: true },
  }
}

export type GuidanceIndex = Readonly<{
  manifest: BlockId | null
  sources: ReadonlySet<BlockId>
  scopes: readonly WorkspaceGuidanceScope[]
  sourceScopes: ReadonlyMap<BlockId, WorkspaceGuidanceScope>
}>
export const emptyGuidanceIndex = (): GuidanceIndex => ({
  manifest: null,
  sources: new Set(),
  scopes: [],
  sourceScopes: new Map(),
})

/** An entry proves a body only if its committed identifier matches every byte visible to the model. */
export function extendGuidanceIndex(
  previous: GuidanceIndex,
  messages: readonly Message[],
  partition: string,
  authored?: ReadonlyMap<string, WorkspaceGuidanceScope>,
): GuidanceIndex {
  let manifest = previous.manifest
  let sources: Set<BlockId> | undefined
  let scopes: Map<string, WorkspaceGuidanceScope> | undefined
  let sourceScopes: Map<BlockId, WorkspaceGuidanceScope> | undefined
  const remember = (id: BlockId, scope: WorkspaceGuidanceScope) => {
    if (previous.sourceScopes.has(id)) return
    sourceScopes ??= new Map(previous.sourceScopes)
    scopes ??= new Map(previous.scopes.map(scope => [JSON.stringify(scope), scope]))
    scopes.set(JSON.stringify(scope), scope)
    sourceScopes.set(id, scope)
  }
  for (const message of messages) {
    if (message.role !== 'system_reminder') continue
    for (const part of message.blocks) {
      if (part.kind !== 'text' || !part.visibility.toModel) continue
      const attested = authored?.get(part.id)
      if (attested !== undefined) remember(part.id, attested)
      if (part.id.startsWith(manifestPrefix)) {
        const valid = part.id === blockId(manifestPrefix, partition, part.text)
        manifest = valid ? part.id : null
        if (valid && !previous.sourceScopes.has(part.id)) {
          try {
            const parsed = workspaceGuidanceManifestSchema.safeParse(JSON.parse(part.text))
            if (parsed.success && parsed.data.scope !== null) remember(part.id, parsed.data.scope)
          } catch {}
        }
      }
      if (
        part.id.startsWith(sourcePrefix) &&
        !previous.sources.has(part.id) &&
        (part.id === blockId(sourcePrefix, partition, part.text) || attested !== undefined)
      ) {
        sources ??= new Set(previous.sources)
        sources.add(part.id)
        try {
          const body = workspaceGuidanceBodySchema.safeParse(JSON.parse(part.text))
          if (body.success) remember(part.id, body.data.scope)
        } catch {}
      }
    }
  }
  return {
    manifest,
    sources: sources ?? previous.sources,
    scopes: scopes === undefined ? previous.scopes : [...scopes.values()],
    sourceScopes: sourceScopes ?? previous.sourceScopes,
  }
}

export function guidanceBlocks(
  scope: Exclude<WorkspaceGuidance, { state: 'unavailable' }>,
  history: readonly Message[],
  partition: string,
): TextContentBlock[] {
  return missingGuidanceBlocks(
    scope,
    extendGuidanceIndex(emptyGuidanceIndex(), history, partition),
    partition,
  )
}

export function missingGuidanceBlocks(
  scope: Exclude<WorkspaceGuidance, { state: 'unavailable' }>,
  index: GuidanceIndex,
  partition: string,
): TextContentBlock[] {
  const scopeKey = 'session.workspace-guidance'
  const basis =
    scope.state === 'attached'
      ? { workspace: scope.workspace, instance: scope.instance, root: scope.root }
      : null
  const sources = scope.state === 'attached' ? scope.sources : []
  const manifest = block(manifestPrefix, partition, {
    key: scopeKey,
    scope: basis,
    sources: sources.map(({ path, digest }) => ({ path, digest })),
  })
  const pending: TextContentBlock[] = []
  if (index.manifest !== manifest.id) pending.push(manifest)
  for (const source of sources) {
    const body = block(sourcePrefix, partition, { key: scopeKey, scope: basis, source })
    if (!index.sources.has(body.id)) pending.push(body)
  }
  return pending
}

/** Only the original producer assigns an opaque qualification source to its own verified blocks. */
export function guidanceProvenance(
  message: Message,
  partition: string,
): NonNullable<ModelViewRow['provenance']> {
  const index = extendGuidanceIndex(emptyGuidanceIndex(), [message], partition)
  const grouped = new Map<string, string[]>()
  for (const [id, scope] of index.sourceScopes) {
    const key = JSON.stringify(scope)
    const blocks = grouped.get(key) ?? []
    blocks.push(id)
    grouped.set(key, blocks)
  }
  return [...grouped].map(([key, blocks]) => ({
    owner: WORKSPACE_GUIDANCE_PROVENANCE,
    key,
    blocks,
  }))
}
