// 四个服务面共用的依赖与助手。插件体每次运行建一份；事实都在存储里，这里不持有任何事实。
import type { Logger } from '@deepseek-ai/cordis'
import type { AccountsService, LoginsService } from '@omne-harness-lite/account-identity'
import type { AccountId, SigningKey } from '@omne-harness-lite/identity-values'
import type { Clock, Duration } from '@omne-harness-lite/offer-expiry'
import { mapStorageError, type Storage } from '@omne-harness-lite/storage'
import type {
  OrganizationGovernanceEventName,
  OrganizationGovernanceEventPayload,
} from './types.ts'

/** 加载时校验过的政策参数。 */
export interface ResolvedConfig {
  readonly invitationTtlDefault: Duration
  readonly affiliationRequestTtlDefault: Duration
  readonly teamCreationKeyRetention: Duration
  readonly purgeSigningKey: SigningKey
}

/** 本节点只消费账号能力的两个读面（契约 S-4：S-18 读账号、S-17 校验登录状态），不多 inject 一个方法。 */
export type AccountsReadFace = Pick<AccountsService, 'read'>
export type LoginsVerifyFace = Pick<LoginsService, 'verify'>

export interface Deps {
  readonly storage: Storage
  readonly clock: Clock
  readonly accounts: AccountsReadFace
  readonly logins: LoginsVerifyFace
  readonly config: ResolvedConfig
  readonly logger: Logger
  /** 提交之后的通知派发（S-40）：不等待、不读返回值；监听者抛出只记日志，不改已提交的事实。 */
  notify<K extends OrganizationGovernanceEventName>(
    name: K,
    payload: OrganizationGovernanceEventPayload<K>,
  ): void
}

/** `StorageUnavailable` ⇒ `unavailable`；其余异常（缺陷、未按契约分支处理的约束冲突）原样上抛，没有 catch-all。 */
export async function withStorage<T>(
  work: () => Promise<T>,
): Promise<T | { readonly failure: 'unavailable' }> {
  try {
    return await work()
  } catch (error) {
    return mapStorageError(error, 'unavailable')
  }
}

export type AccountFacts =
  | { readonly ok: { readonly activated: boolean; readonly retentionExpired: boolean } }
  | { readonly failure: 'accountDoesNotExist' | 'invalidInput' | 'unavailable' }

/**
 * 账号读面（AI S-18）的三个失败出口映射到本契约：`account-not-found` ⇒ `accountDoesNotExist`（成立的结论）；
 * `storage-unavailable` ⇒ `unavailable`（没有结论）；`invalid-input` ⇒ `invalidInput`——本节点已先做过同一条
 * IV S-31 的表示层校验，这一支对类型正确的调用到不了，前提失效时收场仍是 `invalidInput`（与 S-4 第三行同一口径）。
 * **不得在本节点的存储事务里调用**：`accounts.read` 自己是 AI 的一次提交，嵌套 ⇒ `StorageDefect`。
 */
export async function readAccountFacts(deps: Deps, account: AccountId): Promise<AccountFacts> {
  const result = await deps.accounts.read(account)
  if ('ok' in result) return result
  switch (result.failure) {
    case 'account-not-found':
      return { failure: 'accountDoesNotExist' }
    case 'storage-unavailable':
      return { failure: 'unavailable' }
    case 'invalid-input':
      return { failure: 'invalidInput' }
  }
}
