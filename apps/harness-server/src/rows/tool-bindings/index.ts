// `tool-bindings` 行（AA 插件树、简报 B3-T2a 第 5、6、9 项）：绑定登记表与 Catalog。一个插件、一个 fiber
// 提供两个服务：类静态 provide 的 `toolBindings`，与构造时注册的 `toolCatalog`（L-TOOL 事实清单 §4）。
// 四个工厂参数：
// - `availability`：发行静态事实，见 `availability.ts`。
// - `authority`：逐次读取当前 `toolStartAuthority` 的窄代理。B 段接 `createLocalToolRuntimePlugins` bundle。
// - `scope`、`settle`：A 段占位，明确答 unavailable。B 段接 `createLocalToolRuntimePlugins` bundle 的
//   `authorExecution.scope` 与 `authorExecution.settle`。
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
import { createReleaseAvailability } from './availability.ts'

type Input = LocalToolBindingsPluginInput<unknown, unknown, ToolMessageContentBlock>

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

/** A 段占位（B 段接 `createLocalToolRuntimePlugins` bundle）：没有执行作用域，作者不会运行。 */
export const unavailableScope: Input['scope'] = () => {
  throw new Error('unavailable: tool-bindings has no author execution scope before segment B')
}

/** A 段占位（B 段接 `createLocalToolRuntimePlugins` bundle）：没有收场来源，不伪造结果。 */
export const unavailableSettle: Input['settle'] = async () =>
  fail({
    kind: 'unavailable',
    dependency: 'toolRuntime',
    diagnostic: 'author settlement is unavailable before segment B',
  })

const bindingsPlugin: Plugin.Object = {
  name: 'tool-bindings',
  inject: [toolContributionAuthorityKey],
  apply(ctx: Context) {
    const Bindings = createLocalToolBindingsPlugin<unknown, unknown, ToolMessageContentBlock>({
      availability: createReleaseAvailability(ctx),
      authority: startAuthorityProxy(ctx),
      scope: unavailableScope,
      settle: unavailableSettle,
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
