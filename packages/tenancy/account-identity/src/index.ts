// capability.account-identity v2 的提供者：`accounts` 与 `logins` 两个服务面。
// 契约：.meta_harness/design/spec/capabilities/account-identity/v2/contract.md；
// 节点设计：.meta_harness/design/realization/packages/tenancy/account-identity/design.md（「公开入口：导出与类型」）。
// **不导出**：出示物的产生与 LoginStateId 的派生（`generatePresentation`／`deriveLoginStateId`）、内部判定
// （`judgeLoginState`）、服务实现类——派生规则在本包之外没有第二份；服务实例经 inject 取得，不经 import。
export type {
  ProduceFailure,
  ProduceResult,
  ActivateFailure,
  AccountReading,
  ReadFailure,
  PurgeFailure,
  AccountsService,
  IssueFailure,
  IssuedLoginState,
  RevokeFailure,
  VerifyLoginFailure,
  ExchangedIdentity,
  EffectiveLoginState,
  ListEffectiveFailure,
  LoginsService,
  AccountIdentityConfig,
  AccountIdentityEvents,
} from './surface.ts'
export { ACCOUNTS_SERVICE, LOGINS_SERVICE } from './surface.ts'
export { type LoginStatePresentation, parseLoginStatePresentation } from './presentation.ts'
/** 只作类型再导出（定义在 identity-values）；不导出构造它的任何函数。 */
export type { LoginStateId } from '@omne-harness-lite/identity-values'
export { accountIdentityMigrations, ACCOUNT_TABLE, ACCOUNT_ID_COLUMN } from './schema.ts'
export { accountIdentityPlugin, AccountIdentityConfigSchema } from './plugin.ts'
