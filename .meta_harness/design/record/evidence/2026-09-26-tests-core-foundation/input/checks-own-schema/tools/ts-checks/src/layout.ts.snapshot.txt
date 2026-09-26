// 规则按路径写死的那几处，路径一律相对于扫描根（`packages/`）。
// 入口层包的布局以 governance-center-entry 节点 verification「包布局常量」一行为准：
// .meta_harness/design/realization/packages/tenancy/governance-center-entry/verification.md#静态检查
// 包偏离布局即规则失效——布局改动先改那一行，再改这里。
import { isTestPath } from './rule.ts'

export const TENANCY = 'tenancy/'

export const ENTRY_PACKAGE = 'tenancy/governance-center-entry/'
export const ENTRY_SRC = `${ENTRY_PACKAGE}src/`
/** 运维面源码目录（SC-2 白名单的键）。 */
export const ENTRY_OPS = `${ENTRY_SRC}ops/`
/** 事件声明模块：只导出 `serving`、`stopped`、`defect`、`listening` 四个常量。 */
export const ENTRY_EVENTS = `${ENTRY_SRC}events.ts`
/** 客户端面（TLS 监听与 HTTP 落地）。 */
export const ENTRY_TRANSPORT = `${ENTRY_SRC}transport/`

export const ACCOUNT_IDENTITY = 'tenancy/account-identity/'
export const ACCOUNT_IDENTITY_SRC = `${ACCOUNT_IDENTITY}src/`
/** 出示物的产生与派生所在模块：本包里 `node:crypto` 随机源只许在这里出现（AI design S-45 行）。 */
export const ACCOUNT_IDENTITY_RANDOM_MODULE = `${ACCOUNT_IDENTITY_SRC}presentation.ts`
/** 插件体所在模块（构造服务实现类的地方）。 */
export const ACCOUNT_IDENTITY_PLUGIN_MODULE = `${ACCOUNT_IDENTITY_SRC}plugin.ts`

export const ACCOUNT_REGISTRATION = 'tenancy/account-registration/'
export const ACCOUNT_REGISTRATION_SRC = `${ACCOUNT_REGISTRATION}src/`
export const CREDENTIAL_VERIFICATION = 'tenancy/credential-verification/'
export const ORGANIZATION_GOVERNANCE = 'tenancy/organization-governance/'
export const OFFER_EXPIRY = 'core/offer-expiry/'

/** 产品源码（非测试）且位于 `dir` 之下。 */
export function productSourceIn(path: string, dir: string): boolean {
  return path.startsWith(dir) && !isTestPath(path)
}

/** 包源码目录 `tenancy/<pkg>/src/` 下的产品源码，返回包名。 */
export function tenancyPackageOf(path: string): string | undefined {
  const m = /^tenancy\/([^/]+)\/src\//.exec(path)
  return m === null || isTestPath(path) ? undefined : m[1]
}
