import { TOOL_READ_ARGUMENTS } from '../../entry/tool-read-budget.ts'
import { releaseCatalogViewOf } from './catalog-view.ts'
import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolResultReader, type ToolsReadRuntime } from '@omne-harness/tool'
import type { ToolCatalog } from '@omne-harness/tool-contract'
import { defaultResultPolicy, judgeCommittedToolResult } from '@omne-harness/tool-contract/provider'
import { toolCatalogKey, toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolForwarding } from '@omne-harness/tool-host-local'
import { z } from 'zod'
import {
  createForwardTargetRequests,
  isReleaseToolsRequest,
  releaseToolConsumer,
} from '../../entry/tool-forward-requests.ts'
import { sourcedEntriesOf } from '../../entry/tool-entry-sources.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { wasAdmittedTarget } from '../authorization/admitted-targets.ts'
import { currentHeldTool, heldReadable } from '../tool-host/held-current.ts'
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

/** The catalog as Tools searches it: a search is not answered from a catalog that lacks what the tenant holds. */
function searchedCatalog(
  ctx: Context,
  current: ToolCatalog<unknown> | undefined,
): ToolCatalog<unknown> | undefined {
  if (current === undefined) return undefined
  return {
    inspect: input => current.inspect(input),
    inspectEach: input => current.inspectEach(input),
    usage: input => current.usage(input),
    search: async input =>
      (await heldReadable(ctx, input))
        ? current.search(input)
        : fail({
            kind: 'unavailable' as const,
            dependency: 'tenant-tools',
            diagnostic:
              'The tools this tenant made cannot be read now. Call a tool of the release by its name, or search again later.',
          }),
  }
}

/** Service lookup is lazy; installing the bindings row must not wait for its own runtime. */
export function createReleaseToolsCapability(ctx: Context, config: ToolsCapabilityConfig) {
  const runtime = () => ctx.get(toolRuntimeKey, false)
  const release = () => releaseOf(ctx)
  const catalog = () => ctx.get(toolCatalogKey, false)
  const reading: ToolsReadRuntime<unknown> = {
    queries: {
      async readResult(input) {
        const current = runtime()
        if (current === undefined) return unavailable()
        let answer = await current.queries.readResult(input)
        if (
          'failure' in answer &&
          answer.failure.kind === 'not-found' &&
          answer.failure.target === 'result' &&
          answer.failure.reason === 'released'
        ) {
          answer = await (toolRuntimeHolder(ctx).bundle?.value.forwardedResult(input) ??
            Promise.resolve(unavailable()))
        }
        if ('failure' in answer) return answer
        // The Cordis key erases the provider's content generic. Check its real page before narrowing.
        const checked = judgeCommittedToolResult(defaultResultPolicy, answer.ok.value)
        if ('failure' in checked) return unavailable()
        if (Buffer.byteLength(JSON.stringify(checked.ok)) > config.resultPageBytes)
          return unavailable()
        return succeed({ ...answer.ok, value: checked.ok })
      },
    },
    content: { read: input => runtime()?.content.read(input) ?? Promise.resolve(unavailable()) },
    body: { read: input => runtime()?.body.read(input) ?? Promise.resolve(unavailable()) },
  }
  const reader = createToolResultReader(reading, { ...config, arguments: TOOL_READ_ARGUMENTS })
  return createLocalToolForwarding<unknown>({
    runtime,
    catalog: () => searchedCatalog(ctx, catalog()),
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
      held: (access, name) => currentHeldTool(ctx, access, name),
      admitted: (consumer, target) => wasAdmittedTarget(ctx, consumer, target),
      sourced: () => sourcedEntriesOf(ctx),
    }),
    reader: () => reader,
    attemptMs: config.attemptMs,
  })
}
