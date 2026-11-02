// `toolResidencyPrincipal`（AA 运行时对象表「常驻引用读取主体」、DP-1 表 3-4）：装配入口签发的系统主体，在根上
// provide，`tool-residency` 行静态 inject；桥接插件以调用方类 `maintainer` 调用 Session `references` 时出示它，
// 作为系统作用域的读取资格。组件名取授权行授予表的 `TOOL_RESIDENCY_COMPONENT`，现行授权对 `resident-references`
// 按授予表放行。没有服务定义，按名 provide 原值；签发方式与 `agent-host-principal.ts` 相同。
import { TOOL_RESIDENCY_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'

/** `tool-residency` 行按这个名字 `inject`（装配页行表）。定义包没有键常量。 */
export const TOOL_RESIDENCY_PRINCIPAL_KEY = 'toolResidencyPrincipal'

export const toolResidencyPrincipal: EntryObjectModule = {
  name: TOOL_RESIDENCY_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(
      TOOL_RESIDENCY_PRINCIPAL_KEY,
      issueEntrySystemPrincipal(env, TOOL_RESIDENCY_COMPONENT),
    )
  },
}
