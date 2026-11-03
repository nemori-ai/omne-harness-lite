// 生产入口对 Runtime Context 收窄与 Execution 授权三件的接线（R2-D16、R2-D34、AS-10）。
// 成员模块的工厂在构造时要一份共享的 Scope 来源，而来源需要入口受信的 `sessionPrincipalBindings`，
// 受信上下文只有 `install(scope, env)` 才拿得到。所以这里按 `env` 懒建一份来源：同一次运行内四个模块共用它，
// 不同运行互不相通（`WeakMap` 以 `env` 为键，不留进程级状态）。
// Scope 归属读 `session-ad03` 事实子插件提供的 `sessionScopeLookup`（R2-D14：入口用它解出会话，再经受信
// `sessionPrincipalBindings` 核对归属），每次调用经本次运行的根现取，缺席答 unavailable。Tool B 段接上。
// AD-15 的恢复授权生产来源尚未交付：读口答缺席，落到成员默认的 unavailable，不补造来源。
import type { Context } from '@deepseek-ai/cordis'
import type { SessionPrincipalBindingSource } from '@omne-harness/session-contract'
import type { SessionScopeLookup } from '@omne-harness/session-cordis-contract'
import {
  sessionPrincipalBindingsKey,
  sessionScopeLookupKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { createExecutionAuthorityModules } from './execution-authorities.ts'
import { createRuntimeContextTrustModule, runtimeContextTrust } from './runtime-context-trust.ts'
import {
  createSessionScopeSource,
  type SessionScopeOwnershipSource,
  type SessionScopeSource,
} from './session-scope-source.ts'

const scopesByEnv = new WeakMap<EntryEnv, SessionScopeSource>()

/** 每次调用现读入口受信的会话归属读口；没有提供者时是 `undefined`。 */
function readPrincipalBindings(env: EntryEnv): SessionPrincipalBindingSource | undefined {
  const source: SessionPrincipalBindingSource | undefined = env
    .readTrusted(sessionPrincipalBindingsKey)
    .get(sessionPrincipalBindingsKey)
  return source
}

/** `sessionScopeLookup` 的答案换成应用的归属投影；查找服务缺席时为 undefined。 */
export function ownershipFrom(
  lookup: SessionScopeLookup | undefined,
): SessionScopeOwnershipSource | undefined {
  if (lookup === undefined) return undefined
  return {
    async lookup(scope) {
      const answer = await lookup.lookup(scope)
      switch (answer.kind) {
        case 'known':
          return {
            kind: 'bound',
            tenant: answer.tenant,
            session: answer.session,
            generation: answer.generation,
          }
        case 'unknown':
          return { kind: 'unknown' }
        default:
          return { kind: 'unavailable' }
      }
    },
  }
}

function scopesOf(env: EntryEnv, scope: Context): SessionScopeSource {
  const made = scopesByEnv.get(env)
  if (made !== undefined) return made
  // 根上的普通名：`session-ad03` 事实子插件在根上提供查找。
  const root = scope.root
  const created = createSessionScopeSource({
    readOwnership: () => ownershipFrom(root.get(sessionScopeLookupKey)),
    readPrincipalBindings: () => readPrincipalBindings(env),
  })
  scopesByEnv.set(env, created)
  return created
}

/** Runtime Context 信任入口，绑定到同一份共享 Scope 来源。名字与原 `runtimeContextTrust` 相同。 */
export const scopedRuntimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrust.name,
  implementation: 'real',
  install: (scope, env) =>
    createRuntimeContextTrustModule(scopesOf(env, scope)).install(scope, env),
}

/** Execution 的授权、Scope 绑定与恢复授权三个入口模块，`readBindings` 返回同一份共享来源的绑定。 */
export const executionAuthorities: readonly EntryObjectModule[] =
  createExecutionAuthorityModules().map((module, index): EntryObjectModule => ({
    name: module.name,
    implementation: module.implementation,
    install(scope, env) {
      // AD-15 的恢复授权没有生产来源：`readRecovery` 缺席，恢复授权只会答 unavailable。
      const bound = createExecutionAuthorityModules({
        readBindings: () => scopesOf(env, scope).bindings,
      })[index]
      if (bound === undefined) throw new Error('execution authority module index out of range')
      return bound.install(scope, env)
    },
  }))
