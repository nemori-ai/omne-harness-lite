import { createHash } from 'node:crypto'
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { WorkspaceGuidance } from '../workspace-guidance.ts'

const manifestPrefix = 'blk_guidance_scope_'
const sourcePrefix = 'blk_guidance_source_'
function block(prefix: string, partition: string, value: unknown): TextContentBlock {
  const text = JSON.stringify(value)
  const digest = createHash('sha256')
    .update(JSON.stringify([partition, text]))
    .digest('base64url')
  return {
    kind: 'text',
    id: (prefix + digest) as BlockId,
    text,
    visibility: { toModel: true, toHuman: true },
  }
}

/** Only source-identified, model-visible, intact reminder blocks satisfy a current requirement. */
export function guidanceBlocks(
  scope: WorkspaceGuidance,
  history: readonly Message[],
  partition: string,
): TextContentBlock[] {
  const visible = new Map<string, string>()
  let lastManifest: TextContentBlock | undefined
  for (const message of history) {
    if (message.role !== 'system_reminder') continue
    for (const part of message.blocks) {
      if (part.kind !== 'text' || !part.visibility.toModel) continue
      if (part.id.startsWith(manifestPrefix)) lastManifest = part
      if (part.id.startsWith(sourcePrefix)) visible.set(part.id, part.text)
    }
  }
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
  if (lastManifest?.id !== manifest.id || lastManifest.text !== manifest.text)
    pending.push(manifest)
  for (const source of sources) {
    const body = block(sourcePrefix, partition, { key: scopeKey, scope: basis, source })
    if (visible.get(body.id) !== body.text) pending.push(body)
  }
  return pending
}
