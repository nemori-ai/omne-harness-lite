// 规则按路径写死的那几处，路径一律相对于扫描根（`packages/`）。
// 未迁布局沿精确节点 verification；T4 服务端集成与事件坐标由成员 SPEC 接续。
// 边界变化须有采用依据，不能通过扩大白名单掩盖违规。
import { isTestPath } from '@omne-harness/repo-toolchain/core/rule'

export const TENANCY = 'tenancy/'

export const ENTRY_PACKAGE = 'tenancy/governance-center-entry-node/'
export const ENTRY_SRC = `${ENTRY_PACKAGE}src/`
/** 运维面源码目录（SC-2 白名单的键）。 */
export const ENTRY_OPS = `${ENTRY_SRC}ops/`
/** T4: the pure event owner; Cordis augmentation stays in its binding entry. */
export const ENTRY_EVENTS = 'core/governance-center-entry/src/events.ts'
export const ENTRY_EVENTS_PACKAGE = '@omne-harness/governance-center-entry'
/** 客户端面（TLS 监听与 HTTP 落地）。 */
export const ENTRY_TRANSPORT = `${ENTRY_SRC}transport/`

export const ACCOUNT_IDENTITY = 'tenancy/account-identity-sql/'
export const ACCOUNT_IDENTITY_SRC = `${ACCOUNT_IDENTITY}src/`
/** 出示物的产生与派生所在模块：本包里 `node:crypto` 随机源只许在这里出现（AI design S-45 行）。 */
export const ACCOUNT_IDENTITY_RANDOM_MODULE = `${ACCOUNT_IDENTITY_SRC}presentation.ts`
/** 插件体所在模块（构造服务实现类的地方）。 */
export const ACCOUNT_IDENTITY_PLUGIN_MODULE = `${ACCOUNT_IDENTITY_SRC}plugin.ts`

export const ACCOUNT_REGISTRATION = 'tenancy/account-registration-sequential/'
export const ACCOUNT_REGISTRATION_SRC = `${ACCOUNT_REGISTRATION}src/`
export const ACCOUNT_REGISTRATION_DEFINITION_SRC = 'core/account-registration/src/'
export const CREDENTIAL_VERIFICATION = 'tenancy/credential-verification-scrypt/'
export const ORGANIZATION_GOVERNANCE = 'tenancy/organization-governance-sql/'
export const ORGANIZATION_GOVERNANCE_DEFINITION = 'core/organization-governance/'
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
