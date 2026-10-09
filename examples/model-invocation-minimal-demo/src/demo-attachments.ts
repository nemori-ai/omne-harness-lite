import { AsyncLocalStorage } from 'node:async_hooks'
import { setTimeout as yieldToTimers } from 'node:timers/promises'
import { type ContentBlock, type ImageBlock } from '@omne-harness-lite/content-blocks'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  TransportAdapter,
  PlannedRequest,
  PlanExecutionContext,
  RawResponse,
} from '@omne-harness-lite/model-request-runtime'
import type {
  ModelCallExternalContentCustody,
  ModelCallContentValue,
} from '@omne-harness-lite/model-request-runtime-local'
import type { DemoAttachmentRead } from './demo-result-reader.ts'

function needsImageBytes(input: readonly ContentBlock[]): boolean {
  return input.some(block => {
    if (!block.visibility.toModel) return false
    if (block.kind === 'tool_result') return needsImageBytes(block.blocks)
    return block.kind === 'image' && !('inline' in block.data)
  })
}

/** Request-local bytes are not written back into the Session log. */
export function createDemoAttachments(read: DemoAttachmentRead) {
  const requests = new AsyncLocalStorage<{
    scope: SessionScope
    read: DemoAttachmentRead
    imageBytes?: PlanExecutionContext['imageBytes']
  }>()
  async function snapshotImages(
    input: readonly ContentBlock[],
    scope: SessionScope,
    reader: DemoAttachmentRead,
    signal: AbortSignal,
  ): Promise<NonNullable<PlanExecutionContext['imageBytes']>> {
    const snapshots: NonNullable<PlanExecutionContext['imageBytes']>[number][] = []
    async function snapshotImage(block: ImageBlock): Promise<void> {
      if ('inline' in block.data) return
      const reference = block.data
      if (signal.aborted) throw new Error('Image read interrupted')
      // Serial reads keep ownership until the actual IO stops.
      const bytes = await reader(scope, reference)
      if (!bytes || bytes.byteLength > 4 * 1024 * 1024 || signal.aborted)
        throw new Error('Image bytes unavailable')
      const existing = snapshots.find(item => modelLogJsonEqual(item.reference, reference))
      if (!existing) snapshots.push({ reference, bytes: Uint8Array.from(bytes) })
    }
    async function visit(blocks: readonly ContentBlock[]): Promise<void> {
      for (const block of blocks) {
        if (!block.visibility.toModel) continue
        if (block.kind === 'tool_result') await visit(block.blocks)
        else if (block.kind === 'image') await snapshotImage(block)
      }
    }
    await visit(input)
    return snapshots
  }
  async function confirmImage(
    block: ImageBlock,
    scope: SessionScope,
    reader: DemoAttachmentRead,
  ): Promise<void> {
    if (
      block.renderings?.some(rendering =>
        rendering.blocks.some(item => item.kind !== 'text' && !('inline' in item.data)),
      )
    )
      throw new Error('External image rendering custody unsupported')
    if (!('inline' in block.data)) {
      const bytes = await reader(scope, block.data)
      if (!bytes || bytes.byteLength > 4 * 1024 * 1024)
        throw new Error('Image attachment custody unavailable')
    }
  }
  async function confirmBlocks(
    input: readonly ContentBlock[],
    scope: SessionScope,
    reader: DemoAttachmentRead,
  ): Promise<void> {
    for (const block of input) {
      if (block.kind === 'tool_result') {
        if (block.offloaded) throw new Error('Offloaded content custody unsupported')
        await confirmBlocks(block.blocks, scope, reader)
      } else if (block.kind === 'file' || block.kind === 'voice') {
        throw new Error('Non-image external content custody unsupported')
      } else if (block.kind === 'image') {
        await confirmImage(block, scope, reader)
      }
    }
  }
  async function confirmContent(
    content: ModelCallContentValue,
    scope: SessionScope,
    reader: DemoAttachmentRead,
  ): Promise<void> {
    if (content.kind === 'reply_ready') {
      if (content.value.raw?.body) throw new Error('Raw body custody unsupported')
      await confirmBlocks(content.value.reply.blocks, scope, reader)
      return
    }
    for (const message of content.value.input.messages)
      await confirmBlocks(message.blocks, scope, reader)
    if (content.value.status === 'accepted')
      for (const message of content.value.adopted.messages)
        await confirmBlocks(message.blocks, scope, reader)
  }
  // The original result-file owner synchronizes immutable bytes before confirmation.
  // It has no GC/delete operation. Closing drains IO and preserves bytes for cold recovery.
  const custody = Object.freeze<ModelCallExternalContentCustody>({
    async confirm({ binding, content }) {
      try {
        await confirmContent(
          content,
          { tenant: binding.tenant, session: binding.session },
          requests.getStore()?.read ?? read,
        )
        return { retained: true as const }
      } catch {
        return { unavailable: true as const }
      }
    },
  })
  return Object.freeze({
    custody,
    snapshot: snapshotImages,
    within<T>(
      scope: SessionScope,
      task: () => Promise<T>,
      reader: DemoAttachmentRead = read,
      imageBytes?: PlanExecutionContext['imageBytes'],
    ): Promise<T> {
      return requests.run({ scope, read: reader, imageBytes }, task)
    },
    transport(
      original: TransportAdapter<PlannedRequest, RawResponse>,
    ): TransportAdapter<PlannedRequest, RawResponse> {
      const plan: typeof original.plan = async (input, execution) => {
        const result = await original.plan(input, execution)
        // Synchronous metering can span the Clock lease. Let its original maintenance run.
        await yieldToTimers(0)
        return result
      }
      return {
        ...original,
        async plan(input, execution) {
          const request = requests.getStore()
          if (!request || !input.messages.some(message => needsImageBytes(message.blocks)))
            return plan(input, execution)
          if (!request.imageBytes) return { rejected: 'unavailable' }
          return plan(input, { ...execution, imageBytes: request.imageBytes })
        },
      }
    },
  })
}
