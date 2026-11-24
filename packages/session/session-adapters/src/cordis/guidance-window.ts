import { createHash } from 'node:crypto'
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { WorkspaceGuidance } from '../workspace-guidance.ts'

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

export type GuidanceIndex = Readonly<{ manifest: BlockId | null; sources: ReadonlySet<BlockId> }>
export const emptyGuidanceIndex = (): GuidanceIndex => ({ manifest: null, sources: new Set() })

/** An entry proves a body only if its committed identifier matches every byte visible to the model. */
export function extendGuidanceIndex(
  previous: GuidanceIndex,
  messages: readonly Message[],
  partition: string,
): GuidanceIndex {
  let manifest = previous.manifest
  let sources: Set<BlockId> | undefined
  for (const message of messages) {
    if (message.role !== 'system_reminder') continue
    for (const part of message.blocks) {
      if (part.kind !== 'text' || !part.visibility.toModel) continue
      if (part.id.startsWith(manifestPrefix))
        manifest = part.id === blockId(manifestPrefix, partition, part.text) ? part.id : null
      if (
        part.id.startsWith(sourcePrefix) &&
        !previous.sources.has(part.id) &&
        part.id === blockId(sourcePrefix, partition, part.text)
      ) {
        sources ??= new Set(previous.sources)
        sources.add(part.id)
      }
    }
  }
  return { manifest, sources: sources ?? previous.sources }
}

export function guidanceBlocks(
  scope: WorkspaceGuidance,
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
  scope: WorkspaceGuidance,
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
