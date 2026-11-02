// `agentHostPrincipal`（AA 运行时对象表「Agent 宿主维护主体」、agent-cordis-contract Cordis 页「宿主主体与授权操作清单」）：
// 装配入口签发的系统主体，在根上 provide，`agent-host` 静态 inject，宿主用它代实例所属租户 `publish`、`quiesce`、`withdraw`。
// 组件名取授权行授予表的 `AGENT_HOST_COMPONENT`，所以现行授权对这三件按授予表放行。它没有服务定义（宿主插件按名
// `ctx.get`），所以按名 provide 原值。签发经入口自己读受信名 `principalIssuer` 的服务，本模块不持有签发者；
// 签发者还没装好时装载失败（退出 3），不提供默认主体。
import type { PrincipalIssuer, SystemPrincipal } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { AGENT_HOST_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

/** 宿主插件按这个名字 `inject` 与 `ctx.get`（agent-host-local `host-plugin.ts`）。定义包没有键常量。 */
export const AGENT_HOST_PRINCIPAL_KEY = 'agentHostPrincipal'

/**
 * 用本运行的签发者签一个入口系统主体。签发者是受信名 `principalIssuer` 上的服务，入口自己按名读；
 * 它必须先于调用方模块安装（入口对象按清单顺序安装）。只返回主体，不返回签发者。
 */
export function issueEntrySystemPrincipal(env: EntryEnv, component: string): SystemPrincipal {
  const issuer: PrincipalIssuer | undefined = env
    .readTrusted(principalIssuerKey)
    .get(principalIssuerKey)
  if (issuer === undefined)
    throw new Error(
      `entry principal "${component}": the trusted ${principalIssuerKey} is not installed yet; list its module before this one`,
    )
  const issued = issuer.issueSystem({ component })
  if ('failure' in issued)
    throw new Error(
      `entry principal "${component}": the authority refused it (${issued.failure.field}: ${issued.failure.reason})`,
    )
  return issued.ok
}

export const agentHostPrincipal: EntryObjectModule = {
  name: AGENT_HOST_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(AGENT_HOST_PRINCIPAL_KEY, issueEntrySystemPrincipal(env, AGENT_HOST_COMPONENT))
  },
}
