// boot() 的测试封装：记下起来的中心供收尾撤除；启动失败时收下拒绝与观察到的 fiber。
import type { Fiber } from '@deepseek-ai/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  type BootHooks,
  type HostPluginName,
  HostStartupFailure,
  type TenancyHost,
  boot,
} from '../../src/index.ts'
import { type Deployment, LogCapture, asEnv } from './deployment.ts'

export interface Started {
  readonly host: TenancyHost
  readonly log: LogCapture
}

export interface Refused {
  readonly failure: HostStartupFailure
  readonly log: LogCapture
  readonly fibers: readonly { readonly name: HostPluginName; readonly fiber: Fiber }[]
}

export class Hosts {
  readonly #running: TenancyHost[] = []

  async start(d: Deployment, hooks: BootHooks = {}, log = new LogCapture()): Promise<Started> {
    const host = await boot({ env: asEnv(d), log, hooks })
    this.#running.push(host)
    return { host, log }
  }

  /** 期望 boot() 拒绝；拒绝值必须是 HostStartupFailure。 */
  async refuse(d: Deployment, hooks: BootHooks = {}, log = new LogCapture()): Promise<Refused> {
    const fibers: { name: HostPluginName; fiber: Fiber }[] = []
    const observed: BootHooks = {
      ...hooks,
      observeFiber: (name, fiber) => {
        fibers.push({ name, fiber })
        hooks.observeFiber?.(name, fiber)
      },
    }
    let host: TenancyHost
    try {
      host = await boot({ env: asEnv(d), log, hooks: observed })
    } catch (error) {
      if (!(error instanceof HostStartupFailure)) throw error
      return { failure: error, log, fibers }
    }
    this.#running.push(host)
    throw new Error('boot() was expected to refuse but the center started')
  }

  async stop(host: TenancyHost) {
    const index = this.#running.indexOf(host)
    if (index >= 0) this.#running.splice(index, 1)
    return host.dispose()
  }

  async stopAll(): Promise<void> {
    for (const host of this.#running.splice(0).reverse()) await host.dispose()
  }
}

/** 启动失败之后：没有任何 fiber 留在 ACTIVE（全部已撤）。 */
export function noneActive(fibers: Refused['fibers']): boolean {
  return fibers.every(({ fiber }) => (fiber.state as number) !== FIBER_STATE.ACTIVE)
}

export function allDisposed(fibers: Refused['fibers']): boolean {
  return fibers.every(({ fiber }) => (fiber.state as number) === FIBER_STATE.DISPOSED)
}

/** 恰一条 startup-failed 记录，且它不含任何 PEM 头。 */
export function failureRecords(log: LogCapture) {
  return log.events('startup-failed')
}
