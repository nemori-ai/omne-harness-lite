// 四个服务面共用的依赖与助手。插件体每次运行建一份；事实都在存储里，这里不持有任何事实。
import type { AccountsService, LoginsService } from '@omne-harness-lite/account-identity'
import type { AccountId, SigningKey } from '@omne-harness-lite/identity-values'
import type { Clock, Duration } from '@omne-harness-lite/offer-expiry'
import {
  mapStorageError,
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import type {
  OrganizationGovernanceEventName,
  OrganizationGovernanceEventPayload,
} from '@omne-harness-lite/organization-governance'

/** 加载时校验过的政策参数。 */
export interface ResolvedConfig {
  readonly invitationTtlDefault: Duration
  readonly affiliationRequestTtlDefault: Duration
  readonly teamCreationKeyRetention: Duration
  readonly purgeSigningKey: SigningKey
}

/** 本节点只消费账号能力的两个读面（契约 S-4：S-18 读账号、S-17 校验登录状态），不多 inject 一个方法。 */
export type AccountsReadFace = Pick<AccountsService, 'participate'>
export type LoginsVerifyFace = Pick<LoginsService, 'participate'>

export interface Deps {
  readonly storage: AtomicStorage
  readonly clock: Clock
  readonly accounts: AccountsReadFace
  readonly logins: LoginsVerifyFace
  readonly config: ResolvedConfig
  readonly logger: {
    error(message: string, ...values: unknown[]): void
    info(message: string, ...values: unknown[]): void
  }
  /** 提交之后的通知派发（S-40）：不等待、不读返回值；监听者抛出只记日志，不改已提交的事实。 */
  notify<K extends OrganizationGovernanceEventName>(
    name: K,
    payload: OrganizationGovernanceEventPayload<K>,
  ): void
}

/** 内部显式参与上下文，不是具有独立提交语义的Storage。 */
export interface OperationContext extends Pick<Deps, 'clock' | 'config' | 'logger' | 'notify'> {
  readonly query: StorageUnit['query']
  readonly mutate: StorageUnit['mutate']
  readonly accounts: ReturnType<AccountsService['participate']>
  readonly logins: ReturnType<LoginsService['participate']>
}

export async function withParticipation<T>(
  deps: Deps,
  unit: StorageUnit,
  work: (context: OperationContext) => Promise<T>,
): Promise<T> {
  unit.assertStorage(deps.storage)
  return unit.run(async () => {
    const result = await work({
      query: fn => unit.query(fn),
      mutate: fn => unit.mutate(fn),
      accounts: deps.accounts.participate(unit),
      logins: deps.logins.participate(unit),
      clock: deps.clock,
      config: deps.config,
      logger: deps.logger,
      notify: (name, payload) => unit.afterCommit(() => deps.notify(name, payload)),
    })
    // Clock/dependency unavailability is also fatal to any earlier staged effects.
    if (
      typeof result === 'object' &&
      result !== null &&
      'failure' in result &&
      result.failure === 'unavailable'
    ) {
      throw new StorageUnavailable('organization-governance: required observation unavailable')
    }
    return result
  })
}

/** 只有普通独立提交的最终出口可以转换异常。参与操作必须让异常污染并退出外层。 */
export async function withOperation<T>(
  deps: Deps,
  work: (context: OperationContext) => Promise<T>,
): Promise<T | { readonly failure: 'unavailable' }> {
  try {
    return await deps.storage.atomic(unit => withParticipation(deps, unit, work))
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
 * 通过AI参与面在同一个StorageUnit读取，不能重新调用普通独立读面。
 */
export async function readAccountFacts(
  deps: OperationContext,
  account: AccountId,
): Promise<AccountFacts> {
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
