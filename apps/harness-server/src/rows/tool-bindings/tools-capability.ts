import { releaseCatalogViewOf } from './catalog-view.ts'
import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createToolMessageResultCodec,
  createToolResultReader,
  type ToolsReadRuntime,
} from '@omne-harness/tool'
import { toolCatalogKey, toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolForwarding } from '@omne-harness/tool-host-local'
import { z } from 'zod'
import {
  createForwardTargetRequests,
  isReleaseToolsRequest,
  releaseToolConsumer,
} from '../../entry/tool-forward-requests.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const toolsCapabilityConfig = z.strictObject({
  attemptMs: positive.max(2_147_483_647),
  resultPageBytes: positive,
  replyMaxBytes: positive,
  contentPageBytes: positive,
})
export type ToolsCapabilityConfig = z.infer<typeof toolsCapabilityConfig>
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'toolRuntime',
    diagnostic: 'The current Tools runtime or adoption is unavailable.',
  })
const ARGUMENTS = Object.freeze({
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 32_768,
  maxNumberLength: 64,
})

/** Service lookup is lazy; installing the bindings row must not wait for its own runtime. */
export function createReleaseToolsCapability(ctx: Context, config: ToolsCapabilityConfig) {
  const runtime = () => ctx.get(toolRuntimeKey, false)
  const release = () => releaseOf(ctx)
  const catalog = () => ctx.get(toolCatalogKey, false)
  const codec = createToolMessageResultCodec(config.resultPageBytes)
  const reading: ToolsReadRuntime<unknown> = {
    queries: {
      async readResult(input) {
        const current = runtime()
        if (current === undefined) return unavailable()
        const answer = await current.queries.readResult(input)
        if ('failure' in answer) return answer
        // The Cordis key erases the provider's content generic. Check its real page before narrowing.
        const encoded = codec.encode(answer.ok.value)
        if ('failure' in encoded) return unavailable()
        const decoded = codec.decode(encoded.ok)
        return 'failure' in decoded ? unavailable() : succeed({ ...answer.ok, value: decoded.ok })
      },
    },
    content: { read: input => runtime()?.content.read(input) ?? Promise.resolve(unavailable()) },
    body: { read: input => runtime()?.body.read(input) ?? Promise.resolve(unavailable()) },
  }
  const reader = createToolResultReader(reading, { ...config, arguments: ARGUMENTS })
  return createLocalToolForwarding<unknown>({
    runtime,
    catalog,
    forwarding: () => toolRuntimeHolder(ctx).bundle?.value.forwarding(),
    consumer: async parent => {
      const current = release()
      return current.kind === 'trusted' && isReleaseToolsRequest(current, parent.request)
        ? succeed(releaseToolConsumer(current))
        : unavailable()
    },
    prepareTarget: createForwardTargetRequests({
      release,
      catalog,
      view: () => releaseCatalogViewOf(ctx),
    }),
    reader: () => reader,
    attemptMs: config.attemptMs,
  })
}
