// `tool-bindings` 行（AA 插件树、简报 B3-T2a 第 5、6、9 项）：绑定登记表与 Catalog。一个插件、一个 fiber
// 提供两个服务：类静态 provide 的 `toolBindings`，与构造时注册的 `toolCatalog`（L-TOOL 事实清单 §4）。
// 四个工厂参数：
// - `availability`：发行静态事实与执行环境的在场事实，见 `availability.ts`。
// - `authority`：逐次读取当前 `toolStartAuthority` 的窄代理。提供者是 `tool-records` 行装的 bundle records 插件
//   （同一个启动协调器），本行不建第二个。
// - `scope`、`settle`：Tool 运行时组同一个 bundle 的 `authorExecution.scope` 与 `authorExecution.settle`（B 段，
//   L-TOOL 事实清单 §1）。逐次读本次运行的 bundle；还没建好时 scope 抛出 unavailable、settle 答 unavailable。
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

/**
 * The per-call attachments of the release, in a fixed order: Tools first (it produces the context the
 * others attach to), then TodoItems, then Web. Each attaches only to the call of its own release tool.
 * The Web attachment reads the trusted `settingsSecretCustody` per call: the assembly page lists it
 * as a name this row reads, not one it injects, so a tree without the custody row still binds and
 * only search answers unavailable.
 */
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

/**
 * 启动权威的窄代理（B 段接 `createLocalToolRuntimePlugins` bundle 的 records 提供者）：每次调用现取当前
 * `toolStartAuthority`，只认契约服务定义的实例；缺席、是替身或抛出时答 unavailable，不默认允许。
 */
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

/** bundle 的执行作用域；bundle 还没建好时抛出，作者不会运行。 */
export function bundleScope(ctx: Context): Input['scope'] {
  return input => {
    const bundle = toolRuntimeHolder(ctx).bundle
    if (bundle === null)
      throw new Error('unavailable: the tool runtime bundle is not built; the author does not run')
    return bundle.value.authorExecution.scope(input)
  }
}

/** bundle 的收场；bundle 还没建好时答 unavailable，不伪造结果。 */
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
    // Both services register in this row's fiber: `toolBindings` here, `toolCatalog` in its constructor.
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
