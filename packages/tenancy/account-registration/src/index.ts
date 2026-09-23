// composition.account-registration v1 的提供者：`registration` 服务面（注册主链与清除链）。
// 契约：.meta_harness/design/spec/compositions/account-registration/v1/contract.md；
// 节点设计：.meta_harness/design/realization/packages/tenancy/account-registration/design.md。
// **不导出**：方法体工厂与依赖形状（服务实例经 inject 取得）、激活依据的签发——依据只在 ② 成功返回之后由本插件产出。
export {
  TERMINAL_OUTCOMES,
  type TerminalOutcome,
  PURGE_FAILURE_CLASSES,
  type PurgeFailureClass,
  type PurgeExpiredResult,
  type AccountPurgeFailure,
  type RegistrationDefectRecord,
  type RegistrationService,
  type AccountRegistrationConfig,
  REGISTRATION_SERVICE,
} from './types.ts'
export { RegistrationStopped } from './registration.ts'
export { registrationPlugin, AccountRegistrationConfigSchema } from './plugin.ts'
