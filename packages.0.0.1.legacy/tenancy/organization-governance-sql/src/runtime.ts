import type { AccountId } from '@omne-harness-lite/identity-values'
import { mapStorageError, StorageUnavailable } from '@omne-harness-lite/storage'
import type { PolicyDeps } from './policy-deps.ts'
import type { OrgDataUnit, OrgParticipants } from './governance-data.ts'
/** 内部显式参与上下文，不是具有独立提交语义的Storage。 */
export interface OperationContext extends Pick<
  PolicyDeps,
  'clock' | 'config' | 'logger' | 'notify'
> {
  readonly query: OrgDataUnit['query']
  readonly mutate: OrgDataUnit['mutate']
  readonly accounts: OrgParticipants['accounts']
  readonly logins: OrgParticipants['logins']
}

export async function withParticipation<T>(
  deps: PolicyDeps,
  unit: OrgDataUnit,
  work: (context: OperationContext) => Promise<T>,
): Promise<T> {
  return unit.run(async faces => {
    const result = await work({
      query: fn => unit.query(fn),
      mutate: fn => unit.mutate(fn),
      accounts: faces.accounts,
      logins: faces.logins,
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
  deps: PolicyDeps,
  work: (context: OperationContext) => Promise<T>,
): Promise<T | { readonly failure: 'unavailable' }> {
  try {
    return await deps.persistence.atomic(unit => withParticipation(deps, unit, work))
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
