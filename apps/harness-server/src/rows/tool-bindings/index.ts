import type { Context, Plugin } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type {
  ToolMessageContentBlock,
  ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import {
  ToolStartAuthorityService,
  toolBindingsKey,
  toolCatalogKey,
  toolContributionAuthorityKey,
  toolStartAuthorityKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalToolBindingsPlugin,
  type LocalToolBindingsPluginInput,
} from '@omne-harness/tool-host-local/cordis'
import { defineRow } from '../../row.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { createReleaseAvailability } from './availability.ts'
import { releaseCatalogViewOf } from './catalog-view.ts'
import { z } from 'zod'
import { isReleaseToolRequest, isReleaseToolsRequest } from '../../entry/tool-forward-requests.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { createReleaseToolsCapability, toolsCapabilityConfig } from './tools-capability.ts'
import { bindReleaseTodoItems } from './todo-items.ts'
import { bindReleaseWeb, webBindingConfig, type WebBindingConfig } from './web.ts'

export const toolBindingsConfig = z
  .strictObject({ tools: toolsCapabilityConfig.optional(), web: webBindingConfig.optional() })
  .default({})

type Input = LocalToolBindingsPluginInput<unknown, unknown, ToolMessageContentBlock>
type Attachments = Readonly<{
  tools: ReturnType<typeof createReleaseToolsCapability> | null
  web: WebBindingConfig | null
}>

export function releaseCapability(
  ctx: Context,
  attachments: Attachments,
): NonNullable<Input['capability']> {
  const custody = () => ctx.get(settingsSecretCustodyKey)
  return (input, scope) => {
    const release = releaseOf(ctx)
    const withTools =
      attachments.tools !== null && isReleaseToolsRequest(release, input.request)
        ? attachments.tools.bind(input, scope)
        : scope
    const withTodos = isReleaseToolRequest(release, input.request, 'TodoItems')
      ? bindReleaseTodoItems(ctx, input, withTools)
      : withTools
    return attachments.web !== null && isReleaseToolRequest(release, input.request, 'Web')
      ? bindReleaseWeb(input, withTodos, attachments.web, custody)
      : withTodos
  }
}

const startUnavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: toolStartAuthorityKey, diagnostic })

export function startAuthorityProxy(ctx: Context): ToolStartAuthority<unknown> {
  const current = (): ToolStartAuthorityService<unknown> | undefined => {
    const service: unknown = ctx.get(toolStartAuthorityKey)
    return service instanceof ToolStartAuthorityService
      ? (service as ToolStartAuthorityService<unknown>)
      : undefined
  }
  const call = async <R>(use: (service: ToolStartAuthorityService<unknown>) => Promise<R>) => {
    const service = current()
    if (service === undefined) return startUnavailable('no start authority provider')
    try {
      return await use(service)
    } catch {
      return startUnavailable('start authority call failed')
    }
  }
  const proxy: ToolStartAuthority<unknown> = {
    exclude: input => call(service => service.exclude(input)),
    prepare: input => call(service => service.prepare(input)),
    consume: input => call(service => service.consume(input)),
    inspect: input => call(service => service.inspect(input)),
    invalidate: input => call(service => service.invalidate(input)),
  }
  return Object.freeze(proxy)
}

export function bundleScope(ctx: Context): Input['scope'] {
  return input => {
    const bundle = toolRuntimeHolder(ctx).bundle
    if (bundle === null)
      throw new Error('unavailable: the tool runtime bundle is not built; the author does not run')
    return bundle.value.authorExecution.scope(input)
  }
}

export function bundleSettle(ctx: Context): Input['settle'] {
  return async input => {
    const bundle = toolRuntimeHolder(ctx).bundle
    if (bundle === null)
      return fail({
        kind: 'unavailable',
        dependency: 'toolRuntime',
        diagnostic: 'the tool runtime bundle is not built',
      })
    return bundle.value.authorExecution.settle(input)
  }
}

const bindingsPlugin: Plugin.Object = {
  name: 'tool-bindings',
  inject: [toolContributionAuthorityKey],
  Config: toolBindingsConfig,
  apply(ctx: Context, raw: unknown) {
    const config = toolBindingsConfig.parse(raw)
    const tools =
      config.tools === undefined ? null : createReleaseToolsCapability(ctx, config.tools)
    const holder = toolRuntimeHolder(ctx)
    if (tools !== null) {
      if (holder.toolsForwarding !== null) throw new Error('Tools capability already installed')
      holder.toolsForwarding = tools
      ctx.effect(
        () => () => {
          void tools.close()
        },
        'tool-bindings.tools-capability',
      )
    }
    const Bindings = createLocalToolBindingsPlugin<unknown, unknown, ToolMessageContentBlock>({
      availability: createReleaseAvailability(ctx),
      view: releaseCatalogViewOf(ctx),
      search: { k1: 1.2, b: 0.75, maxCachedCorpora: 16 },
      authority: startAuthorityProxy(ctx),
      scope: bundleScope(ctx),
      settle: bundleSettle(ctx),
      capability: releaseCapability(ctx, { tools, web: config.web ?? null }),
    })
    new Bindings(ctx)
  },
}

export const toolBindingsRow = defineRow({
  row: 'tool-bindings',
  implementation: 'real',
  manifest: {
    provides: [toolBindingsKey, toolCatalogKey],
    injects: [toolContributionAuthorityKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: bindingsPlugin,
})
