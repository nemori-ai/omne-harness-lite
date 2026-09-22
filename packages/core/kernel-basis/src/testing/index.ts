import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { FIBER_STATE } from '../fiber-state.ts'

/** 测试装配里一个由装配层直接 provide 的服务（存储、时钟）。 */
export interface ProvidedService {
  readonly name: string
  readonly value: unknown
}

export interface AssemblyOptions {
  /** 由装配层 provide 的服务；用一个匿名插件承载，随装配一起撤除。 */
  readonly services?: readonly ProvidedService[]
  /** 按顺序装载的插件与各自 config。 */
  readonly plugins?: readonly { readonly plugin: Plugin; readonly config?: unknown }[]
}

export interface Assembly {
  readonly ctx: Context
  readonly fibers: readonly Fiber[]
  /** 撤除全部插件（逆序），供测试收尾。 */
  dispose(): Promise<void>
}

/**
 * 起一个真实的 Cordis `Context`，先 provide 装配层服务，再逐个装载插件并等它们 settle。
 * 任一插件启动失败（config 或插件体抛出）时整个装配抛出——测试里不允许「装配成功但某个面不可用」。
 */
export async function bootAssembly(options: AssemblyOptions): Promise<Assembly> {
  const ctx = new Context()
  const fibers: Fiber[] = []
  const disposeAll = async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  }
  try {
    const services = options.services ?? []
    if (services.length > 0) {
      const host = ctx.plugin({
        name: 'assembly-services',
        apply(inner: Context) {
          for (const service of services) inner.provide(service.name, service.value)
        },
      })
      fibers.push(await host)
    }
    for (const entry of options.plugins ?? []) {
      const fiber = ctx.plugin(entry.plugin as Plugin.Object, entry.config as never)
      fibers.push(fiber)
      if ((fiber.state as number) === FIBER_STATE.PENDING) {
        // 清单错误：必需服务不在前面的插件里，等下去只会静默挂起
        throw new Error(
          `plugin "${String(entry.plugin.name)}" is PENDING: a required service is not provided by the plugins loaded before it`,
        )
      }
      await fiber
    }
  } catch (error) {
    // 部分装配失败：先撤已装的（含失败那一个），不留半个装配
    await disposeAll().catch(() => undefined)
    throw error
  }
  return { ctx, fibers, dispose: disposeAll }
}

/** 等待一个 fiber 进入 ACTIVE 或以启动错误拒绝；供需要观察中间状态的测试使用。 */
export async function settle(fiber: Fiber & PromiseLike<Fiber>): Promise<Fiber> {
  return await fiber
}

export { FIBER_STATE }
