// 生产入口对 Runtime Context 收窄与 Execution 授权三件的接线（R2-D16、R2-D34、AS-10）。
// 成员模块的工厂在构造时要一份共享的 Scope 来源，而来源需要入口受信的 `sessionPrincipalBindings`，
// 受信上下文只有 `install(scope, env)` 才拿得到。所以这里按 `env` 懒建一份来源：同一次运行内四个模块共用它，
// 不同运行互不相通（`WeakMap` 以 `env` 为键，不留进程级状态）。
// AD-03 的 Scope 归属生产来源和 AD-15 的恢复授权生产来源尚未交付：两个读口都答缺席，
// 落到成员默认的 unavailable，不补造来源。
import type { SessionPrincipalBindingSource } from '@omne-harness/session-contract'
import { sessionPrincipalBindingsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { createExecutionAuthorityModules } from './execution-authorities.ts'
import { createRuntimeContextTrustModule, runtimeContextTrust } from './runtime-context-trust.ts'
import { createSessionScopeSource, type SessionScopeSource } from './session-scope-source.ts'

const scopesByEnv = new WeakMap<EntryEnv, SessionScopeSource>()

/** 每次调用现读入口受信的会话归属读口；没有提供者时是 `undefined`。 */
function readPrincipalBindings(env: EntryEnv): SessionPrincipalBindingSource | undefined {
  const source: SessionPrincipalBindingSource | undefined = env
    .readTrusted(sessionPrincipalBindingsKey)
    .get(sessionPrincipalBindingsKey)
  return source
}

function scopesOf(env: EntryEnv): SessionScopeSource {
  const made = scopesByEnv.get(env)
  if (made !== undefined) return made
  const created = createSessionScopeSource({
    // AD-03 的 Scope 归属读口还没有生产来源：缺席，绑定答 unavailable。
    readOwnership: () => undefined,
    readPrincipalBindings: () => readPrincipalBindings(env),
  })
  scopesByEnv.set(env, created)
  return created
}

/** Runtime Context 信任入口，绑定到同一份共享 Scope 来源。名字与原 `runtimeContextTrust` 相同。 */
export const scopedRuntimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrust.name,
  implementation: 'real',
  install: (scope, env) => createRuntimeContextTrustModule(scopesOf(env)).install(scope, env),
}

/** Execution 的授权、Scope 绑定与恢复授权三个入口模块，`readBindings` 返回同一份共享来源的绑定。 */
export const executionAuthorities: readonly EntryObjectModule[] =
  createExecutionAuthorityModules().map((module, index): EntryObjectModule => ({
    name: module.name,
    implementation: module.implementation,
    install(scope, env) {
      // AD-15 的恢复授权没有生产来源：`readRecovery` 缺席，恢复授权只会答 unavailable。
      const bound = createExecutionAuthorityModules({ readBindings: () => scopesOf(env).bindings })[
        index
      ]
      if (bound === undefined) throw new Error('execution authority module index out of range')
      return bound.install(scope, env)
    },
  }))
