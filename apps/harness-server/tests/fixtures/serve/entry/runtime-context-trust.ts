// 夹具入口对象 `runtimeContextTrust`：一个受信名的真实入口对象，构造定义的子类（IC-1、IC-2）。
// 另给一个安装时抛出的模块，用来检验退出码 3 与「错误消息不进 stdout」。
import type { Context } from '@deepseek-ai/cordis'
import type { EntryEnv, EntryObjectModule, ServiceName } from '../../../../src/types.ts'
import { FixtureRuntimeContextTrustService, runtimeContextTrustKey } from '../definitions.ts'

class RuntimeContextTrustImpl extends FixtureRuntimeContextTrustService {}

export const fixtureRuntimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrustKey,
  implementation: 'real',
  install(scope: Context) {
    new RuntimeContextTrustImpl(scope)
  },
}

export function failingEntryObject(name: ServiceName, detail: string): EntryObjectModule {
  return {
    name,
    implementation: 'real',
    install() {
      throw new Error(detail)
    },
  }
}

/** 调用 `env.once` 的模块：同一符号两次，第二次按 `again` 决定用同一个还是另一个 create。 */
export function onceProbe(
  name: ServiceName,
  again: 'same' | 'different',
  seen: unknown[],
): EntryObjectModule {
  const key = Symbol('once-probe')
  const create = () => ({ made: true })
  return {
    name,
    implementation: 'real',
    install(scope: Context, env: EntryEnv) {
      seen.push(env.once(key, create))
      seen.push(env.once(key, again === 'same' ? create : () => ({ made: false })))
      scope.provide(name, {})
    },
  }
}
