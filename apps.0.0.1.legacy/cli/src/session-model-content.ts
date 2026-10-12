import type { AttachmentRef, ContentBlock } from '@omne-harness-lite/content-blocks'
import type { ModelCallExternalContentCustody } from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

function references(blocks: readonly ContentBlock[]): AttachmentRef[] {
  return blocks.flatMap(block => {
    const own =
      block.kind === 'file'
        ? [block.attachment]
        : block.kind === 'tool_result'
          ? [...(block.offloaded ? [block.offloaded] : []), ...references(block.blocks)]
          : (block.kind === 'image' || block.kind === 'voice') && !('inline' in block.data)
            ? [block.data]
            : []
    return 'renderings' in block
      ? [...own, ...(block.renderings ?? []).flatMap(item => references(item.blocks))]
      : own
  })
}

/** Confirms immutable tool-result files, which outlive the referencing model payloads. */
export function createSessionModelContentCustody(
  read: (scope: SessionScope, reference: AttachmentRef) => Promise<Uint8Array | undefined>,
): ModelCallExternalContentCustody {
  return {
    async confirm({ binding, content }) {
      const refs =
        content.kind === 'reply_ready'
          ? [
              ...references(content.value.reply.blocks),
              ...(content.value.raw?.body ? [content.value.raw.body] : []),
            ]
          : [
              ...content.value.input.messages,
              ...(content.value.status === 'accepted' ? content.value.adopted.messages : []),
            ].flatMap(message => references(message.blocks))
      const unique = new Map(refs.map(reference => [JSON.stringify(reference), reference]))
      for (const reference of unique.values()) {
        const bytes = await read({ tenant: binding.tenant, session: binding.session }, reference)
        if (bytes === undefined) return { unavailable: true }
      }
      return { retained: true }
    },
  }
}
