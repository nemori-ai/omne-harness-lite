// 两个服务实现共用的依赖。插件体按 inject 与 config 组装它；测试装配直接构造（随机源、存储、时钟替身在这里注入）。
import type { CredentialsService } from '@omne-harness-lite/account-identity'
import type { VerificationKey } from '@omne-harness-lite/identity-values'
import type { Clock, Duration } from '@omne-harness-lite/offer-expiry'
import { StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import { type Diagnostics, type Notifier, describeError } from './diagnostics.ts'
import type { RandomSource } from './presentation.ts'

import type { IdentityPersistence } from './identity-data.ts'

export interface PolicyDeps {
  /** 原事务绑定的数据操作，不交出 SQL 或存储实例。 */
  readonly persistence: IdentityPersistence
  /** 必需 inject 的 `clock`。 */
  readonly clock: Clock
  /** 可选依赖 `credentials`，**每次调用时解析**：缺席 ⇒ 凭据步骤判不出来（`storage-unavailable`），不是判为不合规。 */
  readonly resolveCredentials: () => CredentialsService | undefined
  /** S-26：形状不透明，原样交给 `credentials.checkPolicy`；`undefined` 即「取不到」。 */
  readonly credentialPolicy: unknown
  /** S-39：加载时已校验为正。 */
  readonly unactivatedRetention: Duration
  readonly activationKey: VerificationKey
  readonly purgeKey: VerificationKey
  readonly notifier: Notifier
  readonly diagnostics: Diagnostics
  /** 出示物的随机源；插件体不传，恒为 `node:crypto.randomBytes`。 */
  readonly random: RandomSource
}

/** Assembly dependencies retain the original public storage input. */
export interface ServiceDeps extends Omit<PolicyDeps, 'persistence'> {
  readonly storage: AtomicStorage
}

/**
 * 存储「不可用」收成契约的 `storage-unavailable` 并记一条诊断；其余异常（`StorageDefect`、本包缺陷……）原样上抛——
 * 没有 catch-all。唯一冲突与引用违反须在此之前由操作自己按约束名分支处理。
 */
export function storageUnavailable(
  diagnostics: Diagnostics,
  operation: string,
  error: unknown,
): { readonly failure: 'storage-unavailable' } {
  if (error instanceof StorageUnavailable) {
    diagnostics.warn('storage-unavailable', { operation, cause: describeError(error) })
    return { failure: 'storage-unavailable' }
  }
  throw error
}
